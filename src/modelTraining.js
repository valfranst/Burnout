'use strict';

/**
 * Engine de análise de burnout com TensorFlow.js
 *
 * Módulos:
 *  - Normalização Min-Max dos dados de entrada (tf.Tensor)
 *  - Classificação: risco (Low / Medium / High)
 *  - Regressão: pontuação contínua de burnout (0-100)
 *  - Agrupamento K-Means: arquétipos comportamentais
 *  - Análise temporal: trajetória de 90 dias
 *  - Anomalias e causalidade: picos de fadiga e eficácia de intervenções
 */

let tf;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (_e) {
  tf = require('@tensorflow/tfjs');
}

let _globalCtx = {};
let _model = null;

// ------------------------------------------------------------
/*
Limites do dataset para normalização Min-Max
Ordem: [day_type_bin, 
        work_hours, 
        screen_time_hours, 
        meetings_count,
        breaks_taken, 
        after_hours_work_bin, 
        app_switches, 
        sleep_hours,
        isolation_index, 
        task_completion, 
        fatigue_score]
*/
const FEATURE_MINS = [0, 0.5, 0, 0, 0, 0, 0, 2, 3, 0, 0];
const FEATURE_MAXS = [1, 18, 18, 16, 20, 1, 10, 10, 9, 100, 10];

// Valor padrão para task_completion quando não fornecido pelo usuário (mediana do dataset)
const DEFAULT_TASK_COMPLETION = 80;

/*
  Converte um log bruto em array de features numéricas.
  Ordem: [day_type_bin, work_hours, screen_time_hours, meetings_count,
          breaks_taken, after_hours_work_bin, app_switches, sleep_hours,
          isolation_index, task_completion, fatigue_score]
 */
function logToFeatures(registro) {
  return [
    registro.day_type === 'Weekday' ? 1 : 0,
    registro.work_hours,
    registro.screen_time_hours,
    registro.meetings_count,
    registro.breaks_taken,
    registro.after_hours_work ? 1 : 0,
    registro.app_switches,
    registro.sleep_hours,
    registro.isolation_index,
    registro.task_completion != null ? registro.task_completion : DEFAULT_TASK_COMPLETION,
    registro.fatigue_score,
  ];
}

/**
 * Normalização Min-Max via TensorFlow.js: transforma cada feature para [0, 1].
 * Retorna um array JavaScript (não um tensor) para facilitar persistência.
 */
function minMaxNormalize(features) {
  const featureTensor = tf.tensor1d(features);
  const minTensor = tf.tensor1d(FEATURE_MINS);
  const maxTensor = tf.tensor1d(FEATURE_MAXS);
  const rangeTensor = maxTensor.sub(minTensor);
  const normalized = featureTensor.sub(minTensor).div(rangeTensor);
  const result = Array.from(normalized.dataSync());
  // Libera memória dos tensores
  [featureTensor, minTensor, maxTensor, rangeTensor, normalized].forEach((t) => t.dispose());
  return result;
}

/**
 * Calcula a pontuação de burnout contínua (0-100) via regressão linear ponderada com TF.js.
 * Pesos derivados da importância relativa das features no dataset de referência.
 * Aceita pesos e bias customizados opcionais para experimentação via interface.
 */
function calculateBurnoutScore(normalized, customWeights, customBias) {
  // Pesos calibrados para gerar escores no intervalo 0-100 com bias de 15 (baseline)
  // Importâncias relativas: fatigue_score(28%), work_hours(12%), sleep_hours(-14%),
  // isolation_index(12%), screen_time_hours(10%), task_completion(-8%),
  // meetings_count(8%), app_switches(8%), breaks_taken(-10%),
  // after_hours_work(5%), day_type(2%)
  const defaultWeights = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
  const weights = Array.isArray(customWeights) && customWeights.length === 11 ? customWeights : defaultWeights;
  const bias = customBias != null ? customBias : 15;
  const normTensor = tf.tensor1d(normalized);
  const wTensor = tf.tensor1d(weights);
  const dot = normTensor.mul(wTensor).sum().arraySync();
  [normTensor, wTensor].forEach((t) => t.dispose());
  const raw = dot + bias;
  return Math.min(100, Math.max(0, parseFloat(raw.toFixed(2))));
}

/**
 * Classificação de risco de burnout baseada na pontuação contínua.
 * Thresholds calibrados para o intervalo de saída do modelo (0-78).
 */
function classifyRisk(burnoutScore) {
  if (burnoutScore < 25) return 'Low';
  if (burnoutScore < 45) return 'Medium';
  return 'High';
}

/**
 * Agrupamento K-Means simplificado (3 iterações, 4 centróides pré-calibrados).
 * Arquétipos: Equilibrado, Sobrecarregado, Isolado, Alta Autonomia.
 */
const CENTROIDS = {
  Equilibrado:      [0.5, 0.35, 0.30, 0.15, 0.45, 0.05, 0.08, 0.70, 0.20, 0.80, 0.25],
  Sobrecarregado:   [0.5, 0.75, 0.70, 0.55, 0.15, 0.80, 0.45, 0.35, 0.50, 0.55, 0.75],
  Isolado:          [0.0, 0.40, 0.35, 0.10, 0.30, 0.20, 0.12, 0.50, 0.85, 0.60, 0.55],
  AltaAutonomia:    [0.5, 0.50, 0.45, 0.25, 0.55, 0.30, 0.20, 0.65, 0.25, 0.75, 0.30],
};

function euclideanDistance(a, b) {
  const ta = tf.tensor1d(a);
  const tb = tf.tensor1d(b);
  const dist = ta.sub(tb).square().sum().sqrt().arraySync();
  [ta, tb].forEach((t) => t.dispose());
  return dist;
}

function assignArchetype(normalized) {
  let best = null;
  let minDist = Infinity;
  for (const [label, centroid] of Object.entries(CENTROIDS)) {
    const dist = euclideanDistance(normalized, centroid);
    if (dist < minDist) {
      minDist = dist;
      best = label;
    }
  }
  return best;
}

/**
 * Análise principal de um log individual.
 * Retorna: features brutas, features normalizadas, pontuação, risco e arquétipo.
 */
function analyzeLog(log) {
  const features = logToFeatures(log);
  const normalized = minMaxNormalize(features);
  const burnoutScore = calculateBurnoutScore(normalized);
  const burnoutRisk = classifyRisk(burnoutScore);
  const archetype = assignArchetype(normalized);

  return {
    features,
    normalized,
    burnoutScore,
    burnoutRisk,
    archetype,
  };
}

/**
 * Análise temporal: tendência de burnout nos últimos 90 dias.
 * Recebe array de { created_at, burnout_score }.
 * Retorna: médias semanais, tendência (improving/stable/worsening) e delta.
 */
function analyzeTemporalTrend(records) {
  if (!records || records.length === 0) {
    return { weeklyAverages: [], trend: 'stable', delta: 0 };
  }

  const sorted = [...records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Agrupa por semana
  const weeks = {};
  for (const r of sorted) {
    const d = new Date(r.created_at);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = [];
    weeks[key].push(r.burnout_score);
  }

  const weeklyAverages = Object.entries(weeks).map(([week, scores]) => ({
    week,
    avg: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2)),
  }));

  const n = weeklyAverages.length;
  let trend = 'stable';
  let delta = 0;

  if (n >= 2) {
    const first = weeklyAverages.slice(0, Math.ceil(n / 2));
    const last = weeklyAverages.slice(Math.floor(n / 2));
    const avgFirst = first.reduce((s, w) => s + w.avg, 0) / first.length;
    const avgLast = last.reduce((s, w) => s + w.avg, 0) / last.length;
    delta = parseFloat((avgLast - avgFirst).toFixed(2));
    if (delta > 5) trend = 'worsening';
    else if (delta < -5) trend = 'improving';
  }

  return { weeklyAverages, trend, delta };
}

/**
 * Detecção de anomalias: identifica picos de fadiga acima de 2 desvios padrão.
 * Recebe array de { created_at, fatigue_score }.
 */
function detectAnomalies(records) {
  if (!records || records.length < 3) return [];

  const scores = records.map((r) => r.fatigue_score);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
  const threshold = mean + 2 * std;

  return records
    .filter((r) => r.fatigue_score > threshold)
    .map((r) => ({
      created_at: r.created_at,
      fatigue_score: r.fatigue_score,
      zscore: parseFloat(((r.fatigue_score - mean) / std).toFixed(2)),
    }));
}

/**
 * Análise de causalidade de intervenções:
 * compara a pontuação média de burnout antes e depois de dias com mais pausas.
 * Recebe array de { created_at, burnout_score, breaks_taken }.
 */
function analyzeInterventions(records) {
  if (!records || records.length < 4) return null;

  const sorted = [...records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const avgBreaks = sorted.reduce((s, r) => s + r.breaks_taken, 0) / sorted.length;

  const highBreakDays = new Set(
    sorted.filter((r) => r.breaks_taken > avgBreaks).map((r) => r.created_at.toString())
  );

  const scoresAfterHighBreak = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (highBreakDays.has(sorted[i].created_at.toString())) {
      scoresAfterHighBreak.push(sorted[i + 1].burnout_score);
    }
  }

  const scoresAfterLowBreak = sorted
    .filter((r) => !highBreakDays.has(r.created_at.toString()))
    .map((r) => r.burnout_score);

  if (scoresAfterHighBreak.length === 0 || scoresAfterLowBreak.length === 0) return null;

  const avgAfterHigh = scoresAfterHighBreak.reduce((s, v) => s + v, 0) / scoresAfterHighBreak.length;
  const avgAfterLow = scoresAfterLowBreak.reduce((s, v) => s + v, 0) / scoresAfterLowBreak.length;

  return {
    avgScoreAfterHighBreakDay: parseFloat(avgAfterHigh.toFixed(2)),
    avgScoreAfterLowBreakDay: parseFloat(avgAfterLow.toFixed(2)),
    interventionEffect: parseFloat((avgAfterLow - avgAfterHigh).toFixed(2)),
    effective: avgAfterLow > avgAfterHigh,
  };
}

// ============================================================
// 🧠 Pipeline de treinamento local com TensorFlow.js
// ============================================================

/**
 * Constrói contexto dinâmico a partir dos registros do banco.
 * Calcula min/max reais de cada feature para normalização durante treinamento.
 */
function makeContextFromRecords(records) {
  const numFeatures = FEATURE_MINS.length;
  const mins = new Array(numFeatures).fill(Infinity);
  const maxs = new Array(numFeatures).fill(-Infinity);

  for (const record of records) {
    const features = logToFeatures(record);
    for (let i = 0; i < numFeatures; i++) {
      if (features[i] < mins[i]) mins[i] = features[i];
      if (features[i] > maxs[i]) maxs[i] = features[i];
    }
  }

  // Evita divisão por zero quando min === max
  for (let i = 0; i < numFeatures; i++) {
    if (maxs[i] === mins[i]) maxs[i] = mins[i] + 1;
  }

  return { mins, maxs, numFeatures };
}

/**
 * Normaliza um vetor de features usando o contexto dinâmico do treinamento.
 * Valores fora do intervalo são clampados para [0, 1].
 */
function normalizeWithContext(features, context) {
  const ft = tf.tensor1d(features);
  const mn = tf.tensor1d(context.mins);
  const mx = tf.tensor1d(context.maxs);
  const range = mx.sub(mn);
  const norm = ft.sub(mn).div(range).clipByValue(0, 1);
  const result = Array.from(norm.dataSync());
  [ft, mn, mx, range, norm].forEach((t) => t.dispose());
  return result;
}

/**
 * Gera tensores de treinamento a partir dos registros do banco.
 * Label: burnout_score normalizado para [0, 1] (regressão).
 */
function createTrainingData(records, context) {
  const inputs = [];
  const labels = [];

  for (const record of records) {
    const features = logToFeatures(record);
    const normalized = normalizeWithContext(features, context);
    inputs.push(normalized);
    // Label: burnout_score normalizado (0–100 → 0–1)
    labels.push(Math.min(1, Math.max(0, (Number(record.burnout_score) || 0) / 100)));
  }

  return {
    xs: tf.tensor2d(inputs),
    ys: tf.tensor2d(labels, [labels.length, 1]),
    inputDimension: context.numFeatures,
  };
}

/**
 * Calcula a "acurácia de classificação de risco":
 * percentual de predições cuja classe (Low/Medium/High) coincide com a real.
 */
function computeRiskAccuracy(model, xs, actualScoresNorm) {
  const preds = model.predict(xs);
  const predValues = Array.from(preds.dataSync());
  preds.dispose();

  let correct = 0;
  for (let i = 0; i < predValues.length; i++) {
    if (classifyRisk(predValues[i] * 100) === classifyRisk(actualScoresNorm[i] * 100)) {
      correct++;
    }
  }
  return predValues.length > 0 ? correct / predValues.length : 0;
}

/**
 * Configura e treina a rede neural sequencial.
 * Arquitetura: 11 → 128 → 64 → 32 → 1 (sigmoid)
 * Loss: meanSquaredError | Métrica: acurácia de classificação de risco
 *
 * Camadas:
 *  - Entrada (128 neurônios, ReLU): detecta padrões amplos nas 11 features
 *  - Oculta 1 (64, ReLU): comprime e combina padrões relevantes
 *  - Oculta 2 (32, ReLU): destila as informações mais importantes
 *  - Saída (1, sigmoid): score contínuo 0–1 (burnout normalizado)
 */
async function configureNeuralNetAndTrain(trainData, valData, trainScores, valScores, epochs) {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [trainData.inputDimension],
      units: 128,
      activation: 'relu',
    })
  );

  model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
  });

  const metrics = { epochs: [], trainLoss: [], valLoss: [], trainAcc: [], valAcc: [] };

  await model.fit(trainData.xs, trainData.ys, {
    epochs,
    batchSize: 32,
    shuffle: true,
    verbose: 0,
    validationData: valData ? [valData.xs, valData.ys] : undefined,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        metrics.epochs.push(epoch + 1);
        metrics.trainLoss.push(parseFloat(logs.loss.toFixed(4)));

        // Acurácia de classificação de risco (treino)
        const tAcc = computeRiskAccuracy(model, trainData.xs, trainScores);
        metrics.trainAcc.push(parseFloat(tAcc.toFixed(4)));

        if (valData && logs.val_loss != null) {
          metrics.valLoss.push(parseFloat(logs.val_loss.toFixed(4)));
          const vAcc = computeRiskAccuracy(model, valData.xs, valScores);
          metrics.valAcc.push(parseFloat(vAcc.toFixed(4)));
        }
      },
    },
  });

  return { model, metrics };
}

/**
 * Pipeline completo de treinamento.
 * Recebe registros do banco, faz split 80/20, treina a rede neural
 * e retorna as métricas reais (epochs, trainLoss, valLoss, trainAcc, valAcc).
 *
 * @param {Array} records  – registros da tabela burnout (com burnout_score)
 * @param {Object} options – { epochs: 30 }
 * @returns {Object} métricas de treinamento
 */
async function trainModel(records, options = {}) {
  const { epochs = 30 } = options;

  // 1. Contexto dinâmico (min/max reais de cada feature)
  const context = makeContextFromRecords(records);

  // 2. Embaralha e divide 80/20 treino/validação
  const shuffled = [...records].sort(() => Math.random() - 0.5);
  const splitIdx = Math.max(1, Math.floor(shuffled.length * 0.8));
  const trainRecords = shuffled.slice(0, splitIdx);
  const valRecords = shuffled.slice(splitIdx);

  // 3. Cria tensores de treino e validação
  const trainData = createTrainingData(trainRecords, context);
  const valData = valRecords.length > 0 ? createTrainingData(valRecords, context) : null;

  // Scores brutos normalizados para cálculo de acurácia
  const trainScores = trainRecords.map((r) =>
    Math.min(1, Math.max(0, (Number(r.burnout_score) || 0) / 100))
  );
  const valScores = valRecords.map((r) =>
    Math.min(1, Math.max(0, (Number(r.burnout_score) || 0) / 100))
  );

  // 4. Treina a rede neural
  const { model, metrics } = await configureNeuralNetAndTrain(
    trainData, valData, trainScores, valScores, epochs
  );

  // 5. Armazena modelo e contexto globalmente para predições futuras
  _model = model;
  _globalCtx = context;

  // 6. Limpeza de tensores
  trainData.xs.dispose();
  trainData.ys.dispose();
  if (valData) {
    valData.xs.dispose();
    valData.ys.dispose();
  }

  return metrics;
}

/**
 * Predição usando o modelo treinado.
 * Se não houver modelo treinado, usa a análise estática como fallback.
 */
function predictWithModel(logData) {
  if (!_model || !_globalCtx.mins) {
    return analyzeLog(logData);
  }

  const features = logToFeatures(logData);
  const normalized = normalizeWithContext(features, _globalCtx);
  const inputTensor = tf.tensor2d([normalized]);
  const prediction = _model.predict(inputTensor);
  const rawScore = prediction.dataSync()[0];
  inputTensor.dispose();
  prediction.dispose();

  // Converte saída sigmoid (0–1) para escala de burnout (0–100)
  const burnoutScore = parseFloat((rawScore * 100).toFixed(2));
  const burnoutRisk = classifyRisk(burnoutScore);
  const archetype = assignArchetype(normalized);

  return {
    features,
    normalized,
    burnoutScore,
    burnoutRisk,
    archetype,
    modelUsed: true,
  };
}

module.exports = {
  logToFeatures,
  minMaxNormalize,
  calculateBurnoutScore,
  classifyRisk,
  assignArchetype,
  analyzeLog,
  analyzeTemporalTrend,
  detectAnomalies,
  analyzeInterventions,
  trainModel,
  predictWithModel,
};

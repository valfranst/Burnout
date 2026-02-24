/* ============================================================
   modelTraining.js — Engine de análise de burnout com TensorFlow.js
   Executa inteiramente no navegador (client-side).

   Módulos:
    - Normalização Min-Max dos dados de entrada
    - Classificação: risco (Low / Medium / High)
    - Regressão: pontuação contínua de burnout (0-100)
    - Agrupamento K-Means: arquétipos comportamentais
    - Treinamento da rede neural com TF.js no browser
   ============================================================ */
const ModelTraining = (() => {
  'use strict';

  // ------------------------------------------------------------
  // Limites do dataset para normalização Min-Max
  // Ordem: [day_type_bin, work_hours, screen_time_hours, meetings_count,
  //         breaks_taken, after_hours_work_bin, app_switches, sleep_hours,
  //         isolation_index, task_completion, fatigue_score]
  const FEATURE_MINS = [0, 0.5, 0, 0, 0, 0, 0, 2, 3, 0, 0];
  const FEATURE_MAXS = [1, 18, 18, 16, 20, 1, 10, 10, 9, 100, 10];
  const DEFAULT_TASK_COMPLETION = 80;

  // Centróides K-Means pré-calibrados
  const CENTROIDS = {
    Equilibrado:    [0.5, 0.35, 0.30, 0.15, 0.45, 0.05, 0.08, 0.70, 0.20, 0.80, 0.25],
    Sobrecarregado: [0.5, 0.75, 0.70, 0.55, 0.15, 0.80, 0.45, 0.35, 0.50, 0.55, 0.75],
    Isolado:        [0.0, 0.40, 0.35, 0.10, 0.30, 0.20, 0.12, 0.50, 0.85, 0.60, 0.55],
    AltaAutonomia:  [0.5, 0.50, 0.45, 0.25, 0.55, 0.30, 0.20, 0.65, 0.25, 0.75, 0.30],
  };

  // Estado interno
  let _model = null;
  let _globalCtx = {};

  // ---- Funções utilitárias ----

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

  function minMaxNormalize(features) {
    const featureTensor = tf.tensor1d(features);
    const minTensor = tf.tensor1d(FEATURE_MINS);
    const maxTensor = tf.tensor1d(FEATURE_MAXS);
    const rangeTensor = maxTensor.sub(minTensor);
    const normalized = featureTensor.sub(minTensor).div(rangeTensor);
    const result = Array.from(normalized.dataSync());
    [featureTensor, minTensor, maxTensor, rangeTensor, normalized].forEach(t => t.dispose());
    return result;
  }

  function calculateBurnoutScore(normalized, customWeights, customBias) {
    const defaultWeights = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
    const weights = Array.isArray(customWeights) && customWeights.length === 11 ? customWeights : defaultWeights;
    const bias = customBias != null ? customBias : 15;
    const normTensor = tf.tensor1d(normalized);
    const wTensor = tf.tensor1d(weights);
    const dot = normTensor.mul(wTensor).sum().arraySync();
    [normTensor, wTensor].forEach(t => t.dispose());
    const raw = dot + bias;
    return Math.min(100, Math.max(0, parseFloat(raw.toFixed(2))));
  }

  function classifyRisk(burnoutScore) {
    if (burnoutScore < 25) return 'Low';
    if (burnoutScore < 45) return 'Medium';
    return 'High';
  }

  function euclideanDistance(a, b) {
    const ta = tf.tensor1d(a);
    const tb = tf.tensor1d(b);
    const dist = ta.sub(tb).square().sum().sqrt().arraySync();
    [ta, tb].forEach(t => t.dispose());
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

  function analyzeLog(log) {
    const features = logToFeatures(log);
    const normalized = minMaxNormalize(features);
    const burnoutScore = calculateBurnoutScore(normalized);
    const burnoutRisk = classifyRisk(burnoutScore);
    const archetype = assignArchetype(normalized);
    return { features, normalized, burnoutScore, burnoutRisk, archetype };
  }

  // ---- Pipeline de treinamento no browser ----

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
    for (let i = 0; i < numFeatures; i++) {
      if (maxs[i] === mins[i]) maxs[i] = mins[i] + 1;
    }
    return { mins, maxs, numFeatures };
  }

  function normalizeWithContext(features, context) {
    const ft = tf.tensor1d(features);
    const mn = tf.tensor1d(context.mins);
    const mx = tf.tensor1d(context.maxs);
    const range = mx.sub(mn);
    const norm = ft.sub(mn).div(range).clipByValue(0, 1);
    const result = Array.from(norm.dataSync());
    [ft, mn, mx, range, norm].forEach(t => t.dispose());
    return result;
  }

  function createTrainingData(records, context) {
    const inputs = [];
    const labels = [];
    for (const record of records) {
      const features = logToFeatures(record);
      const normalized = normalizeWithContext(features, context);
      inputs.push(normalized);
      labels.push(Math.min(1, Math.max(0, (Number(record.burnout_score) || 0) / 100)));
    }
    return {
      xs: tf.tensor2d(inputs),
      ys: tf.tensor2d(labels, [labels.length, 1]),
      inputDimension: context.numFeatures,
    };
  }

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
   * Treina a rede neural no browser.
   * @param {Array} records — registros do banco
   * @param {Object} options — { epochs, onEpochEnd, onLog }
   * @returns {Object} métricas de treinamento
   */
  async function trainModel(records, options = {}) {
    const { epochs = 30, onEpochEnd = null, onLog = null } = options;

    const log = (msg) => { if (onLog) onLog(msg); };

    log(`[Treinamento] Iniciando com ${records.length} registros, ${epochs} épocas...`);

    // 1. Contexto dinâmico
    const context = makeContextFromRecords(records);
    log(`[Treinamento] Contexto de normalização calculado (${context.numFeatures} features).`);

    // 2. Embaralha e divide 80/20
    const shuffled = [...records].sort(() => Math.random() - 0.5);
    const splitIdx = Math.max(1, Math.floor(shuffled.length * 0.8));
    const trainRecords = shuffled.slice(0, splitIdx);
    const valRecords = shuffled.slice(splitIdx);

    log(`[Treinamento] Split: ${trainRecords.length} treino / ${valRecords.length} validação.`);

    // 3. Cria tensores
    const trainData = createTrainingData(trainRecords, context);
    const valData = valRecords.length > 0 ? createTrainingData(valRecords, context) : null;

    const trainScores = trainRecords.map(r => Math.min(1, Math.max(0, (Number(r.burnout_score) || 0) / 100)));
    const valScores = valRecords.map(r => Math.min(1, Math.max(0, (Number(r.burnout_score) || 0) / 100)));

    // 4. Monta modelo sequencial
    log('[Treinamento] Construindo rede neural: 11 → 32 (L2+dropout) → 16 (L2+dropout) → 1 (sigmoid)...');
    const model = tf.sequential();
    model.add(tf.layers.dense({
      inputShape: [trainData.inputDimension],
      units: 32,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });

    const metrics = { epochs: [], trainLoss: [], valLoss: [], trainAcc: [], valAcc: [] };

    log('[Treinamento] Iniciando fit...');

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

          const tAcc = computeRiskAccuracy(model, trainData.xs, trainScores);
          metrics.trainAcc.push(parseFloat(tAcc.toFixed(4)));

          let vAcc = null;
          if (valData && logs.val_loss != null) {
            metrics.valLoss.push(parseFloat(logs.val_loss.toFixed(4)));
            vAcc = computeRiskAccuracy(model, valData.xs, valScores);
            metrics.valAcc.push(parseFloat(vAcc.toFixed(4)));
          }

          const epochMsg = `  Época ${epoch + 1}/${epochs} — loss: ${logs.loss.toFixed(4)}` +
            (logs.val_loss != null ? ` | val_loss: ${logs.val_loss.toFixed(4)}` : '') +
            ` | acc: ${tAcc.toFixed(4)}` +
            (vAcc != null ? ` | val_acc: ${vAcc.toFixed(4)}` : '');
          log(epochMsg);

          if (onEpochEnd) onEpochEnd(epoch + 1, epochs, metrics);
        },
      },
    });

    // 5. Armazena modelo e contexto
    // Descarta modelo anterior para evitar memory leak de tensores
    if (_model && typeof _model.dispose === 'function') {
      _model.dispose();
    }
    _model = model;
    _globalCtx = context;

    // 6. Limpeza
    trainData.xs.dispose();
    trainData.ys.dispose();
    if (valData) { valData.xs.dispose(); valData.ys.dispose(); }

    log('[Treinamento] Concluído com sucesso!');
    return metrics;
  }

  /**
   * Predição usando o modelo treinado no browser.
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

    const burnoutScore = parseFloat((rawScore * 100).toFixed(2));
    const burnoutRisk = classifyRisk(burnoutScore);
    const archetype = assignArchetype(normalized);

    return { features, normalized, burnoutScore, burnoutRisk, archetype, modelUsed: true };
  }

  /**
   * Análise estática com pesos customizáveis (sem rede neural).
   */
  function analyzeStatic(logData, customWeights, customBias) {
    const features = logToFeatures(logData);
    const norm = minMaxNormalize(features);
    const defaultWeights = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
    const weights = Array.isArray(customWeights) && customWeights.length === 11 ? customWeights.map(Number) : defaultWeights;
    const bias = customBias != null ? Number(customBias) : 15;
    const score = calculateBurnoutScore(norm, weights, bias);
    const risk = classifyRisk(score);
    const arch = assignArchetype(norm);
    return {
      burnoutScore: score, burnoutRisk: risk, archetype: arch,
      normalized: norm, modelUsed: false,
      weightsUsed: weights, biasUsed: bias,
    };
  }

  /**
   * Computa estatísticas do dataset (distribuição de risco, arquétipos, média).
   */
  function computeDatasetStats(records) {
    const riskDist = { Low: 0, Medium: 0, High: 0 };
    const archetypeDist = {};
    let scoreSum = 0;

    for (const r of records) {
      if (r.burnout_risk) riskDist[r.burnout_risk] = (riskDist[r.burnout_risk] || 0) + 1;
      if (r.archetype) archetypeDist[r.archetype] = (archetypeDist[r.archetype] || 0) + 1;
      scoreSum += Number(r.burnout_score) || 0;
    }

    const avgScore = records.length > 0
      ? parseFloat((scoreSum / records.length).toFixed(2))
      : null;

    return { totalRecords: records.length, avgBurnoutScore: avgScore, riskDistribution: riskDist, archetypeDistribution: archetypeDist };
  }

  // API pública
  return {
    logToFeatures,
    minMaxNormalize,
    calculateBurnoutScore,
    classifyRisk,
    assignArchetype,
    analyzeLog,
    trainModel,
    predictWithModel,
    analyzeStatic,
    computeDatasetStats,
  };
})();

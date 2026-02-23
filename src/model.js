'use strict';

/**
 * model.js - Engine de análise de burnout com TensorFlow.js
 *
 * Módulos:
 *  - Normalização Min-Max dos dados de entrada (tf.Tensor)
 *  - Classificação: risco (Low / Medium / High)
 *  - Regressão: pontuação contínua de burnout (0-100)
 *  - Agrupamento K-Means: arquétipos comportamentais
 *  - Análise temporal: trajetória de 90 dias
 *  - Anomalias e causalidade: picos de fadiga e eficácia de intervenções
 */

// Usa o backend Node.js (GPU/WASM acelerado); cai para CPU puro em builds sem bindings nativos
let tf;
try {
  tf = require('@tensorflow/tfjs-node');
} catch (_e) {
  tf = require('@tensorflow/tfjs');
}

// ------------------------------------------------------------
// Limites do dataset para normalização Min-Max
// Ordem: [day_type_bin, work_hours, screen_time_hours, meetings_count,
//         breaks_taken, after_hours_work_bin, app_switches, sleep_hours,
//         isolation_index, task_completion, fatigue_score]
const FEATURE_MINS = [0, 0.5, 0, 0, 0, 0, 0, 0, 3, 0, 0];
const FEATURE_MAXS = [1, 18, 18, 30, 20, 1, 500, 12, 9, 100, 10];

// Valor padrão para task_completion quando não fornecido pelo usuário (mediana do dataset)
const DEFAULT_TASK_COMPLETION = 80;

/**
 * Converte um log bruto em array de features numéricas.
 * Ordem: [day_type_bin, work_hours, screen_time_hours, meetings_count,
 *         breaks_taken, after_hours_work_bin, app_switches, sleep_hours,
 *         isolation_index, task_completion, fatigue_score]
 */
function logToFeatures(log) {
  return [
    log.day_type === 'Weekday' ? 1 : 0,
    log.work_hours,
    log.screen_time_hours,
    log.meetings_count,
    log.breaks_taken,
    log.after_hours_work ? 1 : 0,
    log.app_switches,
    log.sleep_hours,
    log.isolation_index,
    log.task_completion != null ? log.task_completion : DEFAULT_TASK_COMPLETION,
    log.fatigue_score,
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
 */
function calculateBurnoutScore(normalized) {
  // Pesos calibrados para gerar escores no intervalo 0-100 com bias de 15 (baseline)
  // Importâncias relativas: fatigue_score(28%), work_hours(12%), sleep_hours(-14%),
  // isolation_index(12%), screen_time_hours(10%), task_completion(-8%),
  // meetings_count(8%), app_switches(8%), breaks_taken(-10%),
  // after_hours_work(5%), day_type(2%)
  const weights = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
  const bias = 15;
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
 * Recebe array de { data_registro, burnout_score }.
 * Retorna: médias semanais, tendência (improving/stable/worsening) e delta.
 */
function analyzeTemporalTrend(records) {
  if (!records || records.length === 0) {
    return { weeklyAverages: [], trend: 'stable', delta: 0 };
  }

  const sorted = [...records].sort((a, b) => new Date(a.data_registro) - new Date(b.data_registro));

  // Agrupa por semana
  const weeks = {};
  for (const r of sorted) {
    const d = new Date(r.data_registro);
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
 * Recebe array de { data_registro, fatigue_score }.
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
      data_registro: r.data_registro,
      fatigue_score: r.fatigue_score,
      zscore: parseFloat(((r.fatigue_score - mean) / std).toFixed(2)),
    }));
}

/**
 * Análise de causalidade de intervenções:
 * compara a pontuação média de burnout antes e depois de dias com mais pausas.
 * Recebe array de { data_registro, burnout_score, breaks_taken }.
 */
function analyzeInterventions(records) {
  if (!records || records.length < 4) return null;

  const sorted = [...records].sort((a, b) => new Date(a.data_registro) - new Date(b.data_registro));
  const avgBreaks = sorted.reduce((s, r) => s + r.breaks_taken, 0) / sorted.length;

  const highBreakDays = new Set(
    sorted.filter((r) => r.breaks_taken > avgBreaks).map((r) => r.data_registro.toString())
  );

  const scoresAfterHighBreak = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (highBreakDays.has(sorted[i].data_registro.toString())) {
      scoresAfterHighBreak.push(sorted[i + 1].burnout_score);
    }
  }

  const scoresAfterLowBreak = sorted
    .filter((r) => !highBreakDays.has(r.data_registro.toString()))
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
};

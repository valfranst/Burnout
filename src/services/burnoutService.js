'use strict';

const pool = require('../db');
const burnoutRepo = require('../repositories/burnoutRepository');
const {
  analyzeLog,
  predictWithModel,
  trainModel,
  analyzeTemporalTrend,
  detectAnomalies,
  analyzeInterventions,
} = require('../modelTraining');

/**
 * Service para lógica de negócio de burnout.
 * Orquestra repositório + modelTraining sem misturar SQL nas rotas.
 */

/**
 * Processa um log diário: persiste bruto, executa IA, persiste resultado.
 * Retorna o resultado da análise com metadados.
 */
async function processLog(userId, logInput) {
  const {
    day_type = 'Weekday',
    work_hours, screen_time_hours, meetings_count, app_switches,
    after_hours_work = false, sleep_hours, isolation_index,
    fatigue_score, breaks_taken, task_completion = 80,
    data_registro,
  } = logInput;

  const registrationDate = data_registro || new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Persistir log bruto
    const logId = await burnoutRepo.insertLog(client, {
      userId, day_type, work_hours, screen_time_hours, meetings_count,
      app_switches, after_hours_work, sleep_hours, isolation_index,
      fatigue_score, breaks_taken,
    });

    // 2. Análise de IA
    const logData = {
      day_type, work_hours, screen_time_hours, meetings_count, app_switches,
      after_hours_work, sleep_hours, isolation_index, fatigue_score,
      breaks_taken, task_completion,
    };

    let result = predictWithModel(logData);

    // Se não havia modelo treinado, treina com 200 registros e tenta novamente
    if (!result.modelUsed) {
      const trainingRecords = await burnoutRepo.findRandomForTraining(200);
      if (trainingRecords.length >= 10) {
        await trainModel(trainingRecords);
        result = predictWithModel(logData);
      }
    }

    const { burnoutScore, burnoutRisk, archetype } = result;
    const modelUsed = result.modelUsed || false;

    // 3. Persistir resultado processado
    const burnoutId = await burnoutRepo.insertBurnout(client, {
      userId, logId, day_type, work_hours, screen_time_hours,
      meetings_count, breaks_taken, after_hours_work, app_switches,
      sleep_hours, task_completion, isolation_index, fatigue_score,
      burnoutScore, burnoutRisk, archetype,
    });

    // 4. Marcar log como processado
    await burnoutRepo.markLogProcessed(client, logId);

    await client.query('COMMIT');

    return {
      logId,
      burnoutId,
      burnoutScore,
      burnoutRisk,
      archetype,
      modelUsed,
      registrationDate,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Monta dados do dashboard individual do usuário.
 */
async function getDashboardData(userId) {
  const records = await burnoutRepo.findRecentByUser(userId);
  const total = records.length;
  const avgScore = total > 0
    ? parseFloat((records.reduce((s, r) => s + r.burnout_score, 0) / total).toFixed(2))
    : null;

  // Distribuição de risco
  const riskDist = { Low: 0, Medium: 0, High: 0 };
  for (const r of records) riskDist[r.burnout_risk] = (riskDist[r.burnout_risk] || 0) + 1;

  // Arquétipo dominante
  const archetypeCounts = {};
  for (const r of records) archetypeCounts[r.archetype] = (archetypeCounts[r.archetype] || 0) + 1;
  const dominantArchetype = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const temporal = analyzeTemporalTrend(records);
  const anomalies = detectAnomalies(records);
  const interventions = analyzeInterventions(records);
  const lastRecord = records[records.length - 1] || null;
  const latestRecords = await burnoutRepo.findLatestWithLogs(userId);
  const similarRecords = lastRecord ? await burnoutRepo.findSimilarRecords(userId) : [];

  return {
    summary: {
      totalRecords: total,
      avgBurnoutScore: avgScore,
      riskDistribution: riskDist,
      dominantArchetype,
    },
    lastRecord,
    latestRecords,
    temporal,
    anomalies,
    interventions,
    similarRecords,
  };
}

/**
 * Busca registros para treinamento no browser.
 */
async function getTrainingRecords(n) {
  return burnoutRepo.findRandomForTraining(n);
}

module.exports = {
  processLog,
  getDashboardData,
  getTrainingRecords,
};

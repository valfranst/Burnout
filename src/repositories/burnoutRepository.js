'use strict';

const pool = require('../db');

/**
 * Repository para acesso aos dados de burnout.
 * Centraliza todas as queries SQL relacionadas à tabela burnout e burnout_logs.
 */

/**
 * Busca registros recentes do usuário (últimos 90 dias, com log_id).
 */
async function findRecentByUser(userId, days = 90) {
  const { rows } = await pool.query(
    `SELECT created_at, burnout_score, burnout_risk, archetype,
            fatigue_score, breaks_taken, work_hours, sleep_hours
     FROM burnout
     WHERE user_id = $1
       AND log_id IS NOT NULL
       AND created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
     ORDER BY created_at ASC`,
    [userId, days]
  );
  return rows;
}

/**
 * Busca últimos registros do usuário com join em burnout_logs.
 */
async function findLatestWithLogs(userId) {
  const { rows } = await pool.query(
    `SELECT bl.created_at,
            b.burnout_score,
            b.burnout_risk,
            b.archetype,
            bl.fatigue_score,
            bl.work_hours
     FROM burnout_logs bl
     LEFT JOIN burnout b ON b.log_id = bl.id
     WHERE bl.user_id = $1
     ORDER BY bl.created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Busca registros similares ao último embedding do usuário via pgvector.
 * Retorna lista vazia se o usuário não tiver embedding.
 */
async function findSimilarRecords(userId, limit = 5) {
  const { rows } = await pool.query(
    `WITH user_emb AS (
       SELECT embedding
       FROM burnout
       WHERE user_id = $1 AND log_id IS NOT NULL AND embedding IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1
     )
     SELECT b.id, b.created_at, b.burnout_score, b.burnout_risk, b.archetype,
            b.embedding <-> ue.embedding AS distance
     FROM burnout b, user_emb ue
     WHERE b.user_id != $1
       AND b.embedding IS NOT NULL
     ORDER BY distance ASC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

/**
 * Busca N registros aleatórios para treinamento via TABLESAMPLE.
 * Faz fallback para ORDER BY RANDOM() se TABLESAMPLE retornar poucos.
 */
async function findRandomForTraining(n) {
  const COLUMNS = `day_type, work_hours, screen_time_hours, meetings_count,
              app_switches, after_hours_work, sleep_hours, isolation_index,
              fatigue_score, breaks_taken, task_completion,
              burnout_score, burnout_risk, archetype`;

  const { rows: countResult } = await pool.query('SELECT COUNT(*)::int AS total FROM burnout');
  const total = countResult[0].total || 1;
  const samplePct = Math.min(100, Math.max(1, Math.ceil((n * 300) / total)));

  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM burnout TABLESAMPLE BERNOULLI($1) LIMIT $2`,
    [samplePct, n]
  );

  if (rows.length < n) {
    const { rows: fallbackRows } = await pool.query(
      `SELECT ${COLUMNS} FROM burnout ORDER BY RANDOM() LIMIT $1`,
      [n]
    );
    return fallbackRows;
  }

  return rows;
}

/**
 * Insere log bruto em burnout_logs (retorna id).
 */
async function insertLog(client, logData) {
  const { rows } = await client.query(
    `INSERT INTO burnout_logs
       (user_id, day_type, work_hours, screen_time_hours, meetings_count, app_switches,
        after_hours_work, sleep_hours, isolation_index, fatigue_score, breaks_taken,
        is_processed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE)
     RETURNING id`,
    [
      logData.userId, logData.day_type, logData.work_hours, logData.screen_time_hours,
      logData.meetings_count, logData.app_switches, logData.after_hours_work,
      logData.sleep_hours, logData.isolation_index, logData.fatigue_score,
      logData.breaks_taken,
    ]
  );
  return rows[0].id;
}

/**
 * Insere registro processado em burnout (retorna id).
 */
async function insertBurnout(client, data) {
  const { rows } = await client.query(
    `INSERT INTO burnout
       (user_id, log_id, day_type, work_hours, screen_time_hours,
        meetings_count, breaks_taken, after_hours_work, app_switches, sleep_hours,
        task_completion, isolation_index, fatigue_score, burnout_score, burnout_risk, archetype)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      data.userId, data.logId,
      data.day_type, data.work_hours, data.screen_time_hours,
      data.meetings_count, data.breaks_taken, data.after_hours_work,
      data.app_switches, data.sleep_hours, data.task_completion,
      data.isolation_index, data.fatigue_score,
      data.burnoutScore, data.burnoutRisk, data.archetype,
    ]
  );
  return rows[0].id;
}

/**
 * Marca log como processado.
 */
async function markLogProcessed(client, logId) {
  await client.query('UPDATE burnout_logs SET is_processed = TRUE WHERE id = $1', [logId]);
}

/**
 * Busca dados agregados para o relatório público.
 */
async function findAggregateReport() {
  const [
    { rows: [overall] },
    { rows: riskDist },
    { rows: archetypeDist },
    { rows: dailyTrend },
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_records,
              ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
              ROUND(STDDEV(burnout_score)::numeric, 2) AS std_burnout_score
       FROM burnout`
    ),
    pool.query(
      `SELECT burnout_risk AS risk, COUNT(*)::int AS count
       FROM burnout
       WHERE burnout_risk IS NOT NULL
       GROUP BY burnout_risk`
    ),
    pool.query(
      `SELECT archetype, COUNT(*)::int AS count
       FROM burnout
       WHERE archetype IS NOT NULL
       GROUP BY archetype`
    ),
    pool.query(
      `SELECT DATE(created_at) AS day,
              ROUND(AVG(burnout_score)::numeric, 2) AS avg_score,
              COUNT(*)::int AS records
       FROM burnout
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY day`
    ),
  ]);

  return { overall, riskDist, archetypeDist, dailyTrend };
}

module.exports = {
  findRecentByUser,
  findLatestWithLogs,
  findSimilarRecords,
  findRandomForTraining,
  insertLog,
  insertBurnout,
  markLogProcessed,
  findAggregateReport,
};

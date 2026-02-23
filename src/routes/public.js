'use strict';

const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * GET /report
 * Relatório público com dados agregados e anônimos de burnout.
 */
router.get('/', async (_req, res) => {
  try {
    // Média de burnout por dia da semana
    const { rows: byDayOfWeek } = await pool.query(
      `SELECT TO_CHAR(data_registro, 'Day') AS day_of_week,
              EXTRACT(DOW FROM data_registro) AS dow_num,
              ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
              COUNT(*) AS total_records
       FROM burnout
       GROUP BY day_of_week, dow_num
       ORDER BY dow_num`
    );

    // Distribuição de risco global
    const { rows: riskDist } = await pool.query(
      `SELECT burnout_risk, COUNT(*) AS total,
              ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
       FROM burnout
       GROUP BY burnout_risk
       ORDER BY burnout_risk`
    );

    // Distribuição de arquétipos
    const { rows: archetypes } = await pool.query(
      `SELECT archetype, COUNT(*) AS total,
              ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
       FROM burnout
       WHERE archetype IS NOT NULL
       GROUP BY archetype
       ORDER BY total DESC`
    );

    // Médias gerais das métricas
    const { rows: overallAvg } = await pool.query(
      `SELECT ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
              ROUND(AVG(fatigue_score)::numeric, 2) AS avg_fatigue_score,
              ROUND(AVG(work_hours)::numeric, 2) AS avg_work_hours,
              ROUND(AVG(sleep_hours)::numeric, 2) AS avg_sleep_hours,
              ROUND(AVG(isolation_index)::numeric, 2) AS avg_isolation_index,
              COUNT(DISTINCT user_id) AS total_users,
              COUNT(*) AS total_records
       FROM burnout`
    );

    // Tendência dos últimos 30 dias (média diária global)
    const { rows: trend30d } = await pool.query(
      `SELECT data_registro,
              ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
              COUNT(*) AS total_records
       FROM burnout
       WHERE data_registro >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY data_registro
       ORDER BY data_registro ASC`
    );

    return res.json({
      burnoutByDayOfWeek: byDayOfWeek,
      riskDistribution: riskDist,
      archetypeDistribution: archetypes,
      overall: overallAvg[0] || {},
      trend30Days: trend30d,
    });
  } catch (err) {
    console.error('Erro no relatório público:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar o relatório.' });
  }
});

module.exports = router;

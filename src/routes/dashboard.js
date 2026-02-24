'use strict';

const express = require('express');
const pool = require('../db');
const {
  analyzeTemporalTrend,
  detectAnomalies,
  analyzeInterventions,
} = require('../modelTraining');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  // Prefer JSON for API clients (fetch) and redirect only for browser navigations
  if (req.accepts('json')) {
    return res.status(401).json({ error: 'Autenticação necessária.' });
  }
  return res.redirect('/login.html');
}

/**
 * GET /dashboard
 * Dashboard individual protegido com métricas de burnout do usuário.
 */
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    // Últimos 90 dias de análises
    const { rows: records } = await pool.query(
      `SELECT created_at, burnout_score, burnout_risk, archetype,
              fatigue_score, breaks_taken, work_hours, sleep_hours
       FROM burnout
       WHERE user_id = $1
         AND created_at >= CURRENT_DATE - INTERVAL '90 days'
       ORDER BY created_at ASC`,
      [userId]
    );

    // Resumo do período
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

    // Análise temporal
    const temporal = analyzeTemporalTrend(records);

    // Anomalias
    const anomalies = detectAnomalies(records);

    // Causalidade de intervenções
    const interventions = analyzeInterventions(records);

    // Último registro
    const lastRecord = records[records.length - 1] || null;

    // Últimos registros: usar burnout_logs (brutos) + inferências em burnout
    const { rows: latestRecords } = await pool.query(
      `SELECT bl.created_at,
              b.burnout_score,
              b.burnout_risk,
              b.archetype,
              bl.fatigue_score,
              bl.work_hours
       FROM burnout_logs bl
       LEFT JOIN burnout b ON b.log_id = bl.id
       WHERE bl.user_id = $1
       ORDER BY bl.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Similaridade vetorial: registros semelhantes no dataset geral
    let similarRecords = [];
    if (lastRecord) {
      const { rows: similar } = await pool.query(
        `SELECT b.id, b.created_at, b.burnout_score, b.burnout_risk, b.archetype,
                b.embedding <-> (
                  SELECT embedding FROM burnout WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
                ) AS distance
         FROM burnout b
         WHERE b.user_id != $1
         ORDER BY distance ASC
         LIMIT 5`,
        [userId]
      );
      similarRecords = similar;
    }

    return res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        picture_url: req.user.picture_url,
      },
      userId: req.user.id,
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
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    return res.status(500).json({ error: 'Erro interno ao carregar o dashboard.' });
  }
});

module.exports = router;

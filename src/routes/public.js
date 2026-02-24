'use strict';

const express = require('express');
const pool = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Cache em memória com TTL — evita bater no banco em toda requisição.
// Dados do relatório público são agregados e mudam pouco; 60 s de TTL é seguro.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60 * 1000; // 60 segundos
let _cache = { data: null, expiresAt: 0 };

function getCached() {
  if (_cache.data && Date.now() < _cache.expiresAt) return _cache.data;
  return null;
}

function setCache(data) {
  _cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

// Permite invalidar o cache externamente (ex: após novo POST /burnout-logs)
router.invalidateCache = () => { _cache = { data: null, expiresAt: 0 }; };

/**
 * GET /report
 * Relatório público com dados agregados e anônimos de burnout.
 *
 * Otimizações aplicadas:
 *  1. Todas as queries rodam em paralelo (Promise.all) — antes eram sequenciais.
 *  2. Cache em memória com TTL de 60 s.
 *  3. Header Cache-Control para o browser não repetir a request instantaneamente.
 */
router.get('/', async (_req, res) => {
  try {
    // 1. Verificar cache
    const cached = getCached();
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    // 2. Disparar todas as queries em paralelo — nenhuma depende da outra
    const [
      { rows: byDayOfWeek },
      { rows: riskDist },
      { rows: archetypes },
      { rows: overallAvg },
      { rows: trend30d },
    ] = await Promise.all([
      // Média de burnout por dia da semana
      pool.query(
        `SELECT TO_CHAR(created_at, 'Day') AS day_of_week,
                EXTRACT(DOW FROM created_at) AS dow_num,
                ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
                COUNT(*) AS total_records
         FROM burnout
         GROUP BY day_of_week, dow_num
         ORDER BY dow_num`
      ),
      // Distribuição de risco global
      pool.query(
        `SELECT burnout_risk, COUNT(*) AS total,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
         FROM burnout
         GROUP BY burnout_risk
         ORDER BY burnout_risk`
      ),
      // Distribuição de arquétipos
      pool.query(
        `SELECT archetype, COUNT(*) AS total,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
         FROM burnout
         WHERE archetype IS NOT NULL
         GROUP BY archetype
         ORDER BY total DESC`
      ),
      // Médias gerais das métricas
      pool.query(
        `SELECT ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
                ROUND(AVG(fatigue_score)::numeric, 2) AS avg_fatigue_score,
                ROUND(AVG(work_hours)::numeric, 2) AS avg_work_hours,
                ROUND(AVG(sleep_hours)::numeric, 2) AS avg_sleep_hours,
                ROUND(AVG(isolation_index)::numeric, 2) AS avg_isolation_index,
                COUNT(DISTINCT user_id) AS total_users,
                COUNT(*) AS total_records
         FROM burnout`
      ),
      // Tendência dos últimos 30 dias (média diária global)
      pool.query(
        `SELECT created_at::date AS data_registro,
                ROUND(AVG(burnout_score)::numeric, 2) AS avg_burnout_score,
                COUNT(*) AS total_records
         FROM burnout
         WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY created_at::date
         ORDER BY created_at::date ASC`
      ),
    ]);

    const payload = {
      burnoutByDayOfWeek: byDayOfWeek,
      riskDistribution: riskDist,
      archetypeDistribution: archetypes,
      overall: overallAvg[0] || {},
      trend30Days: trend30d,
    };

    // 3. Salvar no cache e definir headers de cache
    setCache(payload);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(payload);
  } catch (err) {
    console.error('Erro no relatório público:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar o relatório.' });
  }
});

module.exports = router;

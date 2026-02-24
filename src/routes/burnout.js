'use strict';

const express = require('express');
const burnoutService = require('../services/burnoutService');
const publicRouter = require('./public');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Autenticação necessária.' });
}

/**
 * POST /burnout-logs
 * Recebe o log diário do usuário autenticado, executa a análise de IA
 * e persiste os dados brutos em burnout_logs e os dados processados em burnout.
 */
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  // Validação básica
  const required = ['work_hours', 'screen_time_hours', 'meetings_count', 'app_switches', 'sleep_hours', 'isolation_index', 'fatigue_score', 'breaks_taken'];
  for (const field of required) {
    if (req.body[field] == null) {
      return res.status(400).json({ error: `Campo obrigatório ausente: ${field}` });
    }
  }

  try {
    const result = await burnoutService.processLog(userId, req.body);

    // Invalidar cache do relatório público (dados agregados mudaram)
    publicRouter.invalidateCache();

    return res.status(201).json(result);
  } catch (err) {
    console.error('Erro ao salvar burnout log:', err);
    return res.status(500).json({ error: 'Erro interno ao processar o log.' });
  }
});

module.exports = router;

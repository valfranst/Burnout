'use strict';

const express = require('express');
const burnoutService = require('../services/burnoutService');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
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
  try {
    const data = await burnoutService.getDashboardData(req.user.id);

    return res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        picture_url: req.user.picture_url,
      },
      userId: req.user.id,
      ...data,
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    return res.status(500).json({ error: 'Erro interno ao carregar o dashboard.' });
  }
});

module.exports = router;

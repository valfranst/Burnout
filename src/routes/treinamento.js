'use strict';

const express = require('express');
const burnoutService = require('../services/burnoutService');

const router = express.Router();

/**
 * POST /treinamento
 * Retorna N registros brutos do banco de dados para que o treinamento
 * e a predição sejam executados inteiramente no navegador via TensorFlow.js.
 *
 * Body esperado:
 *   - num_records (int, 1-1000): quantidade de registros
 */
router.post('/', async (req, res) => {
  const { num_records } = req.body;

  const n = Number(num_records);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    return res.status(400).json({ error: 'Quantidade de registros deve ser um inteiro entre 1 e 1000.' });
  }

  try {
    const records = await burnoutService.getTrainingRecords(n);
    return res.json({ records });
  } catch (err) {
    console.error('Erro ao buscar registros para treinamento:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar registros.' });
  }
});

module.exports = router;

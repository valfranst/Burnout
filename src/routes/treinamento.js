'use strict';

const express = require('express');
const pool = require('../db');
const { analyzeLog, trainModel, predictWithModel, calculateBurnoutScore, minMaxNormalize, logToFeatures, classifyRisk, assignArchetype } = require('../modelTraining');

const router = express.Router();

/**
 * POST /treinamento
 * Treina o modelo com N registros do banco e, opcionalmente,
 * executa a predição para os dados fornecidos no corpo da requisição.
 *
 * Body esperado:
 *   - work_hours, screen_time_hours, meetings_count, app_switches,
 *     breaks_taken, after_hours_work (Métricas Comportamentais)
 *   - sleep_hours, fatigue_score, isolation_index, task_completion (Métricas Psicológicas)
 *   - num_records (int, 1-1000): quantidade de registros para comparação
 *   - action: 'train' | 'train_and_run'
 */
router.post('/', async (req, res) => {
  const {
    work_hours,
    screen_time_hours,
    meetings_count,
    app_switches,
    breaks_taken,
    after_hours_work = false,
    sleep_hours,
    fatigue_score,
    isolation_index,
    task_completion = 80,
    num_records,
    action = 'train',
    custom_weights,
    custom_bias,
  } = req.body;

  // Validação do número de registros
  const n = parseInt(num_records, 10);
  if (!n || n < 1 || n > 1000) {
    return res.status(400).json({ error: 'Quantidade de registros deve estar entre 1 e 1000.' });
  }

  try {
    // Busca N registros do banco para o treinamento
    // TABLESAMPLE BERNOULLI provê amostragem eficiente; ORDER BY RANDOM() é fallback
    const { rows: records } = await pool.query(
      `SELECT day_type, work_hours, screen_time_hours, meetings_count,
              app_switches, after_hours_work, sleep_hours, isolation_index,
              fatigue_score, breaks_taken, task_completion,
              burnout_score, burnout_risk, archetype
       FROM burnout
       ORDER BY RANDOM()
       LIMIT $1`,
      [n]
    );

    const totalUsed = records.length;

    // Computa estatísticas do conjunto de treinamento
    const riskDist = { Low: 0, Medium: 0, High: 0 };
    const archetypeDist = {};
    let scoreSum = 0;

    for (const r of records) {
      if (r.burnout_risk) riskDist[r.burnout_risk] = (riskDist[r.burnout_risk] || 0) + 1;
      if (r.archetype) archetypeDist[r.archetype] = (archetypeDist[r.archetype] || 0) + 1;
      scoreSum += Number(r.burnout_score) || 0;
    }

    const avgScore = totalUsed > 0
      ? parseFloat((scoreSum / totalUsed).toFixed(2))
      : null;

    // Treina o modelo com registros reais do banco (mínimo 10 registros)
    // Pula treinamento se a ação for apenas analisar
    let realMetrics = { epochs: [], trainLoss: [], valLoss: [], trainAcc: [], valAcc: [] };
    if (action !== 'analyze_only' && totalUsed >= 10) {
      realMetrics = await trainModel(records);
    }

    const training = {
      totalRecords: totalUsed,
      avgBurnoutScore: avgScore,
      riskDistribution: riskDist,
      archetypeDistribution: archetypeDist,
      metrics: realMetrics,
    };

    // Validação dos campos obrigatórios para predição
    const required = {
      work_hours, screen_time_hours, meetings_count, app_switches,
      sleep_hours, isolation_index, fatigue_score, breaks_taken,
    };
    for (const [field, value] of Object.entries(required)) {
      if (value == null) {
        return res.status(400).json({ error: `Campo obrigatório ausente para predição: ${field}` });
      }
    }

    // Executa a predição para os dados fornecidos
    // day_type não é coletado no formulário de treinamento; usa 'Weekday' como valor padrão
    // representando um dia útil típico para fins de comparação
    const logData = {
      day_type: 'Weekday',
      work_hours: parseFloat(work_hours),
      screen_time_hours: parseFloat(screen_time_hours),
      meetings_count: parseInt(meetings_count, 10),
      app_switches: parseInt(app_switches, 10),
      breaks_taken: parseInt(breaks_taken, 10),
      after_hours_work: after_hours_work === true || after_hours_work === 'true',
      sleep_hours: parseFloat(sleep_hours),
      fatigue_score: parseFloat(fatigue_score),
      isolation_index: parseInt(isolation_index, 10),
      task_completion: parseInt(task_completion, 10),
    };

    const defaultWeights = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
    const defaultBias = 15;

    let prediction;

    if (action === 'analyze_only') {
      // Análise estática com pesos customizáveis
      const features = logToFeatures(logData);
      const norm = minMaxNormalize(features);
      const weights = Array.isArray(custom_weights) && custom_weights.length === 11
        ? custom_weights.map(Number)
        : defaultWeights;
      const bias = custom_bias != null ? Number(custom_bias) : defaultBias;
      const score = calculateBurnoutScore(norm, weights, bias);
      const risk = classifyRisk(score);
      const arch = assignArchetype(norm);
      prediction = {
        burnoutScore: score, burnoutRisk: risk, archetype: arch,
        normalized: norm, modelUsed: false,
        weightsUsed: weights, biasUsed: bias,
      };
    } else {
      const result = predictWithModel(logData);
      prediction = { ...result, modelUsed: result.modelUsed || false };
    }

    return res.json({ training, prediction });
  } catch (err) {
    console.error('Erro no treinamento do modelo:', err);
    return res.status(500).json({ error: 'Erro interno ao executar o treinamento.' });
  }
});

module.exports = router;

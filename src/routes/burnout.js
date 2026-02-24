'use strict';

const express = require('express');
const pool = require('../db');
const { analyzeLog, predictWithModel, trainModel } = require('../modelTraining');
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
  const {
    day_type = 'Weekday',
    work_hours,
    screen_time_hours,
    meetings_count,
    app_switches,
    after_hours_work = false,
    sleep_hours,
    isolation_index,
    fatigue_score,
    breaks_taken,
    task_completion = 80,
    data_registro,
  } = req.body;

  // Validação básica
  const required = { work_hours, screen_time_hours, meetings_count, app_switches, sleep_hours, isolation_index, fatigue_score, breaks_taken };
  for (const [field, value] of Object.entries(required)) {
    if (value == null) {
      return res.status(400).json({ error: `Campo obrigatório ausente: ${field}` });
    }
  }

  const registrationDate = data_registro || new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Persistir log bruto
    const logResult = await client.query(
      `INSERT INTO burnout_logs
         (user_id, day_type, work_hours, screen_time_hours, meetings_count, app_switches,
          after_hours_work, sleep_hours, isolation_index, fatigue_score, breaks_taken,
          is_processed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE)
       RETURNING id`,
      [
        userId, day_type, work_hours, screen_time_hours, meetings_count, app_switches,
        after_hours_work, sleep_hours, isolation_index, fatigue_score, breaks_taken,
      ]
    );
    const logId = logResult.rows[0].id;

    // 2. Análise de IA: tenta usar o modelo treinado; se não existir, treina com 200 registros
    const logData = {
      day_type, work_hours, screen_time_hours, meetings_count, app_switches,
      after_hours_work, sleep_hours, isolation_index, fatigue_score, breaks_taken,
      task_completion,
    };

    // Tenta predição via modelo treinado (retorna modelUsed: true se existir)
    let result = predictWithModel(logData);

    // Se não havia modelo treinado, treina com 200 registros do banco e tenta novamente
    if (!result.modelUsed) {
      const { rows: trainingRecords } = await client.query(
        `SELECT day_type, work_hours, screen_time_hours, meetings_count,
                app_switches, after_hours_work, sleep_hours, isolation_index,
                fatigue_score, breaks_taken, task_completion,
                burnout_score, burnout_risk, archetype
         FROM burnout ORDER BY RANDOM() LIMIT 200`
      );

      if (trainingRecords.length >= 10) {
        await trainModel(trainingRecords);
        result = predictWithModel(logData);
      }
    }

    const { normalized, burnoutScore, burnoutRisk, archetype } = result;
    const modelUsed = result.modelUsed || false;

    // 3. Persistir dados normalizados + inferências em burnout
    // O embedding é calculado automaticamente pela trigger do banco
    const burnoutResult = await client.query(
      `INSERT INTO burnout
         (user_id, log_id, day_type, work_hours, screen_time_hours,
          meetings_count, breaks_taken, after_hours_work, app_switches, sleep_hours,
          task_completion, isolation_index, fatigue_score, burnout_score, burnout_risk, archetype)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        userId, logId,
        day_type, work_hours, screen_time_hours, meetings_count, breaks_taken,
        after_hours_work, app_switches, sleep_hours, task_completion, isolation_index,
        fatigue_score, burnoutScore, burnoutRisk, archetype,
      ]
    );

    // 4. Marcar log como processado
    await client.query('UPDATE burnout_logs SET is_processed = TRUE WHERE id = $1', [logId]);

    await client.query('COMMIT');

    // Invalidar cache do relatório público (dados agregados mudaram)
    publicRouter.invalidateCache();

    return res.status(201).json({
      logId,
      burnoutId: burnoutResult.rows[0].id,
      burnoutScore,
      burnoutRisk,
      archetype,
      normalized,
      modelUsed,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao salvar burnout log:', err);
    return res.status(500).json({ error: 'Erro interno ao processar o log.' });
  } finally {
    client.release();
  }
});

module.exports = router;

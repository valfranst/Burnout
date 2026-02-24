'use strict';

(function () {
  let chartAcc = null;
  let chartLoss = null;

  const isolationField = document.getElementById('isolation_index');
  const isolationInfoBtn = document.getElementById('isolation-info-btn');
  const isolationModal = document.getElementById('isolation-modal');
  const isolationOverlay = document.getElementById('isolation-modal-overlay');
  const isoModalClose = document.getElementById('iso-modal-close');

  isolationField.addEventListener('input', () => {
    const val = Number(isolationField.value);
    if (Number.isNaN(val)) return;
    isolationField.value = Math.min(9, Math.max(3, val));
  });

  const closeIsolationModal = () => isolationModal.classList.add('hidden');

  // Presets de perfil de risco
  const riskPresets = {
    low:    { work_hours: 6, screen_time_hours: 4, meetings_count: 2, app_switches: 2, breaks_taken: 5, after_hours_work: 'false', sleep_hours: 8, fatigue_score: 2, isolation_index: 3, task_completion: 90 },
    medium: { work_hours: 9, screen_time_hours: 8, meetings_count: 6, app_switches: 5, breaks_taken: 3, after_hours_work: 'false', sleep_hours: 6, fatigue_score: 6, isolation_index: 6, task_completion: 65 },
    high:   { work_hours: 14, screen_time_hours: 12, meetings_count: 10, app_switches: 9, breaks_taken: 1, after_hours_work: 'true', sleep_hours: 3, fatigue_score: 9, isolation_index: 8, task_completion: 30 },
  };

  document.getElementById('risk_preset').addEventListener('change', (e) => {
    const preset = riskPresets[e.target.value];
    if (!preset) return;
    const form = document.getElementById('training-form');
    Object.entries(preset).forEach(([field, value]) => {
      const el = form.elements[field];
      if (el) el.value = value;
    });
  });

  if (isolationInfoBtn && isolationModal) isolationInfoBtn.addEventListener('click', () => isolationModal.classList.remove('hidden'));
  if (isolationOverlay) isolationOverlay.addEventListener('click', closeIsolationModal);
  if (isoModalClose) isoModalClose.addEventListener('click', closeIsolationModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isolationModal && !isolationModal.classList.contains('hidden')) closeIsolationModal();
  });

  // ---- Console de treinamento ----
  const trainingConsole = document.getElementById('training-console');
  const progressBar = document.getElementById('training-progress-bar');
  const progressLabel = document.getElementById('training-progress-label');
  const progressPct = document.getElementById('training-progress-pct');
  const progressFill = document.getElementById('training-progress-fill');

  function consoleLog(msg, color) {
    const line = document.createElement('div');
    line.textContent = msg;
    if (color) line.style.color = color;
    trainingConsole.appendChild(line);
    trainingConsole.scrollTop = trainingConsole.scrollHeight;
  }

  function consoleClear() {
    trainingConsole.innerHTML = '';
  }

  function updateProgress(epoch, total) {
    progressBar.style.display = 'block';
    progressLabel.textContent = 'Época ' + epoch + '/' + total;
    const pct = Math.round((epoch / total) * 100);
    progressPct.textContent = pct + '%';
    progressFill.style.width = pct + '%';
  }

  async function renderTrainingCharts(metrics) {
    if (!metrics) return;

    const labels = metrics.epochs || [];
    const accCtx = document.getElementById('chart-acc');
    const lossCtx = document.getElementById('chart-loss');

    if (!accCtx || !lossCtx) return;

    chartAcc = Charts.destroy(chartAcc);
    chartLoss = Charts.destroy(chartLoss);

    chartAcc = Charts.line(accCtx, labels, [
      { label: 'Treino',    data: metrics.trainAcc || [], borderColor: Charts.COLORS.primary },
      { label: 'Validação', data: metrics.valAcc   || [], borderColor: Charts.COLORS.success },
    ], { scales: { y: { min: 0, max: 1, ticks: { stepSize: 0.1 } } } });

    chartLoss = Charts.line(lossCtx, labels, [
      { label: 'Treino',    data: metrics.trainLoss || [], borderColor: Charts.COLORS.warning },
      { label: 'Validação', data: metrics.valLoss   || [], borderColor: Charts.COLORS.danger  },
    ]);

    document.getElementById('charts-section').classList.remove('hidden');
  }

  // Inicializa gráficos com valores padrão
  renderTrainingCharts({
    epochs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    trainLoss: [0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.01, 0.008, 0.006],
    valLoss:   [0.07, 0.055, 0.045, 0.035, 0.03, 0.025, 0.02, 0.015, 0.012, 0.009],
    trainAcc:  [0.55, 0.62, 0.68, 0.74, 0.78, 0.82, 0.86, 0.89, 0.91, 0.93],
    valAcc:    [0.50, 0.58, 0.64, 0.70, 0.74, 0.78, 0.82, 0.85, 0.87, 0.89],
  });

  // Restaurar pesos padrão
  document.getElementById('btn-reset-weights').addEventListener('click', () => {
    const defaults = [1.5, 9.0, 7.5, 6.0, -7.5, 3.75, 6.0, -10.5, 9.0, -6.0, 21.0];
    const ids = ['w_day_type','w_work_hours','w_screen_time','w_meetings','w_breaks','w_after_hours','w_app_switches','w_sleep','w_isolation','w_task_completion','w_fatigue'];
    defaults.forEach((v, i) => document.getElementById(ids[i]).value = v);
    document.getElementById('w_bias').value = 15;
  });

  document.getElementById('training-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter?.dataset?.action || 'train';
    const form = e.target;
    const box = document.getElementById('alert-box');
    App.hideAlert(box);

    const workHours = parseFloat(form.work_hours.value);
    const screenTime = parseFloat(form.screen_time_hours.value);
    const meetingsCount = parseInt(form.meetings_count.value, 10);
    const appSwitches = parseInt(form.app_switches.value, 10);
    const breaksTaken = parseInt(form.breaks_taken.value, 10);
    const sleepHours = parseFloat(form.sleep_hours.value);
    const taskCompletion = parseInt(form.task_completion.value, 10);
    const isoVal = parseInt(form.isolation_index.value, 10);
    const numRecords = parseInt(form.num_records.value, 10);

    if (Number.isNaN(numRecords) || numRecords < 100 || numRecords > 1000) {
      App.showAlert(box, 'Quantidade de registros deve estar entre 100 e 1000.');
      return;
    }
    if (Number.isNaN(screenTime) || screenTime > workHours) {
      App.showAlert(box, 'Tempo de tela não pode ser maior que horas de trabalho.');
      return;
    }
    if (Number.isNaN(meetingsCount) || meetingsCount < 0 || meetingsCount > 16) {
      App.showAlert(box, 'Reuniões deve estar entre 0 e 16.');
      return;
    }
    if (Number.isNaN(appSwitches) || appSwitches < 0 || appSwitches > 10) {
      App.showAlert(box, 'Troca de apps deve estar entre 0 e 10.');
      return;
    }
    if (Number.isNaN(breaksTaken) || breaksTaken < 0 || breaksTaken > 16) {
      App.showAlert(box, 'Pausas no dia deve estar entre 0 e 16.');
      return;
    }
    if (Number.isNaN(sleepHours) || sleepHours < 2 || sleepHours > 10) {
      App.showAlert(box, 'Horas de sono deve estar entre 2 e 10.');
      return;
    }
    if (Number.isNaN(taskCompletion) || taskCompletion < 0 || taskCompletion > 100) {
      App.showAlert(box, 'Conclusão de tarefas deve estar entre 0 e 100.');
      return;
    }
    if (Number.isNaN(isoVal) || isoVal < 3 || isoVal > 9) {
      App.showAlert(box, 'Índice de isolamento deve estar entre 3 e 9.');
      return;
    }

    // Coleta pesos customizados do painel lateral
    const customWeights = [
      parseFloat(document.getElementById('w_day_type').value),
      parseFloat(document.getElementById('w_work_hours').value),
      parseFloat(document.getElementById('w_screen_time').value),
      parseFloat(document.getElementById('w_meetings').value),
      parseFloat(document.getElementById('w_breaks').value),
      parseFloat(document.getElementById('w_after_hours').value),
      parseFloat(document.getElementById('w_app_switches').value),
      parseFloat(document.getElementById('w_sleep').value),
      parseFloat(document.getElementById('w_isolation').value),
      parseFloat(document.getElementById('w_task_completion').value),
      parseFloat(document.getElementById('w_fatigue').value),
    ];
    const customBias = parseFloat(document.getElementById('w_bias').value);

    // Dados do formulário para predição
    const logData = {
      day_type: 'Weekday',
      work_hours: workHours,
      screen_time_hours: screenTime,
      meetings_count: meetingsCount,
      app_switches: appSwitches,
      breaks_taken: breaksTaken,
      after_hours_work: form.after_hours_work.value === 'true',
      sleep_hours: sleepHours,
      fatigue_score: parseFloat(form.fatigue_score.value),
      isolation_index: isoVal,
      task_completion: taskCompletion,
    };

    // Limpa console e inicia
    consoleClear();
    consoleLog('━━━ Iniciando processo ━━━', '#00d4ff');

    // Desabilita botões durante processamento
    const buttons = form.querySelectorAll('button[type="submit"]');
    buttons.forEach(function (btn) { btn.disabled = true; btn.style.opacity = '0.6'; });

    try {
      // 1. Busca registros do servidor (só dados brutos)
      consoleLog('[Servidor] Buscando ' + numRecords + ' registros do banco de dados...', '#f59e0b');
      const res = await App.api('/treinamento', { method: 'POST', body: JSON.stringify({ num_records: numRecords }) });
      const records = res.records || [];
      consoleLog('[Servidor] ' + records.length + ' registros recebidos.', '#00ffa3');

      // 2. Computa estatísticas do dataset no browser
      consoleLog('[Browser] Calculando estatísticas do dataset...', '#00d4ff');
      const stats = ModelTraining.computeDatasetStats(records);

      // Preenche stats do treinamento na UI
      document.getElementById('r-total').textContent = stats.totalRecords;
      document.getElementById('r-avg').textContent = stats.avgBurnoutScore ?? '—';

      const riskDist = stats.riskDistribution || {};
      const totalRisk = (riskDist.Low || 0) + (riskDist.Medium || 0) + (riskDist.High || 0);
      if (totalRisk > 0) {
        const pctLow = ((riskDist.Low || 0) / totalRisk * 100).toFixed(0);
        const pctMed = ((riskDist.Medium || 0) / totalRisk * 100).toFixed(0);
        const pctHigh = ((riskDist.High || 0) / totalRisk * 100).toFixed(0);

        const progressItems = document.querySelectorAll('.progress-stack .progress-item');
        if (progressItems.length >= 3) {
          progressItems[0].style.width = pctLow + '%';
          progressItems[0].title = 'Baixo: ' + pctLow + '%';
          progressItems[1].style.width = pctMed + '%';
          progressItems[1].title = 'Médio: ' + pctMed + '%';
          progressItems[2].style.width = pctHigh + '%';
          progressItems[2].title = 'Alto: ' + pctHigh + '%';
        }

        var elevatedEl = document.getElementById('r-risk-elevated');
        if (elevatedEl) elevatedEl.textContent = pctHigh + '%';
      }

      consoleLog('[Browser] Estatísticas calculadas.', '#00ffa3');

      var prediction;
      var metrics = null;

      if (action === 'analyze_only') {
        // 3a. Análise estática no browser
        consoleLog('[Browser] Executando análise estática com pesos customizados...', '#00d4ff');
        prediction = ModelTraining.analyzeStatic(logData, customWeights, customBias);
        consoleLog('[Browser] Score: ' + prediction.burnoutScore + ' | Risco: ' + prediction.burnoutRisk + ' | Arquétipo: ' + prediction.archetype, '#00ffa3');
      } else {
        // 3b. Treina modelo no browser e faz predição
        if (records.length >= 10) {
          consoleLog('[Browser] Iniciando treinamento da rede neural com TensorFlow.js...', '#00d4ff');
          metrics = await ModelTraining.trainModel(records, {
            epochs: 30,
            onEpochEnd: function (epoch, total, m) {
              updateProgress(epoch, total);
              // Atualiza gráficos a cada 5 épocas para performance
              if (epoch % 5 === 0 || epoch === total) {
                renderTrainingCharts(m);
              }
            },
            onLog: function (msg) { consoleLog(msg); },
          });

          // Renderiza gráficos finais
          renderTrainingCharts(metrics);
          consoleLog('[Browser] Treinamento concluído! Executando predição via rede neural...', '#00d4ff');
        } else {
          consoleLog('[Browser] Poucos registros (' + records.length + ') — usando análise estática.', '#f59e0b');
        }

        prediction = ModelTraining.predictWithModel(logData);
        consoleLog('[Browser] Score: ' + prediction.burnoutScore + ' | Risco: ' + prediction.burnoutRisk + ' | Arquétipo: ' + prediction.archetype, '#00ffa3');
        consoleLog('[Browser] Modelo usado: ' + (prediction.modelUsed ? 'Rede Neural' : 'Análise Estática'), '#00d4ff');
      }

      // Atualiza UI de predição
      var predSection = document.getElementById('prediction-section');
      if (prediction) {
        var scoreCircle = document.getElementById('p-score-circle');
        var riskLabel = document.getElementById('p-risk-label');
        var archName = document.getElementById('p-arch-name');
        var adviceEl = document.getElementById('p-advice');

        if (scoreCircle) {
          scoreCircle.textContent = prediction.burnoutScore;
          var riskColor = prediction.burnoutRisk === 'High' ? 'var(--danger)' :
                          prediction.burnoutRisk === 'Medium' ? 'var(--warning)' : 'var(--success)';
          scoreCircle.style.borderColor = riskColor;
          scoreCircle.style.color = riskColor;
        }

        if (riskLabel) {
          var riskText = prediction.burnoutRisk === 'High' ? 'Risco Crítico' :
                         prediction.burnoutRisk === 'Medium' ? 'Risco Moderado' : 'Risco Baixo';
          var riskClass = 'badge-risk risk-' + prediction.burnoutRisk.toLowerCase();
          riskLabel.className = riskClass;
          riskLabel.textContent = riskText;
        }

        if (archName) archName.textContent = prediction.archetype || '—';

        Recommendations.renderAdvice(adviceEl, prediction.archetype);

        predSection.classList.remove('hidden');
      } else {
        predSection.classList.add('hidden');
      }

      document.getElementById('result').classList.remove('hidden');

      // Atualiza painel de pesos se análise estática
      if (prediction && prediction.weightsUsed) {
        var wIds = ['w_day_type','w_work_hours','w_screen_time','w_meetings','w_breaks','w_after_hours','w_app_switches','w_sleep','w_isolation','w_task_completion','w_fatigue'];
        prediction.weightsUsed.forEach(function (w, i) {
          if (wIds[i]) document.getElementById(wIds[i]).value = w;
        });
        if (prediction.biasUsed != null) document.getElementById('w_bias').value = prediction.biasUsed;
      }

      document.getElementById('weights-panel').classList.remove('hidden');

      consoleLog('━━━ Processo finalizado ━━━', '#00d4ff');
      App.showAlert(box, prediction && prediction.modelUsed ? 'Treinamento no browser concluído — predição via rede neural!' : 'Análise estática concluída com pesos customizados!', 'success');
    } catch (err) {
      consoleLog('[Erro] ' + (err.error || err.message || 'Erro desconhecido'), '#ef4444');
      App.showAlert(box, err.error || 'Erro ao executar o treinamento.');
    } finally {
      buttons.forEach(function (btn) { btn.disabled = false; btn.style.opacity = '1'; });
    }
  });
})();

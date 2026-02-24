/* ============================================================
   recommendations.js — Mapeamento centralizado de recomendações
   por arquétipo de burnout.
   Edite apenas este arquivo para alterar as mensagens exibidas
   em todas as telas do sistema.
   ============================================================ */
const Recommendations = (() => {
  const adviceMap = {
    Sobrecarregado:
      'Identificamos uma carga excessiva de trabalho com períodos insuficientes de recuperação. ' +
      'Isso pode levar a exaustão emocional, queda de produtividade e problemas de saúde a longo prazo. ' +
      '<br><br><strong>Sugestões de atividades:</strong>' +
      '<ul>' +
      '<li>Estabeleça limites claros de horário — defina um alarme para encerrar o expediente e respeite-o.</li>' +
      '<li>Adote a técnica Pomodoro (25 min de foco + 5 min de pausa) para manter a energia ao longo do dia.</li>' +
      '<li>Reserve ao menos 15 minutos diários para uma caminhada ao ar livre ou exercício leve.</li>' +
      '<li>Pratique exercícios de respiração profunda (4-7-8) nos intervalos para reduzir o cortisol.</li>' +
      '<li>Converse com a liderança sobre redistribuição de tarefas e priorização de demandas.</li>' +
      '<li>Evite telas pelo menos 30 minutos antes de dormir para melhorar a qualidade do sono.</li>' +
      '</ul>',
    Isolado:
      'Detectamos um padrão de baixo engajamento social e distanciamento da equipe. ' +
      'O isolamento prolongado pode intensificar sentimentos de desconexão, reduzir a motivação e agravar quadros de burnout. ' +
      '<br><br><strong>Sugestões de atividades:</strong>' +
      '<ul>' +
      '<li>Participe de pelo menos uma reunião colaborativa por semana, mesmo que breve (15 min de café virtual).</li>' +
      '<li>Procure um colega de trabalho para fazer pair programming ou revisões de código em conjunto.</li>' +
      '<li>Compartilhe pequenas conquistas diárias em um canal de equipe — isso fortalece vínculos.</li>' +
      '<li>Considere participar de comunidades de prática ou grupos de interesse dentro da empresa.</li>' +
      '<li>Reserve tempo semanal para atividades sociais fora do trabalho (esportes, hobbies em grupo).</li>' +
      '<li>Se o isolamento persistir, considere buscar apoio profissional com psicólogo ou terapeuta.</li>' +
      '</ul>',
    Equilibrado:
      'Seu perfil indica um equilíbrio saudável entre carga de trabalho, descanso e interação social. ' +
      'Manter esse padrão é essencial para a sustentabilidade da sua performance e bem-estar a longo prazo. ' +
      '<br><br><strong>Dicas para manter o equilíbrio:</strong>' +
      '<ul>' +
      '<li>Continue respeitando seus limites de horário e momentos de descanso.</li>' +
      '<li>Pratique atividades físicas regulares — 30 minutos, 3x por semana já faz diferença significativa.</li>' +
      '<li>Mantenha um diário breve de gratidão ou reflexão para reforçar a consciência emocional.</li>' +
      '<li>Invista em aprendizado contínuo — cursos e leituras mantêm a motivação e o senso de progresso.</li>' +
      '<li>Fortaleça suas relações de trabalho participando ativamente de momentos de integração.</li>' +
      '</ul>',
    AltaAutonomia:
      'Você demonstra alta capacidade de autogestão e independência, o que é valioso. ' +
      'No entanto, excesso de autonomia sem interação pode se transformar em isolamento silencioso, ' +
      'dificultando o suporte mútuo e a detecção precoce de sobrecarga. ' +
      '<br><br><strong>Sugestões de atividades:</strong>' +
      '<ul>' +
      '<li>Agende check-ins regulares (semanais) com colegas ou liderança — mesmo breves, mantêm a conexão.</li>' +
      '<li>Participe de sessões de brainstorming ou retrospectivas para compartilhar ideias e ouvir perspectivas.</li>' +
      '<li>Ofereça-se como mentor para colegas mais novos — ensinar fortalece vínculos e senso de propósito.</li>' +
      '<li>Alterne entre trabalho individual e colaborativo para evitar monotonia e distanciamento.</li>' +
      '<li>Pratique mindfulness ou meditação guiada (5-10 min/dia) para manter a autoconsciência emocional.</li>' +
      '<li>Avalie periodicamente se a autonomia está sendo saudável ou se está mascarando sobrecarga.</li>' +
      '</ul>',
  };

  const defaultAdvice =
    'Análise concluída. Os dados coletados ainda não permitem uma classificação clara. ' +
    'Continue registrando seus indicadores diários para que o sistema possa gerar recomendações mais precisas.';

  /**
   * Retorna o texto de recomendação para o arquétipo informado.
   * Se o arquétipo não for reconhecido, retorna a mensagem padrão.
   * @param {string} archetype — Nome do arquétipo (ex: "Sobrecarregado")
   * @returns {string}
   */
  function getAdvice(archetype) {
    return adviceMap[archetype] || defaultAdvice;
  }

  /**
   * Atualiza o conteúdo HTML de um elemento com o ícone + recomendação.
   * @param {HTMLElement} el — Elemento DOM a ser atualizado
   * @param {string} archetype — Nome do arquétipo
   */
  function renderAdvice(el, archetype) {
    if (!el) return;
    el.innerHTML =
      '<i class="fas fa-info-circle"></i> ' + getAdvice(archetype);
  }

  return { adviceMap, defaultAdvice, getAdvice, renderAdvice };
})();

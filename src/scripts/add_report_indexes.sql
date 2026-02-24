-- ============================================================
-- Índices para otimizar as queries do relatório público (/report)
-- Executar uma vez no banco de dados.
-- ============================================================

-- 1. Índice em burnout_risk — usado no GROUP BY da distribuição de risco
CREATE INDEX IF NOT EXISTS idx_burnout_risk ON burnout (burnout_risk);

-- 2. Índice em archetype — usado no GROUP BY da distribuição de arquétipos
CREATE INDEX IF NOT EXISTS idx_burnout_archetype ON burnout (archetype) WHERE archetype IS NOT NULL;

-- 3. Índice em created_at — usado no filtro WHERE e GROUP BY da tendência 30 dias
--    e no GROUP BY do dia da semana (EXTRACT/TO_CHAR sobre created_at).
CREATE INDEX IF NOT EXISTS idx_burnout_created_at ON burnout (created_at);

-- 4. Índice parcial para a query de tendência dos últimos 30 dias.
--    Só indexa linhas recentes, economizando espaço e acelerando a filtragem.
--    ATENÇÃO: este índice deve ser recriado periodicamente (ou ignorado se o volume for pequeno).
-- CREATE INDEX IF NOT EXISTS idx_burnout_created_at_30d
--   ON burnout (created_at) WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- 5. Índice em user_id — beneficia COUNT(DISTINCT user_id) e joins no dashboard
CREATE INDEX IF NOT EXISTS idx_burnout_user_id ON burnout (user_id);

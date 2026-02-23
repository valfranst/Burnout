-- 1. Criar a tabela de Usuários (Google Login)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id TEXT UNIQUE, 
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT, 
    name TEXT,
    picture_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Criar a tabela de Logs de Burnout
CREATE TABLE IF NOT EXISTS burnout_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Contexto Temporal
    data_registro DATE DEFAULT CURRENT_DATE,
    day_type TEXT DEFAULT 'Weekday', 
    
    -- Métricas Comportamentais (Automáticas)
    work_hours REAL NOT NULL CHECK (work_hours BETWEEN 0.5 AND 18), --horas_de_trabalho (0,5-18h) - Duração diária do trabalho
    screen_time_hours REAL NOT NULL CHECK (screen_time_hours BETWEEN 0 AND 18), -- screen_time_hours (0-18h) - Tempo de uso ativo da tela
    meetings_count SMALLINT NOT NULL CHECK (meetings_count BETWEEN 0 AND 30), --meetings_count (0-20) - Reuniões virtuais por dia
    app_switches INT NOT NULL CHECK (app_switches BETWEEN 0 AND 500),
    after_hours_work BOOLEAN DEFAULT FALSE, -- app_switches (5-200) - Indicador de multitarefa
    
    -- Métricas Psicológicas (Autoavaliadas)
    sleep_hours REAL NOT NULL CHECK (sleep_hours BETWEEN 0 AND 12), --horas_de_sono (3-10h) - Qualidade do sono
    isolation_index SMALLINT NOT NULL CHECK (isolation_index BETWEEN 3 AND 9), --índice_de_isolamento (3-9) - Escala de Solidão da UCLA
    fatigue_score REAL NOT NULL CHECK (fatigue_score BETWEEN 0 AND 10), --fatigue_score (0-10) - Exaustão mental (principal preditor: 28% de importância)
    breaks_taken SMALLINT NOT NULL CHECK (breaks_taken BETWEEN 0 AND 20), -- pausas_realizadas (0-15) - Comportamento de recuperação
    
    -- Status de Processamento para Recomendação
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_burnout_logs_user_date ON burnout_logs(user_id, data_registro);
CREATE INDEX IF NOT EXISTS idx_burnout_logs_unprocessed ON burnout_logs(is_processed) WHERE is_processed = FALSE;
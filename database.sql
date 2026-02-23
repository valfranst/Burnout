-- =============================================================
-- database.sql - Burnout Analysis System
-- Executa automaticamente na inicialização do container PostgreSQL
-- =============================================================

-- 1. Habilitar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tipos customizados
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'burnout_risk_level') THEN
        CREATE TYPE burnout_risk_level AS ENUM ('Low', 'Medium', 'High');
    END IF;
END $$;

-- 3. Tabela de Usuários (Google OAuth2 + Email/Senha)
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

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 4. Tabela de Logs Brutos de Burnout
CREATE TABLE IF NOT EXISTS burnout_logs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_registro DATE DEFAULT CURRENT_DATE,
    day_type TEXT DEFAULT 'Weekday',
    work_hours REAL NOT NULL CHECK (work_hours BETWEEN 0.5 AND 18),
    screen_time_hours REAL NOT NULL CHECK (screen_time_hours BETWEEN 0 AND 18),
    meetings_count SMALLINT NOT NULL CHECK (meetings_count BETWEEN 0 AND 30),
    app_switches INT NOT NULL CHECK (app_switches BETWEEN 0 AND 500),
    after_hours_work BOOLEAN DEFAULT FALSE,
    sleep_hours REAL NOT NULL CHECK (sleep_hours BETWEEN 0 AND 12),
    isolation_index SMALLINT NOT NULL CHECK (isolation_index BETWEEN 3 AND 9),
    fatigue_score REAL NOT NULL CHECK (fatigue_score BETWEEN 0 AND 10),
    breaks_taken SMALLINT NOT NULL CHECK (breaks_taken BETWEEN 0 AND 20),
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_burnout_logs_user_date ON burnout_logs(user_id, data_registro);
CREATE INDEX IF NOT EXISTS idx_burnout_logs_unprocessed ON burnout_logs(is_processed) WHERE is_processed = FALSE;

-- 5. Tabela de Análise de Burnout (dados normalizados + embeddings + inferências)
CREATE TABLE IF NOT EXISTS burnout (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    log_id INT REFERENCES burnout_logs(id) ON DELETE CASCADE,
    data_registro DATE DEFAULT CURRENT_DATE,
    day_type TEXT,
    -- Dados brutos
    work_hours REAL,
    screen_time_hours REAL,
    meetings_count SMALLINT,
    breaks_taken SMALLINT,
    after_hours_work BOOLEAN,
    app_switches INT,
    sleep_hours REAL,
    task_completion REAL,
    isolation_index SMALLINT,
    fatigue_score REAL,
    -- Inferências do modelo
    burnout_score REAL,
    burnout_risk burnout_risk_level,
    archetype TEXT,
    -- Vetor de embedding (12 dimensões)
    embedding vector(12),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Função de trigger para gerar embedding automaticamente
CREATE OR REPLACE FUNCTION fn_generate_burnout_embedding()
RETURNS TRIGGER AS $$
BEGIN
    NEW.embedding := ARRAY[
        CASE WHEN NEW.day_type = 'Weekday' THEN 1 ELSE 0 END,
        COALESCE(NEW.work_hours, 0),
        COALESCE(NEW.screen_time_hours, 0),
        COALESCE(NEW.meetings_count, 0),
        COALESCE(NEW.breaks_taken, 0),
        CASE WHEN NEW.after_hours_work THEN 1 ELSE 0 END,
        COALESCE(NEW.app_switches, 0),
        COALESCE(NEW.sleep_hours, 0),
        COALESCE(NEW.task_completion, 0),
        COALESCE(NEW.isolation_index, 0),
        COALESCE(NEW.fatigue_score, 0),
        COALESCE(NEW.burnout_score, 0)
    ]::real[];
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_burnout_embedding
BEFORE INSERT OR UPDATE ON burnout
FOR EACH ROW
EXECUTE FUNCTION fn_generate_burnout_embedding();

-- 7. Índice HNSW para busca vetorial eficiente
CREATE INDEX IF NOT EXISTS idx_burnout_embedding_hnsw ON burnout USING hnsw (embedding vector_l2_ops);
CREATE INDEX IF NOT EXISTS idx_burnout_user_date ON burnout(user_id, data_registro);

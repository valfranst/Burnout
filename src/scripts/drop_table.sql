DROP TABLE IF EXISTS burnout_logs CASCADE;
DROP TABLE IF EXISTS burnout CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Remove os tipos customizados
DROP TYPE IF EXISTS burnout_risk_level CASCADE;
DROP TYPE IF EXISTS burnout_level CASCADE;
DROP TYPE IF EXISTS day_type_enum CASCADE;
DROP TYPE IF EXISTS day_category CASCADE;

-- 3. Remove a função da trigger
DROP FUNCTION IF EXISTS fn_generate_burnout_embedding CASCADE;
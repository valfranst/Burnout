'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client. Check database connectivity and configuration.', err);
  process.exit(-1);
});

// ---------------------------------------------------------------------------
// Rate Limiter — 500 consultas por minuto (sliding window)
// Protege o banco contra rajadas excessivas de queries.
// ---------------------------------------------------------------------------
const DB_RATE_LIMIT = 500;
const DB_RATE_WINDOW_MS = 60 * 1000; // 1 minuto

const _queryTimestamps = [];

function _checkRateLimit() {
  const now = Date.now();
  // Remove timestamps fora da janela atual
  while (_queryTimestamps.length > 0 && _queryTimestamps[0] <= now - DB_RATE_WINDOW_MS) {
    _queryTimestamps.shift();
  }
  if (_queryTimestamps.length >= DB_RATE_LIMIT) {
    const oldestInWindow = _queryTimestamps[0];
    const retryAfterMs = oldestInWindow + DB_RATE_WINDOW_MS - now;
    const err = new Error(
      `Rate limit do banco atingido: ${DB_RATE_LIMIT} consultas por minuto. Tente novamente em ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    err.code = 'DB_RATE_LIMIT';
    err.retryAfterMs = retryAfterMs;
    throw err;
  }
  _queryTimestamps.push(now);
}

// Wraps originais do pool para aplicar o rate limit em todas as queries
const _originalQuery = pool.query.bind(pool);
pool.query = function rateLimitedQuery(...args) {
  _checkRateLimit();
  return _originalQuery(...args);
};

// Também limita queries feitas via client obtido por pool.connect()
const _originalConnect = pool.connect.bind(pool);
pool.connect = async function rateLimitedConnect(...args) {
  const client = await _originalConnect(...args);
  const _originalClientQuery = client.query.bind(client);
  client.query = function rateLimitedClientQuery(...queryArgs) {
    _checkRateLimit();
    return _originalClientQuery(...queryArgs);
  };
  return client;
};

module.exports = pool;

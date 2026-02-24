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
// Rate Limiter — 500 consultas por minuto (sliding window com counter)
// Usa abordagem de janela fixa com reset automático (O(1) por operação)
// em vez de array com shift() que era O(n).
// ---------------------------------------------------------------------------
const DB_RATE_LIMIT = 2000;
const DB_RATE_WINDOW_MS = 60 * 1000; // 1 minuto
const DB_RATE_MAX_RETRIES = 3;
const DB_RATE_RETRY_BASE_MS = 500;

let _windowStart = Date.now();
let _windowCount = 0;

function _checkRateLimit() {
  const now = Date.now();
  // Reset da janela se expirou
  if (now - _windowStart >= DB_RATE_WINDOW_MS) {
    _windowStart = now;
    _windowCount = 0;
  }
  if (_windowCount >= DB_RATE_LIMIT) {
    const retryAfterMs = _windowStart + DB_RATE_WINDOW_MS - now;
    return retryAfterMs; // retorna ms restantes em vez de lançar erro
  }
  _windowCount++;
  return 0; // OK
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps originais do pool para aplicar o rate limit em todas as queries
const _originalQuery = pool.query.bind(pool);
pool.query = async function rateLimitedQuery(...args) {
  for (let attempt = 0; attempt <= DB_RATE_MAX_RETRIES; attempt++) {
    const waitMs = _checkRateLimit();
    if (waitMs > 0) {
      if (attempt >= DB_RATE_MAX_RETRIES) {
        const err = new Error(
          `Rate limit do banco atingido: ${DB_RATE_LIMIT} consultas por minuto após ${DB_RATE_MAX_RETRIES} tentativas.`
        );
        err.code = 'DB_RATE_LIMIT';
        throw err;
      }
      const delay = Math.min(waitMs, DB_RATE_RETRY_BASE_MS * Math.pow(2, attempt));
      await _sleep(delay);
      continue;
    }
    return _originalQuery(...args);
  }
};

// Também limita queries feitas via client obtido por pool.connect()
const _originalConnect = pool.connect.bind(pool);

function _wrapClient(client) {
  if (!client || typeof client.query !== 'function') return client;
  const _originalClientQuery = client.query.bind(client);
  client.query = async function rateLimitedClientQuery(...queryArgs) {
    for (let attempt = 0; attempt <= DB_RATE_MAX_RETRIES; attempt++) {
      const waitMs = _checkRateLimit();
      if (waitMs > 0) {
        if (attempt >= DB_RATE_MAX_RETRIES) {
          const err = new Error(
            `Rate limit do banco atingido: ${DB_RATE_LIMIT} consultas por minuto após ${DB_RATE_MAX_RETRIES} tentativas.`
          );
          err.code = 'DB_RATE_LIMIT';
          throw err;
        }
        const delay = Math.min(waitMs, DB_RATE_RETRY_BASE_MS * Math.pow(2, attempt));
        await _sleep(delay);
        continue;
      }
      return _originalClientQuery(...queryArgs);
    }
  };
  return client;
}

pool.connect = function rateLimitedConnect(cb) {
  // Callback style: connect-pg-simple e outros chamam pool.connect(callback)
  if (typeof cb === 'function') {
    return _originalConnect((err, client, release) => {
      if (err) return cb(err);
      cb(null, _wrapClient(client), release);
    });
  }
  // Promise style
  return _originalConnect().then((client) => _wrapClient(client));
};

// Pool sem rate-limit para uso interno (ex.: session store)
const _unthrottledPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

_unthrottledPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client (unthrottled pool).', err);
});

pool.unthrottledPool = _unthrottledPool;

module.exports = pool;

'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const pool = require('./db');
const passport = require('./auth');

const burnoutRouter = require('./routes/burnout');
const dashboardRouter = require('./routes/dashboard');
const publicRouter = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// Rate Limiters
// ------------------------------------------------------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições atingido. Tente novamente em breve.' },
});

// ------------------------------------------------------------
// Middlewares
// ------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: (() => {
      const secret = process.env.SESSION_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET must be set in production.');
      }
      return secret || 'dev-secret-change-me';
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ------------------------------------------------------------
// CSRF Protection (double-submit cookie pattern)
// ------------------------------------------------------------
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
  errorConfig: {
    statusCode: 403,
    message: 'CSRF token inválido.',
  },
});

// Rota para obter token CSRF (necessário antes de chamadas POST/PUT/DELETE)
app.get('/csrf-token', (_req, res) => {
  res.json({ csrfToken: generateToken(_req, res) });
});

// ------------------------------------------------------------
// Auth Routes
// ------------------------------------------------------------

// Google OAuth2
app.get('/auth/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
  authLimiter,
  passport.authenticate('google', { failureRedirect: '/auth/login' }),
  (_req, res) => res.redirect('/dashboard')
);

// Email + Senha — Cadastro
app.post('/auth/register', authLimiter, doubleCsrfProtection, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, email, name`,
      [email.toLowerCase().trim(), hash, name || null]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }
    console.error('Erro no cadastro:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar.' });
  }
});

// Email + Senha — Login
app.post('/auth/login', authLimiter, doubleCsrfProtection, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Credenciais inválidas.' });
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({ message: 'Login realizado com sucesso.', userId: user.id });
    });
  })(req, res, next);
});

// Logout
app.post('/auth/logout', doubleCsrfProtection, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    return res.json({ message: 'Logout realizado.' });
  });
});

// ------------------------------------------------------------
// Application Routes
// ------------------------------------------------------------
app.use('/burnout-logs', apiLimiter, doubleCsrfProtection, burnoutRouter);
app.use('/dashboard', apiLimiter, dashboardRouter);
app.use('/report', apiLimiter, publicRouter);

// Healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Burnout API rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;

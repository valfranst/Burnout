'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const pool = require('./db');
const passport = require('./auth');

const burnoutRouter = require('./routes/burnout');
const dashboardRouter = require('./routes/dashboard');
const publicRouter = require('./routes/public');
const treinamentoRouter = require('./routes/treinamento');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

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
app.use(cookieParser());

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
const isProduction = process.env.NODE_ENV === 'production';
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dev-secret-change-me',
  getSessionIdentifier: (req) => req.session?.id || '',
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    secure: isProduction,
    sameSite: 'lax',
  },
  errorConfig: {
    statusCode: 403,
    message: 'CSRF token inválido.',
  },
});

// Rota para obter token CSRF (necessário antes de chamadas POST/PUT/DELETE)
app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// ------------------------------------------------------------
// Auth Routes
// ------------------------------------------------------------

// Google OAuth2
app.get('/auth/google', authLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get(
  '/auth/google/callback',
  authLimiter,
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (_req, res) => res.redirect('/dashboard.html')
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

// Usuário autenticado
app.get('/auth/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Não autenticado.' });
  const { id, name, email, picture_url } = req.user;
  return res.json({ id, name, email, picture_url });
});

// ------------------------------------------------------------
// Application Routes (pages)
app.get(['/', '/index.html'], (req, res) => res.render('layout', {
  title: 'Burnout Analysis System',
  user: req.user || null,
  body: 'index',
}));

app.get(['/metricas_pessoais', '/metricas_pessoais.html', '/log', '/log.html'], (req, res) => res.render('layout', {
  title: 'Novo Registro — Burnout Analysis',
  user: req.user || null,
  body: 'metricas_pessoais',
}));

app.get(['/dashboard.html'], (req, res) => res.render('layout', {
  title: 'Dashboard — Burnout Analysis',
  user: req.user || null,
  body: 'dashboard',
}));

app.get(['/report.html'], (req, res) => res.render('layout', {
  title: 'Relatório Público — Burnout Analysis',
  user: req.user || null,
  body: 'report',
}));

app.get(['/treinamento', '/treinamento.html'], (req, res) => res.render('layout', {
  title: 'Treinamento de Modelo — Burnout Analysis',
  user: req.user || null,
  body: 'treinamento',
}));

app.get(['/login', '/login.html'], (_req, res) => res.render('layout', {
  title: 'Login — Burnout Analysis',
  user: null,
  body: 'login',
}));

app.get(['/register', '/register.html'], (_req, res) => res.render('layout', {
  title: 'Cadastro — Burnout Analysis',
  user: null,
  body: 'register',
}));

app.use('/burnout-logs', apiLimiter, doubleCsrfProtection, burnoutRouter);
app.use('/dashboard', apiLimiter, dashboardRouter);
app.use('/report', apiLimiter, publicRouter);
app.use('/treinamento', apiLimiter, doubleCsrfProtection, treinamentoRouter);

// Silencia probe do Chrome DevTools / extensões
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => res.json({}));

// Servir arquivos estáticos da pasta public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Burnout API rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;

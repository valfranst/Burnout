'use strict';

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./db');

// ---------------------------------------------------------------------------
// Cache em memória para deserializeUser — evita consultas repetidas ao banco
// TTL de 5 minutos; limpa entradas expiradas a cada 2 minutos.
// ---------------------------------------------------------------------------
const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const _userCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _userCache) {
    if (now - entry.ts > USER_CACHE_TTL_MS) _userCache.delete(key);
  }
}, 2 * 60 * 1000).unref();

function _invalidateUserCache(id) {
  _userCache.delete(id);
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const cached = _userCache.get(id);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL_MS) {
      return done(null, cached.user);
    }
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0] || false;
    if (user) _userCache.set(id, { user, ts: Date.now() });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Google OAuth2
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const existing = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);

        if (existing.rows.length > 0) {
          const newPicture = profile.photos[0]?.value || null;
          await pool.query(
            'UPDATE users SET last_login = NOW(), picture_url = COALESCE($2, picture_url) WHERE id = $1',
            [existing.rows[0].id, newPicture]
          );
          _invalidateUserCache(existing.rows[0].id);
          // Retorna o usuário com a foto atualizada
          const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [existing.rows[0].id]);
          return done(null, refreshed.rows[0]);
        }

        const result = await pool.query(
          `INSERT INTO users (google_id, email, name, picture_url, email_verified, last_login)
           VALUES ($1, $2, $3, $4, TRUE, NOW())
           ON CONFLICT (email) DO UPDATE
             SET google_id = EXCLUDED.google_id,
                 picture_url = EXCLUDED.picture_url,
                 last_login = NOW()
           RETURNING *`,
          [profile.id, email, profile.displayName, profile.photos[0]?.value || null]
        );
        return done(null, result.rows[0]);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Email + Senha
passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      if (!user || !user.password_hash) {
        return done(null, false, { message: 'Credenciais inválidas.' });
      }
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return done(null, false, { message: 'Credenciais inválidas.' });
      }
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      _invalidateUserCache(user.id);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

module.exports = passport;

'use strict';

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./db');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || false);
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
          await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [existing.rows[0].id]);
          return done(null, existing.rows[0]);
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
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

module.exports = passport;

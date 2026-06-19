// =====================================================================
// routes/auth.js — Sign up, log in, log out, "who am I?".
//
// Every handler below is an Express route function:
//   (req, res) => { ... }
//
// It reads from req.body, talks to the database, and writes to res.
// =====================================================================

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

// -----------------------------------------------------------------
// POST /api/auth/signup
//   Body: { email, password, profile: {...} }
//
// Creates a new user AND their profile in a single transaction.
// On success, automatically logs them in (sets a session cookie).
// -----------------------------------------------------------------
router.post('/signup', async (req, res) => {
  try {
    const { email, password, profile } = req.body || {};

    // --- Input validation ---
    // Never trust what the client sends. Always validate on the server.
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (!profile || typeof profile !== 'object' || !profile.name) {
      return res.status(400).json({ error: 'A name is required in your profile.' });
    }

    // --- Hash the password ---
    // bcrypt is a one-way hash: there's no way to "decrypt" it back to the
    // password. To verify later, we re-hash the user's input and compare.
    //
    // The "10" is the cost factor: 2^10 = 1024 rounds of internal hashing.
    // Higher = slower = harder to brute-force. 10 is a sane default for 2024.
    const passwordHash = await bcrypt.hash(password, 10);

    // --- Insert user + profile atomically ---
    // A "transaction" is a group of DB operations that either ALL succeed
    // or ALL fail. If something blows up halfway, nothing is saved.
    // Like a try/catch in C++ but for the database.
    const insertUser = db.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    );
    const insertProfile = db.prepare(
      'INSERT INTO profiles (user_id, profile_json) VALUES (?, ?)'
    );

    const userId = db.transaction(() => {
      // .run() executes an INSERT/UPDATE/DELETE and returns a result object.
      // .lastInsertRowid is the auto-generated id (since id is INTEGER PRIMARY KEY AUTOINCREMENT).
      const result = insertUser.run(email.toLowerCase().trim(), passwordHash);
      insertProfile.run(result.lastInsertRowid, JSON.stringify(profile));
      return result.lastInsertRowid;
    })();

    // --- Start a session (auto-login) ---
    // Saving userId on req.session is what makes the user "logged in"
    // for all future requests, until they log out or the session expires.
    req.session.userId = userId;

    res.json({ ok: true, userId });
  } catch (err) {
    // SQLite throws an error with code 'SQLITE_CONSTRAINT_UNIQUE' when
    // we try to insert a duplicate email (because of the UNIQUE constraint).
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// -----------------------------------------------------------------
// POST /api/auth/login
//   Body: { email, password }
//
// Verifies the credentials and starts a session.
// -----------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Look up the user by email. .get() returns the first row, or undefined.
    const user = db.prepare('SELECT * FROM users WHERE email = ?')
                  .get(email.toLowerCase().trim());

    // We return the SAME error message whether the email doesn't exist
    // OR the password is wrong. Telling attackers "this email exists"
    // would let them enumerate accounts.
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // bcrypt.compare is designed to take roughly the same amount of time
    // regardless of how much of the hash matches, which helps defend
    // against "timing attacks".
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Mark the session as logged in.
    req.session.userId = user.id;

    res.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// -----------------------------------------------------------------
// POST /api/auth/logout
//   Destroys the current session.
// -----------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    // After destroy, the browser's session cookie no longer points to
    // any valid server-side session, so the user is effectively logged out.
    res.json({ ok: true });
  });
});

// -----------------------------------------------------------------
// GET /api/auth/me
//   Returns basic info about the logged-in user (used by the UI).
// -----------------------------------------------------------------
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?')
                .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user });
});

module.exports = router;

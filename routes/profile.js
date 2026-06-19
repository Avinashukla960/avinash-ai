// =====================================================================
// routes/profile.js — Read and update the logged-in user's profile.
//
// All routes here require authentication (see middleware/auth.js).
// We mount requireAuth once with `router.use(...)` so every route
// below it is automatically protected.
// =====================================================================

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Apply requireAuth to every route in this file.
router.use(requireAuth);

// -----------------------------------------------------------------
// GET /api/profile
//   Returns the current user's profile (parsed from the stored JSON).
// -----------------------------------------------------------------
router.get('/', (req, res) => {
  const row = db.prepare('SELECT profile_json, updated_at FROM profiles WHERE user_id = ?')
                .get(req.userId);

  if (!row) {
    // No profile yet (shouldn't happen if signup collected one, but
    // we handle it gracefully).
    return res.json({ profile: null, updatedAt: null });
  }

  // The DB stores the profile as a JSON string. JSON.parse turns it
  // back into a normal JS object. C++ analogy: deserializing a blob.
  res.json({
    profile: JSON.parse(row.profile_json),
    updatedAt: row.updated_at
  });
});

// -----------------------------------------------------------------
// PUT /api/profile
//   Body: { profile: {...} }
//
// Replaces the entire profile object with whatever the client sends.
// We do this rather than field-by-field updates so the frontend can
// freely add/remove fields without a schema migration.
// -----------------------------------------------------------------
router.put('/', (req, res) => {
  const profile = req.body && req.body.profile;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'profile object is required.' });
  }

  const json = JSON.stringify(profile);

  // UPSERT: INSERT if the row doesn't exist, otherwise UPDATE it.
  // SQLite supports this via "ON CONFLICT ... DO UPDATE".
  const stmt = db.prepare(`
    INSERT INTO profiles (user_id, profile_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      profile_json = excluded.profile_json,
      updated_at   = excluded.updated_at
  `);
  stmt.run(req.userId, json);

  res.json({ ok: true });
});

module.exports = router;

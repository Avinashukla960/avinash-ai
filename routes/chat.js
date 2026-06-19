// =====================================================================
// routes/chat.js — Talk to the AI (Cohere).
//
// On every chat message we:
//   1. Load the user's profile from the DB.
//   2. Build a system prompt (in Cohere this is called the "preamble")
//      that injects the profile (so the AI acts like a coach who
//      already knows them).
//   3. Load the last 10 messages of conversation history.
//   4. Send it all to Cohere.
//   5. Save BOTH the user's message and the AI's reply to the DB.
//
// We also auto-retry on 429 (rate limit) errors with exponential
// backoff, so short bursts don't surface errors to the user.
// =====================================================================

const express = require('express');
const { CohereClient } = require('cohere-ai');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Every route below this line requires the user to be logged in.
router.use(requireAuth);

// -----------------------------------------------------------------
// Cohere client — lazy-instantiated.
//
// We don't create the client at module-load time. That way the server
// can boot cleanly even if COHERE_API_KEY isn't set yet.
// -----------------------------------------------------------------
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.COHERE_API_KEY) {
      throw new Error('Server is missing COHERE_API_KEY in .env');
    }
    _client = new CohereClient({ token: process.env.COHERE_API_KEY });
  }
  return _client;
}

// The Cohere model to use. Change this if you want a different one.
//   command-r-08-2024     – current "command-r" version, capable (default)
//   command-a-03-2025     – newest, very capable
//   c4ai-aya-expanse-8b   – open-source, smaller, free tier
//   c4ai-aya-expanse-32b  – open-source, bigger, free tier
const MODEL = 'command-r-08-2024';

// -----------------------------------------------------------------
// buildSystemPrompt(profile)
//
// Builds the system prompt we send as the `preamble` parameter.
// Cohere's API treats this as persistent instructions for the whole
// conversation.
// -----------------------------------------------------------------
function buildSystemPrompt(profile) {
  const p = profile || {};
  const lines = [
    'You are a friendly, supportive Personal AI Assistant.',
    'You act like a knowledgeable health and lifestyle coach who already knows the user well.',
    '',
    'You already know the following about the user. NEVER ask them to repeat any of it:',
    `- Name: ${p.name || '(not provided)'}`,
    `- Age: ${p.age || '(not provided)'}`,
    `- Goals: ${p.goals || '(not provided)'}`,
    `- Health notes / conditions: ${p.healthNotes || '(none)'}`,
    `- Activity level: ${p.activityLevel || '(not provided)'}`,
    `- Diet preferences: ${p.dietPreferences || '(not provided)'}`,
    `- Anything else the user shared: ${p.anythingElse || '(none)'}`,
    '',
    'IMPORTANT SAFETY RULES:',
    '- You are NOT a doctor and NOT a substitute for professional medical advice.',
    '- If the user describes anything serious, urgent, or potentially dangerous',
    '  (chest pain, severe symptoms, suicidal thoughts, allergic reactions,',
    '  injuries, pregnancy complications, etc.), tell them clearly to seek',
    '  real medical care or contact emergency services immediately.',
    '- For ongoing or unclear health concerns, encourage them to talk to a',
    '  qualified healthcare professional.',
    '',
    'Style:',
    '- Be warm, clear, and concise.',
    '- Use the user\'s name when it feels natural.',
    '- Reference their goals and notes so advice feels personalized.',
    '- If you don\'t know something, say so instead of inventing.'
  ];
  return lines.join('\n');
}

// -----------------------------------------------------------------
// loadHistory(userId, limit)
//
// Returns the user's last `limit` messages in chronological order.
// We don't translate roles here — we do that just before sending
// (see dbMessageToCohere).
// -----------------------------------------------------------------
function loadHistory(userId, limit) {
  const rows = db.prepare(`
    SELECT role, content FROM (
      SELECT role, content, created_at, id FROM messages
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    )
    ORDER BY created_at ASC, id ASC
  `).all(userId, limit);
  return rows;
}

// -----------------------------------------------------------------
// dbMessageToCohere(dbMsg)
//
// Cohere uses different role names than our DB:
//   DB:    'user' | 'assistant'
//   Cohere: 'USER' | 'CHATBOT'   (uppercase!)
//
// We translate at this boundary so the DB schema stays simple.
// -----------------------------------------------------------------
function dbMessageToCohere(dbMsg) {
  return {
    role: dbMsg.role === 'assistant' ? 'CHATBOT' : 'USER',
    message: dbMsg.content
  };
}

// -----------------------------------------------------------------
// callCohereWithRetry(...)
//
// Wraps the Cohere call with automatic retry on 429 (rate limit)
// and 5xx (server errors). Tries up to 3 times with exponential
// backoff.
// -----------------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callCohereWithRetry(client, params) {
  const MAX_ATTEMPTS = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.chat(params);
      // Cohere's response has a `text` field with the reply.
      return response.text.trim();
    } catch (err) {
      lastErr = err;

      // Cohere SDK exposes err.statusCode as the HTTP code.
      const status = err.statusCode || (err.status);
      const isRetryable = status === 429 || status === 500 || status === 503;

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw err;
      }

      const delayMs = 2000 * attempt;
      console.log(`[chat] Rate limited (attempt ${attempt}/${MAX_ATTEMPTS}). Waiting ${delayMs}ms before retry...`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

// -----------------------------------------------------------------
// POST /api/chat
//   Body: { message: "..." }
//   Returns: { reply: "..." }
// -----------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const userMessage = ((req.body && req.body.message) || '').trim();

    // --- Validation ---
    if (!userMessage) {
      return res.status(400).json({ error: 'message is required.' });
    }
    if (userMessage.length > 4000) {
      return res.status(400).json({ error: 'message is too long (max 4000 chars).' });
    }

    // --- 1. Load profile ---
    const profileRow = db.prepare('SELECT profile_json FROM profiles WHERE user_id = ?')
                        .get(req.userId);
    const profile = profileRow ? JSON.parse(profileRow.profile_json) : {};

    // --- 2. Load last 10 messages of history ---
    const history = loadHistory(req.userId, 10);

    // --- 3. Call Cohere (with retry) ---
    // Cohere's chat API takes:
    //   - model:        which model
    //   - message:      the new user message
    //   - preamble:     the system prompt (Cohere's name for it)
    //   - chatHistory:  prior turns (excluding the new message)
    const reply = await callCohereWithRetry(getClient(), {
      model: MODEL,
      message: userMessage,
      preamble: buildSystemPrompt(profile),
      chatHistory: history.map(dbMessageToCohere),
      maxTokens: 1024
    });

    // --- 4. Save both turns to the DB in one transaction ---
    const insert = db.prepare(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'
    );
    db.transaction(() => {
      insert.run(req.userId, 'user', userMessage);
      insert.run(req.userId, 'assistant', reply);
    })();

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({
      error: 'Failed to get a reply from the AI. ' + (err.message || '')
    });
  }
});

// -----------------------------------------------------------------
// GET /api/chat/history
//   Returns the full chat history for the logged-in user (for the UI).
// -----------------------------------------------------------------
router.get('/history', (req, res) => {
  const rows = db.prepare(`
    SELECT id, role, content, created_at FROM messages
    WHERE user_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 1000
  `).all(req.userId);
  res.json({ messages: rows });
});

module.exports = router;

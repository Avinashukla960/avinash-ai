// =====================================================================
// server.js — The main entry point of the app.
//
// In C++ terms this is like `main()`: it sets everything up and then
// starts the event loop (Express's HTTP server).
// =====================================================================

// Load environment variables from .env into process.env.
// (dotenv reads a file called ".env" line-by-line and does
//   process.env.KEY = "value"
// for each KEY=value pair it finds. It only sets keys that aren't
// already set in the environment.)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// Import our route modules (each one exports an Express "Router").
const authRoutes    = require('./routes/auth');
const chatRoutes    = require('./routes/chat');
const profileRoutes = require('./routes/profile');

// Initialize the database (this runs the CREATE TABLE statements).
const db = require('./db');   // eslint-disable-line no-unused-vars

// Create the Express application. In C++ terms: `Express app;`
const app = express();

// PORT comes from the .env file (defaulting to 3000 if not set).
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------
// MIDDLEWARE SETUP
//
// "Middleware" in Express = a function that runs for every request
// before your route handler. Each middleware has the signature
//   (req, res, next)
// and can either:
//   - end the request (res.send / res.status / res.redirect ...), or
//   - call next() to pass control to the NEXT middleware/route.
//
// Think of it like a chain of function calls in C++ where each link
// can decide to short-circuit or pass the baton.
// -----------------------------------------------------------------

// Parse JSON request bodies. Without this, req.body would be undefined
// when the browser sends JSON (e.g. via fetch()). C++ analogy:
// deserializing a struct from a byte stream.
app.use(express.json());

// Parse URL-encoded form bodies (for traditional HTML form submissions).
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public/ directory. So:
//   /signup.html   →  public/signup.html
//   /styles.css    →  public/styles.css
// This is how the HTML/CSS/JS frontend gets delivered to the browser.
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware. A "session" is a per-user chunk of storage on
// the server, identified by a cookie in the browser. We use it to
// remember "user #7 is logged in" across requests.
//
// In a real production app you'd back this with a database or Redis
// (the default MemoryStore works fine for development but resets on
// every server restart and doesn't scale to multiple processes).
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,                // Don't re-save the session on every request.
  saveUninitialized: false,     // Only save sessions that actually have data.
  cookie: {
    httpOnly: true,             // JS in the page can't read the cookie (XSS safe).
    secure: false,              // Set to true if you serve over HTTPS.
    maxAge: 1000 * 60 * 60 * 24 // Cookie (and session) lives for 1 day.
  }
}));

// -----------------------------------------------------------------
// ROUTES
//
// A "route" is a URL pattern + HTTP method + handler function.
// Like a switch-case in C++:
//   if (req.url == "/api/auth/login" && req.method == "POST") { ... }
// Express just lets us register many of these cleanly.
// -----------------------------------------------------------------

// Mount our route modules under URL prefixes.
app.use('/api/auth',    authRoutes);    // /api/auth/signup, /api/auth/login, etc.
app.use('/api/chat',    chatRoutes);    // /api/chat, /api/chat/history
app.use('/api/profile', profileRoutes); // /api/profile (GET, PUT)

// Root route: redirect to chat if logged in, otherwise to login.
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/chat.html');
  } else {
    res.redirect('/login.html');
  }
});

// 404 fallback for any unknown API route.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// -----------------------------------------------------------------
// START THE SERVER
//
// app.listen() binds to a TCP port and starts accepting connections.
// The callback runs once the server is ready.
// -----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✓ avinash.ai running at http://localhost:${PORT}`);
  console.log(`  Open that URL in your browser to get started.`);
});

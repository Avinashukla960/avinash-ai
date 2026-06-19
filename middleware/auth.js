// =====================================================================
// middleware/auth.js — "Is this request from a logged-in user?"
//
// Middleware in Express has the signature (req, res, next). It can:
//   - send a response (ending the request), or
//   - call next() to pass control to the next middleware/handler.
//
// This particular one rejects any request that doesn't have a valid
// session (i.e. the user isn't logged in).
// =====================================================================

function requireAuth(req, res, next) {
  // req.session is the per-user storage object created by express-session.
  // We stored `userId` in it when the user logged in (see routes/auth.js).
  if (!req.session || !req.session.userId) {
    // 401 Unauthorized is the standard HTTP code for "not logged in".
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Convenience: attach the userId directly to the request object so
  // downstream route handlers can just write `req.userId` instead of
  // digging into `req.session.userId`.
  req.userId = req.session.userId;

  // Calling next() hands control to the next handler in the chain.
  next();
}

module.exports = { requireAuth };

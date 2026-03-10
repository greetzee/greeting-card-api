// routes/auth.js

// This is our "gatekeeper"
// It checks if the user has a valid login token

function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;

  // If no token → block access
  if (!tokens[token]) {
    return res.send("Not authorized");
  }

  // Token exists → allow access
  next();
}

module.exports = { requireAuth };

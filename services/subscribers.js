const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const subscribersFile = path.join(dataDir, "subscribers.json");
const tokensFile = path.join(dataDir, "tokens.json");

function getSubscribers() {
  if (!fs.existsSync(subscribersFile)) fs.writeFileSync(subscribersFile, "[]");
  return JSON.parse(fs.readFileSync(subscribersFile));
}
function addSubscriber(email) {
  const subs = getSubscribers();
  const lower = email.toLowerCase();
  if (!subs.includes(lower)) {
    subs.push(lower);
    fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
  }
}
function removeSubscriber(email) {
  const subs = getSubscribers().filter(e => e !== email.toLowerCase());
  fs.writeFileSync(subscribersFile, JSON.stringify(subs, null, 2));
}
function isSubscribed(email) {
  return getSubscribers().includes(email.toLowerCase());
}
function getTokens() {
  if (!fs.existsSync(tokensFile)) fs.writeFileSync(tokensFile, "{}");
  return JSON.parse(fs.readFileSync(tokensFile));
}
function saveToken(token, email) {
  const t = getTokens();
  t[token] = email;
  fs.writeFileSync(tokensFile, JSON.stringify(t));
}
function getToken(token) {
  return getTokens()[token];
}
function requireAuth(req, res, next) {
  const token = req.query.token || req.body.token;
  if (!getToken(token)) return res.status(401).json({ error: "Not authorized" });
  const email = getToken(token);
  if (!isSubscribed(email)) return res.status(403).json({ error: "Not subscribed" });
  req.email = email;
  next();
}

module.exports = { getSubscribers, addSubscriber, removeSubscriber, isSubscribed, getTokens, saveToken, getToken, requireAuth };
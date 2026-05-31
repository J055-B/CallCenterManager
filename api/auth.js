// ─────────────────────────────────────────────
//  JMB Manager — Auth API
//  POST /api/auth?action=login
//  POST /api/auth?action=register
// ─────────────────────────────────────────────
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'jmb-secret-2025';

// ── Init DB ──────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jmb_agents (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username    TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name        TEXT NOT NULL,
      is_admin    BOOLEAN DEFAULT false,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS jmb_invite_codes (
      id          SERIAL PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      used        BOOLEAN DEFAULT false,
      created_by  UUID REFERENCES jmb_agents(id),
      used_by     UUID REFERENCES jmb_agents(id),
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS jmb_clients (
      id          SERIAL PRIMARY KEY,
      agent_id    UUID REFERENCES jmb_agents(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      object_type TEXT NOT NULL,
      record_id   TEXT NOT NULL,
      label       TEXT,
      created_at  TIMESTAMPTZ DEFAULT now(),
      UNIQUE(agent_id, record_id)
    );
    CREATE TABLE IF NOT EXISTS jmb_teams (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      business_unit_id TEXT NOT NULL,
      created_by      UUID REFERENCES jmb_agents(id),
      created_at      TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Default admin
  const exists = await pool.query("SELECT id FROM jmb_agents WHERE username = 'joss'");
  if (exists.rows.length === 0) {
    const hash = await bcrypt.hash('35618728', 10);
    await pool.query(
      "INSERT INTO jmb_agents (username, password_hash, name, is_admin) VALUES ($1,$2,$3,true)",
      ['joss', hash, 'Joss']
    );
  }
}

// ── Helpers ──────────────────────────────────
function authMiddleware(req) {
  const header = req.headers['authorization'] || '';
  if (!header) return null;
  try { return jwt.verify(header.replace('Bearer ', ''), JWT_SECRET); }
  catch { return null; }
}

// ── Handler ──────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await initDB();
  const action = req.query.action;

  // ── LOGIN ──────────────────────────────────
  if (req.method === 'POST' && action === 'login') {
    const { username, password } = req.body;
    const r = await pool.query('SELECT * FROM jmb_agents WHERE username=$1', [username]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Wrong password' });
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, is_admin: user.is_admin },
      JWT_SECRET, { expiresIn: '7d' }
    );
    return res.json({ token, name: user.name, is_admin: user.is_admin });
  }

  // ── REGISTER ───────────────────────────────
  if (req.method === 'POST' && action === 'register') {
    const { username, password, name, invite_code } = req.body;
    if (!username || !password || !name || !invite_code)
      return res.status(400).json({ error: 'All fields required' });
    const inv = await pool.query("SELECT * FROM jmb_invite_codes WHERE code=$1 AND used=false", [invite_code.toUpperCase()]);
    if (!inv.rows[0]) return res.status(400).json({ error: 'Invalid or used invite code' });
    const exists = await pool.query('SELECT id FROM jmb_agents WHERE username=$1', [username]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Username taken' });
    const hash = await bcrypt.hash(password, 10);
    const agent = await pool.query(
      'INSERT INTO jmb_agents (username,password_hash,name,is_admin) VALUES($1,$2,$3,false) RETURNING *',
      [username, hash, name]
    );
    await pool.query('UPDATE jmb_invite_codes SET used=true,used_by=$1,used_at=now() WHERE id=$2',
      [agent.rows[0].id, inv.rows[0].id]);
    const token = jwt.sign({ id: agent.rows[0].id, username, name, is_admin: false }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, name, is_admin: false });
  }

  // ── GENERATE INVITE (admin only) ───────────
  if (req.method === 'POST' && action === 'invite') {
    const user = authMiddleware(req);
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const code = 'JMB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const r = await pool.query('INSERT INTO jmb_invite_codes (code,created_by) VALUES($1,$2) RETURNING *', [code, user.id]);
    return res.json({ code: r.rows[0].code });
  }

  // ── LIST AGENTS (admin only) ────────────────
  if (req.method === 'GET' && action === 'agents') {
    const user = authMiddleware(req);
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const r = await pool.query('SELECT id,username,name,is_admin,created_at FROM jmb_agents ORDER BY created_at DESC');
    return res.json(r.rows);
  }

  // ── LIST INVITES (admin only) ───────────────
  if (req.method === 'GET' && action === 'invites') {
    const user = authMiddleware(req);
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    const r = await pool.query('SELECT * FROM jmb_invite_codes ORDER BY created_at DESC');
    return res.json(r.rows);
  }

  res.status(404).json({ error: 'Not found' });
};

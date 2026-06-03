// ─────────────────────────────────────────────
//  JMB Manager — Fireberry Proxy
//
//  ⚙️  Set in Vercel Environment Variables:
//    FIREBERRY_TOKEN  = your tokenid
//    DATABASE_URL     = Neon PostgreSQL URL
//    JWT_SECRET       = any secret string
// ─────────────────────────────────────────────
const fetch = require('node-fetch');
const jwt   = require('jsonwebtoken');
const { Pool } = require('pg');

const FIREBERRY_API   = 'https://api.powerlink.co.il/api';
const FIREBERRY_TOKEN = process.env.FIREBERRY_TOKEN || '4863e71d-5503-47b3-8745-5217fe928861';
const JWT_SECRET      = process.env.JWT_SECRET      || 'jmb-secret-2025';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function authUser(req) {
  const h = req.headers['authorization'] || '';
  try { return jwt.verify(h.replace('Bearer ', ''), JWT_SECRET); }
  catch { return null; }
}

async function fbGet(path) {
  const r = await fetch(`${FIREBERRY_API}${path}`, {
    headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' }
  });
  return r.json();
}

async function fbPost(body) {
  const r = await fetch(`${FIREBERRY_API}/query`, {
    method: 'POST',
    headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

// Paginate — max 10 pages (250 records) to avoid API abuse
async function fbAll(body) {
  let page = 1, all = [];
  while (page <= 10) {
    const res  = await fbPost({ ...body, page, pageSize: 25 });
    const data = res?.data?.Data || [];
    all = all.concat(data);
    if (res?.data?.IsLastPage !== false || data.length === 0) break;
    page++;
  }
  return all;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  try {

    // ── Single record + logs ──────────────────
    if (action === 'record') {
      const data = await fbGet(`/record/${req.query.type}/${req.query.id}`);
      return res.json(data);
    }

    if (action === 'client_logs') {
      const { id, type } = req.query;
      const rec  = await fbGet(`/record/${type}/${id}`);
      const LOG_TYPES = [
        { key:'orders',      objecttype:13, label:'Orders'      },
        { key:'tasks',       objecttype:6,  label:'Tasks'       },
        { key:'phone_news',  objecttype:7,  label:'Phone News'  },
        { key:'log_statuses',objecttype:16, label:'Log Statuses'},
        { key:'sms',         objecttype:18, label:'SMS'         },
        { key:'emails',      objecttype:8,  label:'Emails'      },
        { key:'account_log', objecttype:17, label:'Account Log' },
      ];
      const logResults = await Promise.all(LOG_TYPES.map(async lt => {
        const d = await fbPost({
          objecttype: lt.objecttype,
          query: `(accountid = '${id}') OR (regardingobjectid = '${id}')`,
          pageSize: 25, page: 1, sortby: 'createdon', sorttype: 'DESC'
        });
        return { key: lt.key, label: lt.label, items: d?.data?.Data || [] };
      }));
      const logs = {};
      logResults.forEach(r => { logs[r.key] = { label: r.label, items: r.items }; });
      return res.json({ record: rec?.data || {}, logs, is_account: type === '1' });
    }

    // ── Query (single page or all pages) ─────
    if (action === 'query' && req.method === 'POST') {
      const body = { ...req.body };
      if (!body.query) delete body.query;
      if (body.getAllPages) {
        delete body.getAllPages;
        const all = await fbAll(body);
        return res.json({ data: { Data: all, IsLastPage: true }, success: true });
      }
      return res.json(await fbPost(body));
    }

    // ── Clients CRUD ──────────────────────────
    if (action === 'clients') {
      if (req.method === 'GET') {
        const r = await pool.query('SELECT * FROM jmb_clients WHERE agent_id=$1 ORDER BY created_at DESC', [user.id]);
        return res.json(r.rows);
      }
      if (req.method === 'POST') {
        const { url, object_type, record_id, label } = req.body;
        try {
          const r = await pool.query(
            'INSERT INTO jmb_clients (agent_id,url,object_type,record_id,label) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [user.id, url, object_type, record_id, label || '']
          );
          return res.json(r.rows[0]);
        } catch(e) {
          if (e.code === '23505') return res.status(409).json({ error: 'Client already added' });
          throw e;
        }
      }
      if (req.method === 'DELETE') {
        await pool.query('DELETE FROM jmb_clients WHERE id=$1 AND agent_id=$2', [req.query.id, user.id]);
        return res.json({ ok: true });
      }
    }

    res.status(404).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('Fireberry error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
//  JMB Manager — Fireberry Proxy API
//
//  ⚙️  CONFIGURATION — set in Vercel Environment Variables:
//    FIREBERRY_TOKEN  = your tokenid
//    FIREBERRY_ORG    = your organization id
//    DATABASE_URL     = Neon PostgreSQL connection string
//    JWT_SECRET       = any secret string
// ─────────────────────────────────────────────
const fetch  = require('node-fetch');
const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');

// ── ⚙️  CONFIG ────────────────────────────────
const FIREBERRY_API   = 'https://api.powerlink.co.il/api';
const FIREBERRY_TOKEN = process.env.FIREBERRY_TOKEN || '4863e71d-5503-47b3-8745-5217fe928861';
const JWT_SECRET      = process.env.JWT_SECRET      || 'jmb-secret-2025';

// ── DB ────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Auth helper ───────────────────────────────
function authUser(req) {
  const h = req.headers['authorization'] || '';
  try { return jwt.verify(h.replace('Bearer ', ''), JWT_SECRET); }
  catch { return null; }
}

// ── Fireberry fetch helpers ───────────────────
async function fbGet(path) {
  const r = await fetch(`${FIREBERRY_API}${path}`, {
    headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' }
  });
  return r.json();
}

async function fbQuery(body) {
  const r = await fetch(`${FIREBERRY_API}/query`, {
    method: 'POST',
    headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

// ── Paginate through ALL results (Fireberry max 25/page) ──────
async function fbQueryAll(body) {
  let page     = 1;
  let allData  = [];
  let isLast   = false;

  while (!isLast) {
    const res     = await fbQuery({ ...body, page, pageSize: 25 });
    const records = res?.data?.Data || [];
    allData = allData.concat(records);
    isLast  = res?.data?.IsLastPage !== false;   // true or undefined = done
    if (records.length === 0) break;             // safety: no records returned
    page++;
    if (page > 80) break;                        // hard limit: 2000 records
  }
  return allData;
}

// ── Main handler ──────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = authUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query.action;

  try {

    // ── GET SINGLE RECORD ─────────────────────
    if (action === 'record') {
      const { type, id } = req.query;
      const data = await fbGet(`/record/${type}/${id}`);
      return res.json(data);
    }

    // ── CLIENT FULL PROFILE + LOGS ────────────
    if (action === 'client_logs') {
      const { id, type } = req.query;
      const recordData = await fbGet(`/record/${type}/${id}`);
      const record     = recordData?.data || {};

      const LOG_TYPES = [
        { key: 'orders',       objecttype: 13, label: 'Orders / Payments' },
        { key: 'account_log',  objecttype: 17, label: 'Account Log'       },
        { key: 'tasks',        objecttype: 6,  label: 'Tasks'             },
        { key: 'phone_news',   objecttype: 7,  label: 'Phone News'        },
        { key: 'log_statuses', objecttype: 16, label: 'Log Statuses'      },
        { key: 'sms',          objecttype: 18, label: 'SMS'               },
        { key: 'emails',       objecttype: 8,  label: 'Emails'            },
        { key: 'find_leads',   objecttype: 19, label: 'Find Leads'        },
        { key: 'qa',           objecttype: 21, label: 'QA'                },
      ];

      const logResults = await Promise.all(
        LOG_TYPES.map(async lt => {
          const body = {
            objecttype: lt.objecttype,
            query: `(accountid = '${id}') OR (regardingobjectid = '${id}')`,
            pageSize: 25, page: 1,
            sortby: 'createdon', sorttype: 'DESC'
          };
          const data  = await fbQuery(body);
          const items = data?.data?.Data || [];
          return { key: lt.key, label: lt.label, items };
        })
      );

      const logs = {};
      logResults.forEach(r => { logs[r.key] = { label: r.label, items: r.items }; });
      return res.json({ record, logs, is_account: type === '1' });
    }

    // ── GENERIC QUERY (with optional pagination) ──
    if (action === 'query' && req.method === 'POST') {
      const body = { ...req.body };
      if (!body.query) delete body.query;

      if (body.getAllPages) {
        delete body.getAllPages;
        const allData = await fbQueryAll(body);
        return res.json({ data: { Data: allData, IsLastPage: true }, success: true });
      }

      const data = await fbQuery(body);
      return res.json(data);
    }

    // ── TEAMS CRUD ────────────────────────────
    if (action === 'teams') {
      if (req.method === 'GET') {
        const r = await pool.query('SELECT * FROM jmb_teams ORDER BY created_at ASC');
        return res.json(r.rows);
      }
      if (req.method === 'POST') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        const { name, business_unit_id } = req.body;
        if (!name || !business_unit_id) return res.status(400).json({ error: 'name and business_unit_id required' });
        const r = await pool.query(
          'INSERT INTO jmb_teams (name, business_unit_id, created_by) VALUES ($1,$2,$3) RETURNING *',
          [name, business_unit_id, user.id]
        );
        return res.json(r.rows[0]);
      }
      if (req.method === 'DELETE') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        await pool.query('DELETE FROM jmb_teams WHERE id=$1', [req.query.id]);
        return res.json({ ok: true });
      }
    }

    // ── CLIENTS CRUD ──────────────────────────
    if (action === 'clients') {
      if (req.method === 'GET') {
        const r = await pool.query(
          'SELECT * FROM jmb_clients WHERE agent_id=$1 ORDER BY created_at DESC',
          [user.id]
        );
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
    console.error('Fireberry API error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

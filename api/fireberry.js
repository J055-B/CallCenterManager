// ─────────────────────────────────────────────
//  JMB Manager — Fireberry Proxy API
//
//  ⚙️  CONFIGURATION
//  Set these in Vercel Environment Variables:
//    FIREBERRY_TOKEN  = your tokenid
//    FIREBERRY_ORG    = your organization id
//
//  All routes require Bearer JWT token in Authorization header
//
//  GET  /api/fireberry?action=record&type=1&id=xxx
//  GET  /api/fireberry?action=client_logs&id=xxx&type=1
//  POST /api/fireberry?action=query   (body = Powerlink query)
//  GET  /api/fireberry?action=team_agents&bu_id=xxx
//  GET  /api/fireberry?action=teams
//  POST /api/fireberry?action=teams   (add team)
//  DELETE /api/fireberry?action=teams&id=xxx
// ─────────────────────────────────────────────
const fetch  = require('node-fetch');
const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');

// ── ⚙️  API CONFIGURATION ────────────────────
// Change these values or set as Vercel env vars
const FIREBERRY_API   = 'https://api.powerlink.co.il/api';
const FIREBERRY_TOKEN = process.env.FIREBERRY_TOKEN || '4863e71d-5503-47b3-8745-5217fe928861';
const FIREBERRY_ORG   = process.env.FIREBERRY_ORG   || 'cfa8e794-71fe-4f08-ac54-4a9209e8b37a';
const JWT_SECRET      = process.env.JWT_SECRET       || 'jmb-secret-2025';

// ── Known Powerlink object types ─────────────
// 1  = Account (paying client)
// 3  = Lead (prospect)
// 9  = CRM User / Agent
// 13 = Order / Payment

// ── DB (for teams storage) ───────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Helpers ───────────────────────────────────
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

async function fbQuery(body) {
  const r = await fetch(`${FIREBERRY_API}/query`, {
    method: 'POST',
    headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
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

    // ── GET SINGLE RECORD ──────────────────────
    // Fetch any Fireberry record by objectType + id
    // e.g. type=1 (Account), type=3 (Lead), type=9 (Agent)
    if (action === 'record') {
      const { type, id } = req.query;
      const data = await fbGet(`/record/${type}/${id}`);
      return res.json(data);
    }

    // ── GET CLIENT FULL PROFILE ────────────────
    // Fetches record + all related logs in parallel
    // type=1 → Account (gold trophy badge)
    // type=3 → Lead
    if (action === 'client_logs') {
      const { id, type } = req.query;

      // Fetch main record
      const recordData = await fbGet(`/record/${type}/${id}`);
      const record = recordData?.data || {};

      // Log object types to check for this client
      // These are the sub-objects visible in Fireberry UI
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

      // Query all log types in parallel
      const logResults = await Promise.all(
        LOG_TYPES.map(async lt => {
          const body = {
            objecttype: lt.objecttype,
            query: `(accountid = '${id}') OR (regardingobjectid = '${id}')`,
            pageSize: 50, page: 1,
            sortby: 'createdon', sorttype: 'DESC'
          };
          const data = await fbQuery(body);
          const items = data?.data?.Data || data?.Data || [];
          return { key: lt.key, label: lt.label, items };
        })
      );

      const logs = {};
      logResults.forEach(r => { logs[r.key] = { label: r.label, items: r.items }; });

      return res.json({ record, logs, is_account: type === '1' });
    }

    // ── GENERIC QUERY ──────────────────────────
    // Pass any Powerlink query body directly
    if (action === 'query' && req.method === 'POST') {
      const data = await fbQuery(req.body);
      return res.json(data);
    }

    // ── TEAM AGENTS (by Business Unit ID) ─────
    // Fetches all ACTIVE agents in a Fireberry Business Unit
    // Pass bu_id = the Business Unit GUID from Fireberry URL
    if (action === 'team_agents') {
      const { bu_id } = req.query;
      if (!bu_id) return res.status(400).json({ error: 'bu_id required' });

      const body = {
        objecttype: 9,
        // Filter by business unit and active status
        query: `(businessunitid = '${bu_id}') AND (statuscode = 1)`,
        pageSize: 100, page: 1,
        sortby: 'fullname', sorttype: 'ASC'
      };

      const data = await fbQuery(body);
      const agents = data?.data?.Data || data?.Data || [];

      // Map to clean agent objects using known field names
      const mapped = agents.map(a => ({
        id:       a.systemuserid || a.id,
        name:     a.fullname     || a.owneridname || a.ownerid,
        email:    a.internalemailaddress || a.email || '',
        title:    a.title        || '',
        brand:    a.pcfsystemfield_brand || a['businessunitid@odata.bind'] || '',
        bu_name:  a.businessunitidname  || '',
        lang:     a.pcfsystemfield_lang || a.languageid || '',
        active:   a.statuscode === 1 || a.isdisabled === false,
        raw:      a  // keep raw data for debugging
      }));

      return res.json({ agents: mapped, total: mapped.length });
    }

    // ── TEAMS CRUD ─────────────────────────────
    // Store/retrieve teams (name + business_unit_id) in DB
    if (action === 'teams') {

      // GET — list all teams
      if (req.method === 'GET') {
        const r = await pool.query('SELECT * FROM jmb_teams ORDER BY created_at ASC');
        return res.json(r.rows);
      }

      // POST — add a new team
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

      // DELETE — remove a team
      if (req.method === 'DELETE') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        const { id } = req.query;
        await pool.query('DELETE FROM jmb_teams WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
    }

    // ── CLIENTS CRUD ───────────────────────────
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
        const { id } = req.query;
        await pool.query('DELETE FROM jmb_clients WHERE id=$1 AND agent_id=$2', [id, user.id]);
        return res.json({ ok: true });
      }
    }

    res.status(404).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('Fireberry API error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

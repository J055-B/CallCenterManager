'use strict';

// ── CONFIG LISTS ──────────────────────────────────────────────
const CFG = {
  areas:    ['FTD','Retention','FTD+Retention','Support','QA','Supervision'],
  brands:   ['Relocation2Canada','CanadaVisa','MigrateEasy','GlobalMove'],
  branches: ['Ashkelon','Tel Aviv','Haifa','Jerusalem','Netanya'],
  langs:    ['Spanish','English','Portuguese','French'],
  cats:     ['Hardware','Peripheral','Furniture','Stationery','Other'],
};

// ── STATE ─────────────────────────────────────────────────────
let agents   = [];
let assets   = [
  {id:'INS-001',name:'Headset', qty:8, cat:'Peripheral'},
  {id:'INS-002',name:'Keyboard',qty:5, cat:'Peripheral'},
  {id:'INS-003',name:'Mouse',   qty:10,cat:'Peripheral'},
  {id:'INS-004',name:'Monitor', qty:4, cat:'Hardware'},
];
let loans    = [];
let returned = [];
let assetCnt = 5;
let loanCnt  = 1;

// Fireberry agent cache — loaded ONCE on login
let fbAgentsCache  = [];   // raw Fireberry data
let agentsForFilter = [];  // filtered (no N/A), for dropdowns

// ── RUNTIME ───────────────────────────────────────────────────
let currentPanel     = 'agents';
let expanded         = {};
let agentSearchOpen  = false;
let agentSearchQuery = '';
let drawerState      = { agent: false, asset: false };
let currentLang      = 'en';
let userRole         = 'viewer';
let appBooted        = false;
let confirmCb        = null;

// ── ACCESS CODES (fallback offline) ───────────────────────────
const ACCESS = { '35618728': 'admin', '000000': 'viewer' };

// N/A brand id — hide from all views
const NA_BRAND_IDS = [1, '1'];

// ── AUTH ──────────────────────────────────────────────────────
async function doLogin() {
  const username = (document.getElementById('pin-user')?.value || '').trim();
  const password = (document.getElementById('pin').value || '').trim();
  if (!username || !password) {
    document.getElementById('l-err').textContent = 'Enter username and password.';
    return;
  }
  const btn = document.getElementById('l-btn');
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  try {
    const result = await doServerLogin(username, password);
    if (result?.ok) {
      userRole = result.is_admin ? 'admin' : 'viewer';
      showApp();
      if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
      return;
    }
    if (result?.error) {
      document.getElementById('l-err').textContent = result.error;
      if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
      return;
    }
  } catch(e) {}

  // Offline fallback
  const role = ACCESS[password];
  if (role) {
    userRole = role;
    try { sessionStorage.setItem('jmb_auth', role); } catch(e) {}
    showApp();
  } else {
    const inp = document.getElementById('pin');
    if (inp) { inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 400); }
    document.getElementById('l-err').textContent = 'Invalid credentials.';
  }
  if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
}

function showApp() {
  document.getElementById('login-screen').classList.add('hide');
  document.getElementById('app').classList.add('show');
  if (!appBooted) { appBooted = true; initApp(); }
  else { applyRole(userRole); }
}

function doLogout() {
  try { sessionStorage.removeItem('jmb_auth'); } catch(e) {}
  userRole = 'viewer'; appBooted = false;
  fbAgentsCache = []; agentsForFilter = []; agents = [];
  const app = document.getElementById('app');
  const ls  = document.getElementById('login-screen');
  if (app) app.classList.remove('show');
  if (ls)  ls.classList.remove('hide');
  const pin = document.getElementById('pin');
  const err = document.getElementById('l-err');
  if (pin) pin.value = '';
  if (err) err.textContent = '';
}

function applyRole(role) {
  const viewer = role === 'viewer';
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = viewer ? 'none' : ''; });
  const badge = document.getElementById('role-badge');
  if (badge) badge.style.display = viewer ? 'flex' : 'none';
  if (viewer) {
    document.querySelectorAll('.li .btn-r, .li .btn-g').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.acts .btn').forEach(b => b.style.display = 'none');
  }
}

// ── INIT ──────────────────────────────────────────────────────
function initApp() {
  loadData();
  loadTheme();
  loadLang();
  buildSelects();
  renderAll();
  applyRole(userRole);
  loadFireberryAgents();  // single async load
}

// ── LOAD AGENTS — one call, cached for the session ───────────
async function loadFireberryAgents() {
  if (fbAgentsCache.length > 0) return; // already loaded

  try {
    // Load page by page — stop when IsLastPage=true
    // Max 20 pages = 500 agents to be safe with API limits
    let page = 1, all = [], done = false;
    while (!done && page <= 20) {
      const res  = await apiPost('/api/fireberry?action=query', {
        objecttype: 9,
        query: '(statuscode = 1)',
        pageSize: 25, page,
        sortby: 'fullname', sorttype: 'ASC'
      });
      const data = res?.data?.Data || [];
      all = all.concat(data);
      done = res?.data?.IsLastPage !== false || data.length === 0;
      page++;
    }

    // Deduplicate by crmuserid
    const seen = new Set();
    const unique = all.filter(a => {
      const id = a.crmuserid || a.ownerid;
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });

    fbAgentsCache   = unique;
    agentsForFilter = unique.filter(a => !NA_BRAND_IDS.includes(a.pcfsystemfield774)
                                      && !NA_BRAND_IDS.includes(Number(a.pcfsystemfield774)));

    // Map to local format (excluding N/A)
    agents = agentsForFilter.map(a => ({
      id:       a.crmuserid || a.ownerid,
      cid:      a.crmuserid || a.ownerid,
      name:     a.fullname  || (a.firstname + ' ' + a.lastname).trim(),
      email:    a.emailaddress1 || '',
      area:     a.pcfsystemfield802name  || '—',
      brand:    a.pcfsystemfield774name  || '—',
      branch:   a.systemfield425name     || '—',
      lang:     a.systemfield578name     || '—',
      position: a.pcfsystemfield3920name || '',
      active:   true,
      fromCRM:  true,
    }));

    renderStats();
    renderAgents();
    populateAgentFilterDropdowns();
    toast('Agents loaded (' + agents.length + ')', 'gn');

  } catch(e) {
    console.error('loadFireberryAgents error:', e);
    toast('Could not load agents from CRM', 'rd');
  }
}

// ── NAVIGATION ────────────────────────────────────────────────
const ALL_PANELS  = ['agents','assets','loans','returned','clients','client-detail','cfg-agents','cfg-assets'];
const MENU_PANELS = ['agents','assets','loans','returned','clients'];

function showPanel(name) {
  currentPanel = name;
  ALL_PANELS.forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.remove('active');
  });
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('active');

  MENU_PANELS.forEach(b => {
    const btn = document.getElementById('nav-' + b);
    if (btn) btn.classList.toggle('active', b === name);
  });

  const sb      = document.getElementById('stats-bar');
  const noStats = name.startsWith('cfg-') || name === 'clients' || name === 'client-detail';
  if (sb) sb.style.display = noStats ? 'none' : 'block';

  if (name === 'agents')     renderAgents();
  if (name === 'assets')     renderAssets();
  if (name === 'loans')      renderLoans();
  if (name === 'returned')   renderReturned();
  if (name === 'cfg-agents') renderCfgAgents();
  if (name === 'cfg-assets') renderCfgAssets();
  if (name === 'clients')    initClientsPanel();
}

// ── UTILS ─────────────────────────────────────────────────────
const pad = (n, p) => String(n).padStart(p, '0');
const ini = n => n.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const now = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

function toast(msg, type = 'gn') {
  const el = document.getElementById('toast');
  if (!el) return;
  const map = { gn:['var(--gnb)','var(--gn)'], rd:['var(--rdb)','var(--rd)'], am:['var(--amb)','var(--am)'] };
  const [bg, border] = map[type] || map.gn;
  el.textContent = msg;
  el.style.background = bg; el.style.borderColor = border; el.style.color = border;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function showConfirm(msg, cb) {
  confirmCb = cb;
  const m = document.getElementById('confirm-msg');
  if (m) m.textContent = msg;
  openModal('confirm-modal');
}

function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// ── SELECTS ───────────────────────────────────────────────────
function fillSelect(id, list, ph) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = `<option value="">${ph}</option>` +
    list.map(v => `<option value="${esc(v)}"${v===cur?' selected':''}>${esc(v)}</option>`).join('');
}

function buildSelects() {
  fillSelect('ag-area',   CFG.areas,    'Select area...');
  fillSelect('ag-brand',  CFG.brands,   'Select brand...');
  fillSelect('ag-branch', CFG.branches, 'Select branch...');
  fillSelect('ag-lang',   CFG.langs,    'Select language...');
  fillSelect('as-cat',    CFG.cats,     'Select category...');
}

// ── STATS ─────────────────────────────────────────────────────
function renderStats() {
  const total = assets.reduce((s, a) => s + Number(a.qty), 0);
  document.getElementById('stats').innerHTML = `
    <div class="stat">   <div class="stat-n">${agents.length}</div><div class="stat-l">Agents (CRM)</div></div>
    <div class="stat gn"><div class="stat-n" style="color:var(--gn)">${agents.length}</div><div class="stat-l">Active</div></div>
    <div class="stat">   <div class="stat-n">${total}</div><div class="stat-l">Total Stock</div></div>
    <div class="stat am"><div class="stat-n" style="color:var(--am)">${loans.length}</div><div class="stat-l">On Loan</div></div>
    <div class="stat cy"><div class="stat-n" style="color:var(--cy)">${returned.length}</div><div class="stat-l">Returned</div></div>`;
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderStats();
  showPanel('agents');
}

// ── PERSIST ───────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('jmb_v4', JSON.stringify({ assets, loans, returned, assetCnt, loanCnt, CFG }));
  } catch(e) {}
}

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem('jmb_v4'));
    if (!d) return;
    if (d.assets)   assets   = d.assets;
    if (d.loans)    loans    = d.loans;
    if (d.returned) returned = d.returned;
    if (d.assetCnt) assetCnt = d.assetCnt;
    if (d.loanCnt)  loanCnt  = d.loanCnt;
    if (d.CFG) Object.keys(d.CFG).forEach(k => { if (CFG[k]) CFG[k] = d.CFG[k]; });
  } catch(e) {}
}

function clearAll() {
  showConfirm('Clear all local data? (CRM agents are not affected)', () => {
    try { localStorage.removeItem('jmb_v4'); } catch(e) {}
    location.reload();
  });
}

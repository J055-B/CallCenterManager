'use strict';

// ── CONFIG LISTS (editable via Settings) ─────────────────────
const CFG = {
  areas:    ['FTD','Retention','FTD+Retention','Support','QA','Supervision'],
  brands:   ['Relocation2Canada','CanadaVisa','MigrateEasy','GlobalMove'],
  branches: ['Ashkelon','Tel Aviv','Haifa','Jerusalem','Netanya'],
  langs:    ['Spanish','English','Portuguese','French'],
  cats:     ['Hardware','Peripheral','Furniture','Stationery','Other'],
};

// ── STATE ────────────────────────────────────────────────────
let agents   = [
  {id:'AG-7513',cid:'346407513',name:'Monica Alva',   area:'FTD+Retention',brand:'Relocation2Canada',branch:'Ashkelon',lang:'Spanish',  active:true},
  {id:'AG-2891',cid:'104562891',name:'Carlos Mendez', area:'FTD',          brand:'CanadaVisa',       branch:'Tel Aviv', lang:'Spanish',  active:true},
  {id:'AG-0034',cid:'298720034',name:'Laura Torres',  area:'Retention',    brand:'Relocation2Canada',branch:'Haifa',    lang:'Portuguese',active:false},
];
let assets   = [
  {id:'INS-001',name:'Headset', qty:8, cat:'Peripheral'},
  {id:'INS-002',name:'Keyboard',qty:5, cat:'Peripheral'},
  {id:'INS-003',name:'Mouse',   qty:10,cat:'Peripheral'},
  {id:'INS-004',name:'Monitor', qty:4, cat:'Hardware'},
];
let loans    = [
  {id:'PR-001',agentId:'AG-7513',assetId:'INS-001',date:'2025-04-28'},
  {id:'PR-002',agentId:'AG-2891',assetId:'INS-002',date:'2025-04-29'},
];
let returned = [];

let assetCnt = 5;
let loanCnt  = 3;

// ── RUNTIME ──────────────────────────────────────────────────
let currentPanel  = 'agents';
let expanded      = {};
let agentSearchOpen  = false;
let agentSearchQuery = '';
let drawerState   = { agent: false, asset: false };
let currentLang   = 'en';
let userRole      = 'viewer';
let appBooted     = false;
let confirmCb     = null;

// ── AUTH ─────────────────────────────────────────────────────
const ACCESS = { '35618728': 'admin', '000000': 'viewer' };

async function doLogin() {
  const username = (document.getElementById('pin-user')?.value || '').trim();
  const password = (document.getElementById('pin').value || '').trim();
  if (!username || !password) {
    document.getElementById('l-err').textContent = 'Enter username and password.';
    return;
  }
  const btn = document.getElementById('l-btn');
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  // Try server auth first
  try {
    const result = await doServerLogin(username, password);
    if (result?.ok) {
      userRole = result.is_admin ? 'admin' : 'viewer';
      document.getElementById('login-screen').classList.add('hide');
      document.getElementById('app').classList.add('show');
      if (!appBooted) { appBooted = true; initApp(); }
      else { applyRole(userRole); }
      if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
      return;
    }
    if (result?.error) {
      document.getElementById('l-err').textContent = result.error;
      if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
      return;
    }
  } catch(e) {}

  // Fallback to local codes (offline mode)
  const role = ACCESS[password];
  if (role) {
    userRole = role;
    try { sessionStorage.setItem('jmb_auth', role); } catch(e) {}
    document.getElementById('login-screen').classList.add('hide');
    document.getElementById('app').classList.add('show');
    if (!appBooted) { appBooted = true; initApp(); }
    else { applyRole(role); }
  } else {
    document.getElementById('pin').classList.add('shake');
    document.getElementById('l-err').textContent = 'Invalid credentials.';
    setTimeout(() => document.getElementById('pin').classList.remove('shake'), 400);
  }
  if (btn) { btn.textContent = 'Enter'; btn.disabled = false; }
}

function doLogout() {
  try { sessionStorage.removeItem('jmb_auth'); } catch(e) {}
  userRole  = 'viewer';
  appBooted = false;
  const app = document.getElementById('app');
  const ls  = document.getElementById('login-screen');
  const pin = document.getElementById('pin');
  const err = document.getElementById('l-err');
  if (app) app.classList.remove('show');
  if (ls)  ls.classList.remove('hide');
  if (pin) pin.value = '';
  if (err) err.textContent = '';
}

function applyRole(role) {
  const viewer = role === 'viewer';
  document.querySelectorAll('.admin-only').forEach(el => { el.style.display = viewer ? 'none' : ''; });
  const badge = document.getElementById('role-badge');
  if (badge) badge.style.display = viewer ? 'flex' : 'none';
  if (viewer) {
    // Hide action buttons but NOT confirm-ok or other modal buttons
    document.querySelectorAll('.li .btn-r, .li .btn-g').forEach(btn => {
      btn.style.display = 'none';
    });
    document.querySelectorAll('.acts .btn').forEach(btn => {
      btn.style.display = 'none';
    });
  }
}

// ── INIT ─────────────────────────────────────────────────────
function initApp() {
  loadData();
  loadTheme();
  loadLang();
  buildSelects();
  renderAll();
  applyRole(userRole);
  // Load real agents from Fireberry
  loadFireberryAgents();
}

// ── LOAD AGENTS FROM FIREBERRY ────────────────────────────────
async function loadFireberryAgents() {
  try {
    // Use getAllPages to get ALL active agents (Fireberry max 25/page)
    const data = await apiPost('/api/fireberry?action=query', {
      objecttype: 9,
      query: "(statuscode = 1)",
      pageSize: 25, page: 1,
      sortby: 'fullname', sorttype: 'ASC',
      getAllPages: true
    });
    const fbAgents = data?.data?.Data || [];
    if (!fbAgents.length) return;

    // Filter out N/A brand (id=1) and map to local format
    const EXCLUDED_BRANDS = ['1', 1];  // N/A brand
    agents = fbAgents
      .filter(a => !EXCLUDED_BRANDS.includes(a.pcfsystemfield774))
      .map(a => ({
        id:      a.crmuserid || a.ownerid,
        cid:     a.crmuserid || a.ownerid,
        name:    a.fullname  || (a.firstname + ' ' + a.lastname).trim(),
        email:   a.emailaddress1 || '',
        area:    a.pcfsystemfield802name  || '—',
        brand:   a.pcfsystemfield774name  || '—',
        branch:  a.systemfield425name     || '—',
        lang:    a.systemfield578name     || '—',
        position:a.pcfsystemfield3920name || '',
        active:  a.statuscode === 1,
        fromCRM: true
      }));

    // Cache ALL agents (including N/A) for client filter
    agentsForFilter = fbAgents.filter(a => !EXCLUDED_BRANDS.includes(a.pcfsystemfield774));

    // Re-render
    renderStats();
    renderAgents();
    populateAgentFilterDropdowns();

    toast('Agents loaded from Fireberry (' + agents.length + ')', 'gn');
  } catch(e) {
    console.error('Failed to load agents from Fireberry:', e);
  }
}

// ── NAVIGATION ───────────────────────────────────────────────
const ALL_PANELS = ['agents','assets','loans','returned','clients','client-detail','cfg-agents','cfg-assets'];
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

  const sb = document.getElementById('stats-bar');
  const noStats = name.startsWith('cfg-') || name === 'teams' || name === 'clients' || name === 'client-detail';
  if (sb) sb.style.display = noStats ? 'none' : 'block';

  if (name === 'agents')     renderAgents();
  if (name === 'assets')     renderAssets();
  if (name === 'loans')      renderLoans();
  if (name === 'returned')   renderReturned();
  if (name === 'cfg-agents') renderCfgAgents();
  if (name === 'cfg-assets') renderCfgAssets();
  if (name === 'clients') initClientsPanel();
}

// ── UTILS ────────────────────────────────────────────────────
const pad  = (n, p) => String(n).padStart(p, '0');
const ini  = n => n.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
const now  = () => new Date().toISOString().slice(0, 10);
const esc  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

function toast(msg, type = 'gn') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  const map = { gn: ['var(--gnb)','var(--gn)'], rd: ['var(--rdb)','var(--rd)'], am: ['var(--amb)','var(--am)'] };
  const [bg, border] = map[type] || map.gn;
  el.style.background   = bg;
  el.style.borderColor  = border;
  el.style.color        = border;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function showConfirm(msg, cb) {
  confirmCb = cb;
  const m = document.getElementById('confirm-msg');
  if (m) m.textContent = msg;
  openModal('confirm-modal');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// ── SELECTS ──────────────────────────────────────────────────
function fillSelect(id, list, ph) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = el.value;
  el.innerHTML = `<option value="">${ph}</option>` +
    list.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function buildSelects() {
  fillSelect('ag-area',   CFG.areas,    'Select area...');
  fillSelect('ag-brand',  CFG.brands,   'Select brand...');
  fillSelect('ag-branch', CFG.branches, 'Select branch...');
  fillSelect('ag-lang',   CFG.langs,    'Select language...');
  fillSelect('as-cat',    CFG.cats,     'Select category...');
}

// ── STATS ────────────────────────────────────────────────────
function renderStats() {
  const active = agents.filter(a => a.active).length;
  const total  = assets.reduce((s, a) => s + Number(a.qty), 0);
  const fromCRM = agents.some(a => a.fromCRM);
  document.getElementById('stats').innerHTML = `
    <div class="stat">   <div class="stat-n">${agents.length}</div><div class="stat-l">${fromCRM ? 'Agents (CRM)' : 'Agents'}</div></div>
    <div class="stat gn"><div class="stat-n" style="color:var(--gn)">${active}</div><div class="stat-l">Active</div></div>
    <div class="stat">   <div class="stat-n">${total}</div><div class="stat-l">Total Stock</div></div>
    <div class="stat am"><div class="stat-n" style="color:var(--am)">${loans.length}</div><div class="stat-l">On Loan</div></div>
    <div class="stat cy"><div class="stat-n" style="color:var(--cy)">${returned.length}</div><div class="stat-l">Returned</div></div>`;
}
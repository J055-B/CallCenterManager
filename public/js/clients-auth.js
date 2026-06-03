// ════════════════════════════════════════════════════════════
//  ⚙️  SERVER CONFIGURATION
//  Change API_BASE to your Vercel deployment URL
//  e.g. 'https://jmb-manager.vercel.app'
// ════════════════════════════════════════════════════════════
const API_BASE = window.location.origin;  // auto-detects when deployed

// ── JWT Token management ─────────────────────────────────────
let jwtToken = null;
let currentUser = null;

function getToken() { return jwtToken || localStorage.getItem('jmb_jwt'); }
function setToken(t, user) {
  jwtToken = t;
  currentUser = user;
  if (t) localStorage.setItem('jmb_jwt', t);
  else   localStorage.removeItem('jmb_jwt');
}

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

async function apiGet(path) {
  const r = await fetch(API_BASE + path, { headers: apiHeaders() });
  if (r.status === 401) { doLogout(); return null; }
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(API_BASE + path, {
    method: 'POST', headers: apiHeaders(), body: JSON.stringify(body)
  });
  return r.json();
}

async function apiDelete(path) {
  const r = await fetch(API_BASE + path, { method: 'DELETE', headers: apiHeaders() });
  return r.json();
}

// ── Server-backed login ──────────────────────────────────────
async function doServerLogin(username, password) {
  try {
    const r = await fetch(API_BASE + '/api/auth?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (data.token) {
      setToken(data.token, { name: data.name, is_admin: data.is_admin });
      return { ok: true, is_admin: data.is_admin };
    }
    return { ok: false, error: data.error };
  } catch(e) {
    // Fallback to local codes if server not available
    return null;
  }
}

// ── TEAMS ────────────────────────────────────────────────────






// ── CLIENTS ──────────────────────────────────────────────────
let clients = [];
let currentClientId = null;






function renderLogItem(type, item) {
  const date = item.createdon ? new Date(item.createdon).toLocaleDateString() : '';
  let title = '', sub = '';
  if (type === 'orders') {
    title = item.name || item.orderid || 'Order';
    const amount = item.totalamount || item.pcfsystemfield_amount || '';
    const method = item[Object.keys(item).find(k=>k.includes('1177name'))||''] || '';
    sub = [amount ? '$'+Number(amount).toLocaleString() : '', method].filter(Boolean).join(' &middot; ');
  } else if (type === 'tasks') {
    title = item.subject || item.name || 'Task';
    sub = item.description || item.statuscodename || '';
  } else if (type === 'phone_news') {
    title = item.subject || item.phonenumber || 'Call';
    sub = item.description || item.directioncodename || '';
  } else if (type === 'sms') {
    title = item.subject || 'SMS';
    sub = item.description || item.body || '';
  } else if (type === 'emails') {
    title = item.subject || 'Email';
    sub = item.description || '';
  } else {
    title = item.subject || item.name || item.description || 'Log entry';
    sub = item.statuscodename || '';
  }
  return `<div class="log-item">
    <div class="log-item-date">${date}</div>
    <div class="log-item-body">
      <div class="log-item-title">${esc(title)}</div>
      ${sub ? `<div class="log-item-sub">${esc(String(sub))}</div>` : ''}
    </div>
  </div>`;
}

function switchLogTab(key) {
  document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.log-pane').forEach(p => p.classList.remove('active'));
  const tab  = document.getElementById('logtab-' + key);
  const pane = document.getElementById('logpane-' + key);
  if (tab)  tab.classList.add('active');
  if (pane) pane.classList.add('active');
}


// ════════════════════════════════════════════════════════════
//  CLIENTS MODULE
// ════════════════════════════════════════════════════════════

let clientsLeads    = [];
let clientsAccounts = [];
let clientTab       = 'leads';
let agentsForFilter = [];  // cached agents for filter dropdown

// ── Init panel: load agents for dropdown ──────────────────────
async function initClientsPanel() {
  // Use cached agents — no extra API call
  if (agentsForFilter.length > 0) {
    populateClientDropdowns();
  } else {
    // Agents not loaded yet — wait for loadFireberryAgents to finish
    setTimeout(initClientsPanel, 500);
  }
}

function populateClientDropdowns() {
  const EXCL = [1, '1', 1];
  const brands = {}, branches = {};

  agentsForFilter.forEach(a => {
    const bid = String(a.pcfsystemfield774 || '');
    const bn  = a.pcfsystemfield774name || '';
    if (bid && bn && !EXCL.includes(a.pcfsystemfield774) && !EXCL.includes(Number(bid)))
      brands[bid] = bn;

    const rid = String(a.systemfield425 || '');
    const rn  = a.systemfield425name || '';
    if (rid && rn) branches[rid] = rn;
  });

  const brandSel = document.getElementById('cf-brand');
  if (brandSel) {
    brandSel.innerHTML = '<option value="">All Brands</option>' +
      Object.entries(brands).sort((a,b)=>a[1].localeCompare(b[1]))
        .map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
  }

  const branchSel = document.getElementById('cf-branch');
  if (branchSel) {
    branchSel.innerHTML = '<option value="">All Branches</option>' +
      Object.entries(branches).sort((a,b)=>a[1].localeCompare(b[1]))
        .map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
  }

  const agentSel = document.getElementById('cf-agent');
  if (agentSel) agentSel.innerHTML = '<option value="">All Agents</option>';
}



function buildClientQuery() {
  const brand  = document.getElementById('cf-brand')?.value;
  const branch = document.getElementById('cf-branch')?.value;
  const agent  = document.getElementById('cf-agent')?.value;

  // For leads (obj 3): brand=pcfsystemfield733, branch=pcfsystemfield3861, agent=pcfsystemfield655
  const leadParts = [];
  if (brand)  leadParts.push(`(pcfsystemfield733 = '${brand}')`);
  if (branch) leadParts.push(`(pcfsystemfield3861 = '${branch}')`);
  if (agent)  leadParts.push(`(pcfsystemfield655 = '${agent}')`);

  // For accounts (obj 1): brand=pcfsystemfield733, agent=ownerid
  const accountParts = [];
  if (brand)  accountParts.push(`(pcfsystemfield733 = '${brand}')`);
  if (agent)  accountParts.push(`(ownerid = '${agent}')`);

  return {
    leadQuery:    leadParts.length    ? leadParts.join(' AND ')    : null,
    accountQuery: accountParts.length ? accountParts.join(' AND ') : null
  };
}

// ── Update active filter chips ─────────────────────────────────
function updateFilterChips() {
  const brand  = document.getElementById('cf-brand');
  const branch = document.getElementById('cf-branch');
  const agent  = document.getElementById('cf-agent');
  const box    = document.getElementById('cf-active-filters');
  if (!box) return;

  const chips = [];
  if (brand?.value)  chips.push(`<span class="chip c-pu">${brand.options[brand.selectedIndex].text} <button onclick="clearFilter('cf-brand')" style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px">&#10005;</button></span>`);
  if (branch?.value) chips.push(`<span class="chip c-cy">${branch.options[branch.selectedIndex].text} <button onclick="clearFilter('cf-branch')" style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px">&#10005;</button></span>`);
  if (agent?.value)  chips.push(`<span class="chip c-bl">${agent.options[agent.selectedIndex].text} <button onclick="clearFilter('cf-agent')" style="background:none;border:none;cursor:pointer;color:inherit;padding:0 0 0 4px">&#10005;</button></span>`);
  box.innerHTML = chips.join('');
}

function clearFilter(id) {
  const el = document.getElementById(id);
  if (el) el.value = '';
  updateFilterChips();
}

function onClientFilterChange() {
  updateFilterChips();
}

// ── Main search ────────────────────────────────────────────────
async function searchClients() {
  const { leadQuery, accountQuery } = buildClientQuery();
  updateFilterChips();

  // Show loading
  document.getElementById('clients-leads-list').innerHTML    = '<div class="empty-state"><div class="loading-spin"></div> Loading leads...</div>';
  document.getElementById('clients-accounts-list').innerHTML = '<div class="empty-state"><div class="loading-spin"></div> Loading accounts...</div>';

  // Fetch leads (obj 3) and accounts (obj 1) in parallel — paginate all
  const [leadsData, accountsData] = await Promise.all([
    apiPost('/api/fireberry?action=query', {
      objecttype: 3,
      query:      leadQuery,
      pageSize:   25, page: 1,
      sortby:     'createdon', sorttype: 'DESC',
      getAllPages: true
    }),
    apiPost('/api/fireberry?action=query', {
      objecttype: 1,
      query:      accountQuery,
      pageSize:   25, page: 1,
      sortby:     'createdon', sorttype: 'DESC',
      getAllPages: true
    })
  ]);

  clientsLeads    = leadsData?.data?.Data    || [];
  clientsAccounts = accountsData?.data?.Data || [];

  // Update tab counts
  document.getElementById('ctab-leads-count').textContent    = clientsLeads.length;
  document.getElementById('ctab-accounts-count').textContent = clientsAccounts.length;

  renderClientsList();
}

// ── Render current tab ─────────────────────────────────────────
function renderClientsList() {
  renderLeadsList();
  renderAccountsList();
}

// Main Office owner names to exclude from leads
const EXCLUDE_OWNERS = ['main office', 'main office', 'mainoffice'];

function renderLeadsList() {
  const el = document.getElementById('clients-leads-list');
  if (!el) return;
  // Filter out Main Office leads
  const filtered = clientsLeads.filter(l => {
    const owner = (l.pcfsystemfield655name || l.ownername || '').toLowerCase();
    return !EXCLUDE_OWNERS.includes(owner) && owner !== 'main office';
  });
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-ico">&#128269;</div>No leads found for the selected filters.</div>';
    return;
  }
  el.innerHTML = filtered.map(l => clientLeadRow(l)).join('');
}

function renderAccountsList() {
  const el = document.getElementById('clients-accounts-list');
  if (!el) return;
  if (!clientsAccounts.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-ico">&#129351;</div>No accounts found for the selected filters.</div>';
    return;
  }
  el.innerHTML = clientsAccounts.map(a => clientAccountRow(a)).join('');
}

// ── Lead row ───────────────────────────────────────────────────
function clientLeadRow(l) {
  const name    = (l.fullname || l.firstname || '—').trim();
  const email   = l.emailaddress1 || '';
  const phone   = l.telephone1   || '';
  const status  = l.status       || '';
  const country = l.systemfield32name || '';
  const lang    = l.pcfsystemfield1439name || '';
  const agent   = l.pcfsystemfield655name  || l.ownername || '';
  const created = l.createdon ? new Date(l.createdon).toLocaleDateString() : '';
  const lid     = l.leadid || '';

  const statusColor = {
    'New':          'c-gn',
    'Call Back':    'c-bl',
    'Call Back AC': 'c-bl',
    'No Answer':    'c-am',
    'Not Interested':'c-pu',
    'No Money':     'c-rd',
    'Duplicate':    'c-rd',
  }[status] || 'c-cy';

  return `<div class="li">
    <div class="ih nc" onclick="openClientDetail('${esc(lid)}','3')">
      <div class="av" style="background:var(--gnb);color:var(--gn);border-color:rgba(52,211,153,.2)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      </div>
      <div class="ii">
        <div class="iname">${esc(name)}</div>
        <div class="imeta">
          ${email ? `<span class="isub">&#9993; ${esc(email)}</span>` : ''}
          ${phone ? `<span class="isub">&#128222; ${esc(phone)}</span>` : ''}
          ${country ? `<span class="chip c-am">${esc(country)}</span>` : ''}
          ${lang ? `<span class="chip c-cy">${esc(lang)}</span>` : ''}
        </div>
        <div class="imeta" style="margin-top:3px">
          ${agent ? `<span class="isub">&#128100; ${esc(agent)}</span>` : ''}
          ${created ? `<span class="isub">&#128197; ${created}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <span class="lead-badge">&#9679; LEAD</span>
        <span class="chip ${statusColor}">${esc(status)}</span>
      </div>
    </div>
  </div>`;
}

// ── Account row ────────────────────────────────────────────────
function clientAccountRow(a) {
  const name    = (a.accountname || a.fullname || '—').trim();
  const email   = a.emailaddress1 || a.email || '';
  const phone   = a.telephone1 || a.mobilephone || '';
  const advisor = a.pcfsystemfield3719 || a.owneridname || '';
  const pkg     = a.pcfsystemfield3858name || '';
  const invest  = a.pcfsystemfield3070 ? '$' + Number(a.pcfsystemfield3070).toLocaleString() : '';
  const created = a.createdon ? new Date(a.createdon).toLocaleDateString() : '';
  const aid     = a.accountid || a.id || '';

  return `<div class="li">
    <div class="ih nc" onclick="openClientDetail('${esc(aid)}','1')">
      <div class="av" style="background:rgba(251,176,64,.15);color:#FBB040;border-color:rgba(251,176,64,.3)">
        <svg viewBox="0 0 24 24" fill="#FBB040" stroke="none" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      </div>
      <div class="ii">
        <div class="iname">${esc(name)}</div>
        <div class="imeta">
          ${email ? `<span class="isub">&#9993; ${esc(email)}</span>` : ''}
          ${phone ? `<span class="isub">&#128222; ${esc(phone)}</span>` : ''}
          ${pkg   ? `<span class="chip c-pu">${esc(pkg)}</span>`   : ''}
          ${invest? `<span class="chip c-gn">${invest}</span>`     : ''}
        </div>
        <div class="imeta" style="margin-top:3px">
          ${advisor ? `<span class="isub">&#128100; ${esc(advisor)}</span>` : ''}
          ${created ? `<span class="isub">&#128197; ${created}</span>`      : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <span class="account-badge"><svg viewBox="0 0 24 24" fill="#FBB040" stroke="none" width="11" height="11"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ACCOUNT</span>
      </div>
    </div>
  </div>`;
}

// ── Tab switcher ───────────────────────────────────────────────
function switchClientTab(tab) {
  clientTab = tab;
  const leadsPane    = document.getElementById('clients-leads-pane');
  const accountsPane = document.getElementById('clients-accounts-pane');
  const leadsTab     = document.getElementById('ctab-leads');
  const accountsTab  = document.getElementById('ctab-accounts');

  if (tab === 'leads') {
    if (leadsPane)    leadsPane.style.display    = 'block';
    if (accountsPane) accountsPane.style.display = 'none';
    if (leadsTab)     { leadsTab.style.color = 'var(--ac)'; leadsTab.style.borderBottom = '2px solid var(--ac)'; }
    if (accountsTab)  { accountsTab.style.color = 'var(--t2)'; accountsTab.style.borderBottom = '2px solid transparent'; }
    // update count badge colors
    const lc = document.getElementById('ctab-leads-count');
    const ac = document.getElementById('ctab-accounts-count');
    if (lc) { lc.style.background = 'var(--acg)'; lc.style.color = 'var(--ac)'; }
    if (ac) { ac.style.background = 'var(--s3)';  ac.style.color = 'var(--t2)'; }
  } else {
    if (leadsPane)    leadsPane.style.display    = 'none';
    if (accountsPane) accountsPane.style.display = 'block';
    if (leadsTab)     { leadsTab.style.color = 'var(--t2)'; leadsTab.style.borderBottom = '2px solid transparent'; }
    if (accountsTab)  { accountsTab.style.color = 'var(--am)'; accountsTab.style.borderBottom = '2px solid var(--am)'; }
    if (lc) { lc.style.background = 'var(--s3)';  lc.style.color = 'var(--t2)'; }
    if (ac) { ac.style.background = 'var(--amb)'; ac.style.color = 'var(--am)'; }
  }
}

// ── Open client detail ─────────────────────────────────────────
function openClientDetail(id, type) {
  showPanel('client-detail');
  const el = document.getElementById('client-detail-content');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div class="loading-spin"></div> Loading client data...</div>';

  apiGet(`/api/fireberry?action=client_logs&id=${id}&type=${type}`)
    .then(data => {
      if (!data || data.error) {
        el.innerHTML = `<div class="empty-state" style="color:var(--rd)">${data?.error || 'Error loading client'}</div>`;
        return;
      }
      const r = data.record;
      const logs = data.logs;
      const isAccount = type === '1';

      const name = (r.accountname || r.fullname || r.firstname || '—').trim();
      const badge = isAccount
        ? `<div class="account-badge"><svg viewBox="0 0 24 24" fill="#FBB040" stroke="none" width="14" height="14"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ACCOUNT</div>`
        : `<div class="lead-badge">&#9679; LEAD</div>`;

      const fields = [
        { label:'Name',     value: name },
        { label:'Email',    value: r.emailaddress1 || r.email || '' },
        { label:'Phone',    value: r.telephone1 || r.mobilephone || '' },
        { label:'Country',  value: r.systemfield32name || r.billingcountry || '' },
        { label:'Language', value: r.pcfsystemfield1439name || '' },
        { label:'Agent',    value: r.pcfsystemfield655name || r.ownername || r.owneridname || '' },
        { label:'Status',   value: r.status || r.statuscodename || '' },
        { label:'Source',   value: r.leadsource || '' },
        { label:'Package',  value: r.pcfsystemfield3858name || '' },
        { label:'Investment', value: r.pcfsystemfield3070 ? '$'+Number(r.pcfsystemfield3070).toLocaleString() : '' },
        { label:'Created',  value: r.createdon ? new Date(r.createdon).toLocaleDateString() : '' },
      ].filter(f => f.value);

      const logEntries = Object.entries(logs || {}).filter(([,v]) => v.items && v.items.length > 0);

      const tabsHtml = logEntries.map(([key, v], i) =>
        `<button class="log-tab ${i===0?'active':''}" onclick="switchLogTab('${key}')" id="logtab-${key}">
          ${v.label}<span class="log-count">${v.items.length}</span>
        </button>`).join('');

      const panesHtml = logEntries.map(([key, v], i) =>
        `<div class="log-pane ${i===0?'active':''}" id="logpane-${key}">
          ${v.items.map(item => renderLogItem(key, item)).join('')}
        </div>`).join('');

      el.innerHTML = `
        <div class="client-profile">
          <div class="client-profile-top">
            <div class="client-avatar-lg">${ini(name)}</div>
            <div style="flex:1">
              ${badge}
              <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--t1);margin-bottom:4px">${esc(name)}</div>
              <div style="font-size:12px;color:var(--t2)">Type ${type} &middot; ID: ${id.slice(0,8)}...</div>
            </div>
          </div>
          <div class="client-fields">
            ${fields.map(f => `<div class="client-field"><div class="client-field-label">${f.label}</div><div class="client-field-value">${esc(String(f.value))}</div></div>`).join('')}
          </div>
        </div>
        ${logEntries.length ? `
        <div class="card">
          <div style="padding:14px 16px;border-bottom:1px solid var(--b1)">
            <div class="sh-title" style="margin-bottom:10px">Activity & Logs</div>
            <div class="log-tabs">${tabsHtml}</div>
          </div>
          <div>${panesHtml}</div>
        </div>` : '<div class="empty-state">No activity logs found.</div>'}
      `;
    });
}



// ════════════════════════════════════════════════════════════
//  AGENT FILTER (Brand / Branch — real-time on loaded agents)
// ════════════════════════════════════════════════════════════

let agentFilterBrand  = '';
let agentFilterBranch = '';

function populateAgentFilterDropdowns() {
  // Pull unique brands and branches from loaded agents array
  const brands   = [...new Set(agents.map(a => a.brand).filter(b => b && b !== '—'))].sort();
  const branches = [...new Set(agents.map(a => a.branch).filter(b => b && b !== '—'))].sort();

  const brandSel  = document.getElementById('af-brand');
  const branchSel = document.getElementById('af-branch');
  if (!brandSel || !branchSel) return;

  const curBrand  = brandSel.value;
  const curBranch = branchSel.value;

  brandSel.innerHTML  = '<option value="">All Brands</option>'  + brands.map(b  => `<option value="${esc(b)}" ${b===curBrand?'selected':''}>${esc(b)}</option>`).join('');
  branchSel.innerHTML = '<option value="">All Branches</option>'+ branches.map(b => `<option value="${esc(b)}" ${b===curBranch?'selected':''}>${esc(b)}</option>`).join('');
}

function filterAgentsByBrandBranch() {
  agentFilterBrand  = document.getElementById('af-brand')?.value  || '';
  agentFilterBranch = document.getElementById('af-branch')?.value || '';
  renderAgents();
  // Also update branch dropdown based on brand selection
  if (agentFilterBrand) {
    const branches = [...new Set(agents.filter(a => a.brand === agentFilterBrand).map(a => a.branch).filter(b => b && b !== '—'))].sort();
    const branchSel = document.getElementById('af-branch');
    if (branchSel) {
      const cur = branchSel.value;
      branchSel.innerHTML = '<option value="">All Branches</option>' +
        branches.map(b => `<option value="${esc(b)}" ${b===cur?'selected':''}>${esc(b)}</option>`).join('');
    }
  } else {
    populateAgentFilterDropdowns();
  }
}

function clearAgentFilters() {
  agentFilterBrand = agentFilterBranch = '';
  const bd = document.getElementById('af-brand');
  const br = document.getElementById('af-branch');
  if (bd) bd.value = '';
  if (br) br.value = '';
  renderAgents();
}

// ── Patch renderAgents to apply brand/branch filter ───────────
const _baseRenderAgents = renderAgents;
renderAgents = function() {
  // Temporarily filter agents array based on brand/branch selectors
  const _orig = agents;
  if (agentFilterBrand || agentFilterBranch) {
    agents = _orig.filter(a => {
      const matchBrand  = !agentFilterBrand  || a.brand  === agentFilterBrand;
      const matchBranch = !agentFilterBranch || a.branch === agentFilterBranch;
      return matchBrand && matchBranch;
    });
    // Show result count
    const res = document.getElementById('af-results');
    if (res) res.textContent = agents.length + ' agent' + (agents.length !== 1 ? 's' : '') + ' shown';
  } else {
    const res = document.getElementById('af-results');
    if (res) res.textContent = '';
  }
  _baseRenderAgents();
  agents = _orig;  // restore
  // Populate dropdowns with all available options
  populateAgentFilterDropdowns();
};

// ════════════════════════════════════════════════════════════
//  CLIENTS AGENT DROPDOWN — filtered by Brand + Branch
// ════════════════════════════════════════════════════════════

function updateClientAgentDropdown() {
  const brand  = document.getElementById('cf-brand')?.value;
  const branch = document.getElementById('cf-branch')?.value;
  const sel    = document.getElementById('cf-agent');
  if (!sel) return;

  // Filter from cache — no API call
  let filtered = agentsForFilter;
  if (brand)  filtered = filtered.filter(a => String(a.pcfsystemfield774) === String(brand));
  if (branch) filtered = filtered.filter(a => String(a.systemfield425)    === String(branch));

  sel.innerHTML = `<option value="">All Agents (${filtered.length})</option>` +
    filtered.map(a => `<option value="${esc(a.crmuserid||a.ownerid)}">${esc(a.fullname)}</option>`).join('');
}
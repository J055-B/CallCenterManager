// ── ASSETS ───────────────────────────────────────────────────
function renderAssets() {
  const el = document.getElementById('asset-list');
  if (!el) return;
  if (!assets.length) { el.innerHTML = '<div class="empty-state"><div class="empty-ico">&#128230;</div>No assets registered.</div>'; return; }
  el.innerHTML = assets.map(a => {
    const lent = loans.filter(l => l.assetId === a.id);
    const disp = Number(a.qty) - lent.length;
    const open = expanded['i' + a.id];
    const rows = lent.length
      ? lent.map(l => {
          const ag = agents.find(x => x.id === l.agentId);
          return `<div class="pr">
            <span class="chip c-am">${esc(l.id)}</span>
            <span class="prname">${ag ? esc(ag.name) : '(deleted)'}</span>
            ${ag ? `<span class="chip c-bl">${esc(ag.id)}</span>` : ''}
            <span class="prdate">${l.date}</span>
            <button class="btn btn-sm btn-g" onclick="returnLoan('${esc(l.id)}');event.stopPropagation()">&#10003; Return</button>
            <button class="btn btn-sm btn-r" onclick="deleteLoanConfirm('${esc(l.id)}');event.stopPropagation()">&#10005; Remove</button>
          </div>`;
        }).join('')
      : '<div class="noitem">All available in storage.</div>';

    return `<div class="li">
      <div class="ih" onclick="toggleExp('i${esc(a.id)}')">
        <div class="av ins">&#128230;</div>
        <div class="ii">
          <div class="iname">${esc(a.name)}</div>
          <div class="imeta">
            <span class="chip c-gn">${esc(a.id)}</span>
            <span class="isub">${esc(a.cat)}</span>
            <span class="chip c-gn" style="font-size:10px">Storage: ${disp}</span>
            <span class="chip c-am" style="font-size:10px">On Loan: ${lent.length}</span>
          </div>
        </div>
        <span class="badge ${disp > 0 ? 'b-av' : 'b-out'}">${disp > 0 ? 'Available' : 'Out of stock'}</span>
        <div class="acts" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-r" onclick="deleteAssetConfirm('${esc(a.id)}')">&#10005;</button>
        </div>
        <span class="chev ${open ? 'open' : ''}">&#9658;</span>
      </div>
      <div class="dd ${open ? 'open' : ''}">
        <div class="ddtitle">Agents holding this asset</div>${rows}
      </div>
    </div>`;
  }).join('');
}

function addAsset() {
  const name = (document.getElementById('as-name').value || '').trim();
  const qty  = parseInt(document.getElementById('as-qty').value) || 1;
  const cat  = document.getElementById('as-cat').value;
  if (!name) return;
  assets.push({ id: 'INS-' + pad(assetCnt++, 3), name, qty, cat: cat || 'General' });
  document.getElementById('as-name').value = '';
  document.getElementById('as-qty').value  = '';
  document.getElementById('as-cat').selectedIndex = 0;
  toggleDrawer('asset');
  save(); renderStats(); renderAssets(); toast('Asset added');
}

function deleteAssetConfirm(id) {
  showConfirm('Delete asset and all associated loans?', () => {
    assets = assets.filter(a => a.id !== id);
    loans  = loans.filter(l => l.assetId !== id);
    save(); renderStats(); renderAssets(); toast('Asset deleted');
  });
}

// ── LOANS ────────────────────────────────────────────────────
function renderLoans() {
  const el = document.getElementById('loan-list');
  if (!el) return;
  if (!loans.length) { el.innerHTML = '<div class="empty-state"><div class="empty-ico">&#128260;</div>No active loans.</div>'; return; }
  el.innerHTML = loans.map(l => {
    const ag  = agents.find(a => a.id === l.agentId);
    const ast = assets.find(a => a.id === l.assetId);
    return `<div class="li">
      <div class="ih nc">
        <div class="av">${ag ? ini(ag.name) : '?'}</div>
        <div class="ii">
          <div class="iname" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span>${ag ? esc(ag.name) : '(deleted)'}</span>
            <span class="chip c-bl">${esc(l.agentId)}</span>
            <span style="color:var(--t3);font-size:11px">&#8594;</span>
            <span>${ast ? esc(ast.name) : '(deleted)'}</span>
            <span class="chip c-gn">${esc(l.assetId)}</span>
          </div>
          <div class="imeta">
            <span class="chip c-am">${esc(l.id)}</span>
            <span class="isub">Since ${l.date}</span>
            ${ag ? `<span class="isub">&middot; ${esc(ag.branch)} &middot; ${esc(ag.area)}</span>` : ''}
          </div>
        </div>
        <div class="acts">
          <button class="btn btn-sm btn-g" onclick="returnLoan('${esc(l.id)}')">&#10003; Return</button>
          <button class="btn btn-sm btn-r" onclick="deleteLoanConfirm('${esc(l.id)}')">&#10005;</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openLoanModal() {
  document.getElementById('loan-agent').innerHTML = '<option value="">Select agent...</option>' +
    agents.filter(a => a.active).map(a =>
      `<option value="${esc(a.id)}">${esc(a.name)} [${esc(a.id)}]</option>`).join('');
  document.getElementById('loan-asset').innerHTML = '<option value="">Select asset...</option>' +
    assets.map(a => {
      const d = Number(a.qty) - loans.filter(l => l.assetId === a.id).length;
      return d > 0 ? `<option value="${esc(a.id)}">${esc(a.name)} [${esc(a.id)}] — ${d} avail.</option>` : '';
    }).join('');
  document.getElementById('loan-agent-hint').textContent = '';
  document.getElementById('loan-asset-hint').textContent  = '';
  openModal('loan-modal');
}

function updateLoanHint() {
  const aId = document.getElementById('loan-agent').value;
  const sId = document.getElementById('loan-asset').value;
  const ag  = agents.find(a => a.id === aId);
  const ast = assets.find(a => a.id === sId);
  document.getElementById('loan-agent-hint').textContent = ag  ? `${ag.id}  ·  ${ag.area}  ·  ${ag.branch}` : '';
  document.getElementById('loan-asset-hint').textContent  = ast ? `${ast.id}  ·  ${ast.cat}` : '';
}

function confirmLoan() {
  const aId = document.getElementById('loan-agent').value;
  const sId = document.getElementById('loan-asset').value;
  if (!aId || !sId) { toast('Select an agent and an asset', 'rd'); return; }
  loans.push({ id: 'PR-' + pad(loanCnt++, 3), agentId: aId, assetId: sId, date: now() });
  closeModal('loan-modal');
  save(); renderStats(); renderLoans(); toast('Loan registered');
}

function returnLoan(id) {
  const l   = loans.find(x => x.id === id);
  if (!l) return;
  const ag  = agents.find(a => a.id === l.agentId);
  const ast = assets.find(a => a.id === l.assetId);
  returned.unshift({
    id: l.id, agentId: l.agentId, agentName: ag ? ag.name : '(deleted)',
    assetId: l.assetId, assetName: ast ? ast.name : '(deleted)',
    loanDate: l.date, retDate: now(),
  });
  loans = loans.filter(x => x.id !== id);
  save(); renderStats();
  if (currentPanel === 'agents')  renderAgents();
  else if (currentPanel === 'assets') renderAssets();
  else renderLoans();
  toast('Returned successfully');
}

function deleteLoanConfirm(id) {
  showConfirm('Delete this loan record?', () => {
    loans = loans.filter(l => l.id !== id);
    save(); renderStats();
    if (currentPanel === 'agents')  renderAgents();
    else if (currentPanel === 'assets') renderAssets();
    else renderLoans();
    toast('Loan deleted');
  });
}

// ── RETURNED ─────────────────────────────────────────────────
function renderReturned() {
  const el = document.getElementById('returned-list');
  if (!el) return;
  if (!returned.length) { el.innerHTML = '<div class="empty-state"><div class="empty-ico">&#10003;</div>No returns yet.</div>'; return; }
  el.innerHTML = returned.map(r => `
    <div class="li">
      <div class="ih nc">
        <div class="av ret">&#8617;</div>
        <div class="ii">
          <div class="iname" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span>${esc(r.agentName)}</span><span class="chip c-bl">${esc(r.agentId)}</span>
            <span style="color:var(--t3);font-size:11px">&#8594;</span>
            <span>${esc(r.assetName)}</span><span class="chip c-gn">${esc(r.assetId)}</span>
          </div>
          <div class="imeta">
            <span class="chip c-am">${esc(r.id)}</span>
            <span class="badge b-ret">Returned</span>
            <span class="isub">Loaned: ${r.loanDate} &middot; Returned: ${r.retDate}</span>
          </div>
        </div>
      </div>
    </div>`).join('');
}

// ── CONFIG ────────────────────────────────────────────────────
function cfgCard(title, key, color) {
  const tags = CFG[key].length
    ? CFG[key].map((v, i) =>
        `<span class="cfg-tag">${esc(v)}<button class="cfg-tag-del" onclick="removeCfg('${key}',${i})">&#215;</button></span>`
      ).join('')
    : '<span class="cfg-empty">No options yet</span>';
  return `<div class="cfg-card">
    <div class="cfg-card-title"><span class="cfg-dot" style="background:${color}"></span><span class="cfg-card-label">${title}</span></div>
    <div class="cfg-tags">${tags}</div>
    <div class="cfg-add">
      <input id="ci-${key}" placeholder="Add new option..." onkeydown="if(event.key==='Enter')addCfg('${key}')">
      <button onclick="addCfg('${key}')">+ Add</button>
    </div>
  </div>`;
}

function renderCfgAgents() {
  const el = document.getElementById('cfg-agents-grid');
  if (!el) return;
  el.innerHTML =
    cfgCard('Work Areas', 'areas',    '#A78BFA') +
    cfgCard('Brands',     'brands',   '#4F7FFF') +
    cfgCard('Branches',   'branches', '#22D3EE') +
    cfgCard('Languages',  'langs',    '#34D399');
}

function renderCfgAssets() {
  const el = document.getElementById('cfg-assets-grid');
  if (!el) return;
  el.innerHTML = cfgCard('Asset Categories', 'cats', '#FBB040');
}

function addCfg(key) {
  const inp = document.getElementById('ci-' + key);
  const v   = inp ? inp.value.trim() : '';
  if (!v || CFG[key].includes(v)) { toast('Already exists or empty', 'am'); return; }
  CFG[key].push(v);
  if (inp) inp.value = '';
  buildSelects(); save();
  if (currentPanel === 'cfg-agents') renderCfgAgents();
  if (currentPanel === 'cfg-assets') renderCfgAssets();
  toast('Option added');
}

function removeCfg(key, i) {
  CFG[key].splice(i, 1);
  buildSelects(); save();
  if (currentPanel === 'cfg-agents') renderCfgAgents();
  if (currentPanel === 'cfg-assets') renderCfgAssets();
  toast('Option removed');
}

// ── DRAWER ────────────────────────────────────────────────────
function toggleDrawer(which) {
  drawerState[which] = !drawerState[which];
  const drawer = document.getElementById(which + '-drawer');
  const btnLbl = document.getElementById('add-' + which + '-label');
  const btn    = document.getElementById('btn-add-' + which);
  if (!drawer) return;
  drawer.style.display = drawerState[which] ? 'block' : 'none';
  const labels = { agent:'New Agent', asset:'New Asset', team:'Add Team', client:'Add Client' };
  const focuses = { agent:'ag-name', asset:'as-name', team:'new-team-name', client:'new-client-url' };
  if (drawerState[which]) {
    if (btn) { btn.classList.replace('btn-p', 'btn-r'); }
    if (btnLbl) btnLbl.textContent = 'Cancel';
    setTimeout(() => { const n=document.getElementById(focuses[which]); if(n) n.focus(); }, 50);
  } else {
    if (btn) { btn.classList.replace('btn-r', 'btn-p'); }
    if (btnLbl) btnLbl.textContent = labels[which] || which;
  }
}

// ── EXPAND ────────────────────────────────────────────────────
function toggleExp(key) {
  expanded[key] = !expanded[key];
  if (currentPanel === 'agents') renderAgents();
  else renderAssets();
}

// ── THEME ─────────────────────────────────────────────────────
function toggleTheme() {
  const light = document.body.classList.toggle('light');
  const ico   = document.getElementById('theme-ico');
  const lbl   = document.getElementById('theme-label');
  if (ico) ico.innerHTML = light
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  if (lbl) lbl.textContent = light ? 'Dark Mode' : 'Light Mode';
  try { localStorage.setItem('jmb_theme', light ? 'light' : 'dark'); } catch(e) {}
}

function loadTheme() {
  try {
    if (localStorage.getItem('jmb_theme') === 'light') {
      document.body.classList.add('light');
      const ico = document.getElementById('theme-ico');
      const lbl = document.getElementById('theme-label');
      if (ico) ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      if (lbl) lbl.textContent = 'Dark Mode';
    }
  } catch(e) {}
}

// ── LANGUAGE ──────────────────────────────────────────────────
const LANGS = [
  { code: 'en', iso: 'EN', label: 'English',  native: 'English'  },
  { code: 'es', iso: 'ES', label: 'Spanish',  native: 'Espanol'  },
  { code: 'he', iso: 'HE', label: 'Hebrew',   native: 'Hebrew'   },
  { code: 'fr', iso: 'FR', label: 'French',   native: 'Francais' },
];

function setLanguage(code) {
  currentLang = code;
  try { localStorage.setItem('jmb_lang', code); } catch(e) {}
  closeModal('settings-modal');
  openSettings();
}

function loadLang() {
  try {
    const l = localStorage.getItem('jmb_lang');
    if (l && LANGS.find(x => x.code === l)) currentLang = l;
  } catch(e) {}
}

// ── SETTINGS ──────────────────────────────────────────────────
function openSettings() {
  const grid = document.getElementById('lang-grid');
  const adm  = document.getElementById('settings-admin-section');
  if (!grid) return;
  if (adm) adm.style.display = userRole === 'admin' ? 'block' : 'none';
  grid.innerHTML = '';
  LANGS.forEach(l => {
    const active = currentLang === l.code;
    const btn    = document.createElement('button');
    btn.className = 'lang-btn' + (active ? ' active' : '');
    btn.type      = 'button';
    btn.innerHTML =
      `<span class="lang-iso">${l.iso}</span>` +
      `<span><div class="lang-name">${l.label}</div><div class="lang-native">${l.native}</div></span>` +
      (active ? '<span class="lang-check"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' : '');
    btn.addEventListener('click', () => setLanguage(l.code));
    grid.appendChild(btn);
  });
  openModal('settings-modal');
}

// ── EDIT AGENT ────────────────────────────────────────────────
function fillEditSelect(id, list, ph, current) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${ph}</option>` +
    list.map(v => `<option value="${v}"${v === current ? ' selected' : ''}>${v}</option>`).join('');
}

function openEditAgent(id) {
  const a = agents.find(x => x.id === id);
  if (!a) return;

  document.getElementById('edit-ag-id').value   = a.id;
  document.getElementById('edit-ag-name').value  = a.name;
  document.getElementById('edit-ag-cid').value   = a.cid;
  document.getElementById('edit-ag-id-hint').textContent = `Agent ID: ${a.id}`;

  fillEditSelect('edit-ag-area',   CFG.areas,    'Select area...',     a.area);
  fillEditSelect('edit-ag-brand',  CFG.brands,   'Select brand...',    a.brand);
  fillEditSelect('edit-ag-branch', CFG.branches, 'Select branch...',   a.branch);
  fillEditSelect('edit-ag-lang',   CFG.langs,    'Select language...', a.lang);

  openModal('edit-agent-modal');
}

function saveEditAgent() {
  const id     = document.getElementById('edit-ag-id').value;
  const name   = (document.getElementById('edit-ag-name').value   || '').trim();
  const cid    = (document.getElementById('edit-ag-cid').value    || '').trim();
  const area   = document.getElementById('edit-ag-area').value;
  const brand  = document.getElementById('edit-ag-brand').value;
  const branch = document.getElementById('edit-ag-branch').value;
  const lang   = document.getElementById('edit-ag-lang').value;

  if (!name || !cid) { toast('Name and ID are required', 'rd'); return; }

  const a = agents.find(x => x.id === id);
  if (!a) return;

  // If cid changed, update the agent ID
  const newId = 'AG-' + cid.slice(-4);
  if (newId !== id && agents.find(x => x.id === newId)) {
    toast('ID already exists (same last 4 digits)', 'rd'); return;
  }

  // Update agent
  a.name   = name;
  a.cid    = cid;
  a.id     = newId;
  a.area   = area   || '—';
  a.brand  = brand  || '—';
  a.branch = branch || '—';
  a.lang   = lang   || '—';

  // Update related loans if ID changed
  if (newId !== id) {
    loans.forEach(l => { if (l.agentId === id) l.agentId = newId; });
    returned.forEach(r => { if (r.agentId === id) { r.agentId = newId; r.agentName = name; } });
  }

  closeModal('edit-agent-modal');
  save(); renderStats(); renderAgents(); toast('Agent updated');
}

// ── CLEAR ALL ─────────────────────────────────────────────────
function clearAll() {
  showConfirm('Delete ALL data permanently? This cannot be undone.', () => {
    try { localStorage.removeItem('jmb_v4'); } catch(e) {}
    location.reload();
  });
}

// ── PERSIST ───────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('jmb_v4', JSON.stringify({
      agents, assets, loans, returned, assetCnt, loanCnt, CFG
    }));
  } catch(e) {}
}

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem('jmb_v4'));
    if (!d) return;
    if (d.agents)   agents   = d.agents;
    if (d.assets)   assets   = d.assets;
    if (d.loans)    loans    = d.loans;
    if (d.returned) returned = d.returned;
    if (d.assetCnt) assetCnt = d.assetCnt;
    if (d.loanCnt)  loanCnt  = d.loanCnt;
    if (d.CFG) Object.keys(d.CFG).forEach(k => { if (CFG[k]) CFG[k] = d.CFG[k]; });
  } catch(e) {}
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderStats();
  showPanel('agents');
  // Populate agent filter dropdowns after agents load
  setTimeout(populateAgentFilterDropdowns, 100);
}

// Re-apply role after dynamic renders
const _rA = renderAgents, _rAs = renderAssets, _rL = renderLoans;
renderAgents = function(){ _rA(); if(userRole==='viewer') applyRole('viewer'); };
renderAssets = function(){ _rAs(); if(userRole==='viewer') applyRole('viewer'); };
renderLoans  = function(){ _rL(); if(userRole==='viewer') applyRole('viewer'); };

// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Login bindings
  document.getElementById('l-btn').addEventListener('click', doLogin);
  document.getElementById('pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('pin').addEventListener('input',   () => { document.getElementById('l-err').textContent = ''; });
  document.getElementById('l-eye').addEventListener('click', () => {
    const inp = document.getElementById('pin');
    const eye = document.getElementById('l-eye');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
    eye.innerHTML = inp.type === 'text'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });

  // Modal close on backdrop click
  ['loan-modal','confirm-modal','settings-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { if (e.target === el) closeModal(id); });
  });

  // Confirm OK button
  document.getElementById('confirm-ok').addEventListener('click', () => {
    const cb = confirmCb;
    confirmCb = null;
    closeModal('confirm-modal');
    if (cb) cb();
  });

  // Session resume
  try {
    const r = sessionStorage.getItem('jmb_auth');
    if (r && Object.values(ACCESS).includes(r)) {
      userRole = r;
      document.getElementById('login-screen').classList.add('hide');
      document.getElementById('app').classList.add('show');
      if (!appBooted) { appBooted = true; initApp(); }
    }
  } catch(e) {}
});
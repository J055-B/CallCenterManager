// ── AGENTS ───────────────────────────────────────────────────
function agentRow(a) {
  const my   = loans.filter(l => l.agentId === a.id);
  const open = expanded['a' + a.id];
  const rows = my.length
    ? my.map(l => {
        const ast = assets.find(x => x.id === l.assetId);
        return `<div class="pr">
          <span class="chip c-am">${esc(l.id)}</span>
          <span class="prname">${ast ? esc(ast.name) : '(deleted)'}</span>
          ${ast ? `<span class="chip c-gn">${esc(ast.id)}</span>` : ''}
          <span class="prdate">${l.date}</span>
          <button class="btn btn-sm btn-g" onclick="returnLoan('${esc(l.id)}');event.stopPropagation()">&#10003; Return</button>
          <button class="btn btn-sm btn-r" onclick="deleteLoanConfirm('${esc(l.id)}');event.stopPropagation()">&#10005;</button>
        </div>`;
      }).join('')
    : '<div class="noitem">No active loans</div>';

  return `<div class="li">
    <div class="ih" onclick="toggleExp('a${esc(a.id)}')">
      <div class="av">${ini(a.name)}</div>
      <div class="ii">
        <div class="iname">${esc(a.name)}</div>
        <div class="imeta">
          <span class="chip c-bl">${esc(a.id)}</span>
          <span class="chip c-pu">${esc(a.area)}</span>
          <span class="chip c-cy">${esc(a.brand)}</span>
          <span class="isub">&#128205; ${esc(a.branch)} &middot; ${esc(a.lang)}</span>
        </div>
      </div>
      <span class="badge ${a.active ? 'b-on' : 'b-off'}">${a.active ? 'Active' : 'Inactive'}</span>
      <span class="isub" style="margin:0 8px">${my.length} loan${my.length !== 1 ? 's' : ''}</span>
      <div class="acts" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-edit" onclick="openEditAgent('${esc(a.id)}')">&#9998; Edit</button>
        <button class="btn btn-sm" onclick="toggleAgent('${esc(a.id)}')">${a.active ? 'Deactivate' : 'Activate'}</button>
        <button class="btn btn-sm btn-r" onclick="deleteAgentConfirm('${esc(a.id)}')">&#10005;</button>
      </div>
      <span class="chev ${open ? 'open' : ''}">&#9658;</span>
    </div>
    <div class="dd ${open ? 'open' : ''}">
      <div class="ddtitle">Loaned Assets</div>${rows}
    </div>
  </div>`;
}

function renderAgents() {
  const el = document.getElementById('agent-list');
  if (!el) return;
  const filtered = agentSearchQuery
    ? agents.filter(a =>
        [a.name, a.id, a.cid, a.area, a.brand, a.branch, a.lang]
          .some(v => v.toLowerCase().includes(agentSearchQuery)))
    : agents;

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-ico">&#128100;</div>
      ${agentSearchQuery ? 'No agents match your search.' : 'No agents registered.'}</div>`;
    return;
  }

  // Group: brand → branch
  const byBrand = {};
  filtered.forEach(a => {
    const brand  = a.brand  || '—';
    const branch = a.branch || '—';
    if (!byBrand[brand]) byBrand[brand] = {};
    if (!byBrand[brand][branch]) byBrand[brand][branch] = [];
    byBrand[brand][branch].push(a);
  });

  let html = '';
  Object.keys(byBrand).sort().forEach(brand => {
    const brandOpen  = expanded['brand-' + brand] === true;
    const byBranch   = byBrand[brand];
    const brandTotal = Object.values(byBranch).reduce((s, arr) => s + arr.length, 0);

    html += `<div class="brand-group">
      <div class="brand-hdr" onclick="toggleBrand('${esc(brand)}')">
        <div class="brand-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg></div>
        <span class="brand-name">${esc(brand)}</span>
        <span class="brand-count">${brandTotal} agent${brandTotal !== 1 ? 's' : ''}</span>
        <span class="brand-chev ${brandOpen ? 'open' : ''}">&#9658;</span>
      </div>
      <div class="brand-body ${brandOpen ? 'open' : ''}">`;

    Object.keys(byBranch).sort().forEach(branch => {
      const branchAgents = byBranch[branch];
      const branchOpen   = expanded['branch-' + brand + '-' + branch] === true;
      html += `<div class="branch-group">
        <div class="branch-hdr" onclick="toggleBranch('${esc(brand)}','${esc(branch)}')">
          <div class="branch-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          <span class="branch-name">&#128205; ${esc(branch)}</span>
          <span class="branch-count">${branchAgents.length} agent${branchAgents.length !== 1 ? 's' : ''}</span>
          <span class="branch-chev ${branchOpen ? 'open' : ''}">&#9658;</span>
        </div>
        <div class="branch-body ${branchOpen ? 'open' : ''}">
          <div class="card" style="border-radius:0;border-left:none;border-right:none;border-top:none">
            ${branchAgents.map(a => agentRow(a)).join('')}
          </div>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  el.innerHTML = html;
}

function toggleBrand(brand)  { expanded['brand-' + brand] = !expanded['brand-' + brand]; renderAgents(); }
function toggleBranch(brand, branch) { const k='branch-'+brand+'-'+branch; expanded[k]=!expanded[k]; renderAgents(); }

function addAgent() {
  const name   = (document.getElementById('ag-name').value   || '').trim();
  const cid    = (document.getElementById('ag-id').value     || '').trim();
  const area   = document.getElementById('ag-area').value;
  const brand  = document.getElementById('ag-brand').value;
  const branch = document.getElementById('ag-branch').value;
  const lang   = document.getElementById('ag-lang').value;
  if (!name || !cid) { toast('Name and ID are required', 'rd'); return; }
  const id = 'AG-' + cid.slice(-4);
  if (agents.find(a => a.id === id)) { toast('ID already exists (same last 4 digits)', 'rd'); return; }
  agents.push({ id, cid, name, area: area||'—', brand: brand||'—', branch: branch||'—', lang: lang||'—', active: true });
  document.getElementById('ag-name').value = '';
  document.getElementById('ag-id').value   = '';
  ['ag-area','ag-brand','ag-branch','ag-lang'].forEach(x => { const el=document.getElementById(x); if(el) el.selectedIndex=0; });
  toggleDrawer('agent');
  save(); renderStats(); renderAgents(); toast('Agent added');
}

function toggleAgent(id) {
  const a = agents.find(x => x.id === id);
  if (a) { a.active = !a.active; save(); renderAgents(); renderStats(); }
}

function deleteAgentConfirm(id) {
  showConfirm('Delete agent and all their active loans?', () => {
    agents = agents.filter(a => a.id !== id);
    loans  = loans.filter(l => l.agentId !== id);
    save(); renderStats(); renderAgents(); toast('Agent deleted');
  });
}

// ── SEARCH ───────────────────────────────────────────────────
function toggleAgentSearch() {
  agentSearchOpen = !agentSearchOpen;
  const box = document.getElementById('agent-search-box');
  const btn = document.getElementById('agent-search-btn');
  const inp = document.getElementById('agent-search-input');
  if (box) box.classList.toggle('open', agentSearchOpen);
  if (btn) btn.classList.toggle('active', agentSearchOpen);
  if (agentSearchOpen && inp) inp.focus();
  if (!agentSearchOpen) { clearAgentSearch(); }
}
function openAgentSearch() { if (!agentSearchOpen) toggleAgentSearch(); }

function filterAgents(q) {
  agentSearchQuery = q.toLowerCase().trim();
  const clr = document.getElementById('agent-search-clear');
  if (clr) clr.style.display = agentSearchQuery ? 'inline' : 'none';
  renderAgents();
}

function clearAgentSearch() {
  agentSearchQuery = '';
  const inp = document.getElementById('agent-search-input');
  const clr = document.getElementById('agent-search-clear');
  if (inp) inp.value = '';
  if (clr) clr.style.display = 'none';
  renderAgents();
}
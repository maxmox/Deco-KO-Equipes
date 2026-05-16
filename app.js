/* DECO-KO — Controle de Equipes v6
   Slots fully managed in localStorage: add, remove, reorder */

const STATE_KEY = 'deco-ko-state-v6';
const EDITS_KEY = 'deco-ko-edits-v1';
let appState = {}; // { slots: {teamId:{sgIdx:[{label,worker}]}}, edits:{} }

const firebaseConfig = {
  apiKey: "AIzaSyCHcYzXafUg8rXiUgzGYh2dEqDTPqamnFA",
  authDomain: "decoko-6a92f.firebaseapp.com",
  databaseURL: "https://decoko-6a92f-default-rtdb.firebaseio.com",
  projectId: "decoko-6a92f",
  storageBucket: "decoko-6a92f.firebasestorage.app",
  messagingSenderId: "168414348142",
  appId: "1:168414348142:web:a5a48c542cc56c4de5777f"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
function init() {
  if (sessionStorage.getItem('decoko_auth') !== 'true') {
    document.getElementById('loginOverlay').style.display = 'flex';
  } else {
    document.getElementById('loginOverlay').style.display = 'none';
  }
  
  db.ref('appState').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      appState = data;
    } else {
      initializeDefaultState();
      save(); // Write default to DB
    }
    renderAll();
  }, (error) => {
    alert("Erro ao conectar no Firebase (Banco de Dados): " + error.message + "\n\nO sistema vai carregar offline com o último backup.");
    initializeDefaultState();
    renderAll();
  });

  db.ref('history').on('value', snap => {
    appHistory = snap.val() || [];
    // If modal is open, refresh it
    const modal = document.querySelector('.history-modal');
    if (modal) {
      const parent = modal.parentElement;
      parent.remove();
      openHistoryModal();
    }
  });

  document.getElementById('searchInput').addEventListener('input', onSearch);
  const filterSel = document.getElementById('poolFilterSelect');
  if (filterSel) filterSel.addEventListener('change', () => renderPool(getWorkerTeamMap()));
}

function checkLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (u === 'deco-ko' && p === 'comara123') {
    sessionStorage.setItem('decoko_auth', 'true');
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
}

// ---- PERSISTENCE ----
function initializeDefaultState() {
  if (typeof DEFAULT_BACKUP !== 'undefined' && DEFAULT_BACKUP.appState) {
    appState = JSON.parse(DEFAULT_BACKUP.appState);
    if (DEFAULT_BACKUP.edits) appState.edits = JSON.parse(DEFAULT_BACKUP.edits);
  } else {
    appState = { slots: {}, edits: {}, teams: JSON.parse(JSON.stringify(TEAMS)) };
    appState.teams.forEach(t => {
      appState.slots[t.id] = {};
      t.subgrupos.forEach((sg, si) => {
        appState.slots[t.id][si] = sg.slots.map((s, sli) => ({
          label: s.label,
          worker: DEFAULT_STATE[t.id]?.[String(si)]?.[sli] || null
        }));
      });
    });
  }
  if (!appState.edits) appState.edits = {};
}

function save() { 
  if (appState && appState.slots) {
    db.ref('appState').set(appState);
  }
}
function saveEdits() { save(); }

function getSlots(teamId, sgIdx) {
  return appState.slots[teamId]?.[sgIdx] || [];
}

function getWorkerDisplay(w) {
  const e = appState.edits[w.id] || {};
  return { funcao: e.funcaoCustom || w.funcao, role: e.role || '', descricao: e.descricao || '' };
}

function resetState() {
  if (!confirm('Resetar tudo (alocações, edições, vagas)?')) return;
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(EDITS_KEY);
  appState = {};
  loadAppState();
  renderAll();
}

function exportState() {
  const data = { timestamp: new Date().toISOString(), alocacoes: {} };
  appState.teams.forEach(t => {
    const items = [];
    t.subgrupos.forEach((sg, si) => {
      getSlots(t.id, si).forEach(slot => {
        const w = slot.worker ? WORKERS.find(x => x.id === slot.worker) : null;
        items.push({ vaga: slot.label, trabalhador: w ? w.nome : '—', preenchido: !!slot.worker });
      });
    });
    data.alocacoes[t.nome] = items;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `equipes-${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function exportBackup() {
  const data = {
    appState: localStorage.getItem(STATE_KEY),
    edits: localStorage.getItem(EDITS_KEY)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `decoko-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.appState) {
        localStorage.setItem(STATE_KEY, data.appState);
        if (data.edits) localStorage.setItem(EDITS_KEY, data.edits);
        alert('Backup importado com sucesso!');
        location.reload();
      } else {
        alert('Arquivo inválido ou corrompido.');
      }
    } catch (err) {
      alert('Erro ao ler arquivo: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // reset input
}

function exportToPDF() {
  const wtMap = getWorkerTeamMap();
  const unallocatedMil = WORKERS.filter(w => w.tipo === 'militar' && !wtMap[w.id]);
  const unallocatedCiv = WORKERS.filter(w => w.tipo !== 'militar' && !wtMap[w.id]);

  let html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório de Equipes</title>
      <style>
        body { font-family: sans-serif; font-size: 12px; color: #333; line-height: 1.4; padding: 20px; }
        h1 { text-align: center; margin-bottom: 20px; font-size: 20px; text-transform: uppercase; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
        h2 { font-size: 16px; margin-top: 20px; margin-bottom: 10px; color: #1e293b; background: #f1f5f9; padding: 5px 10px; border-radius: 4px; }
        h3 { font-size: 14px; margin-top: 10px; margin-bottom: 5px; color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
        th { background: #f8fafc; font-weight: bold; width: 40%; }
        .unallocated-section { margin-top: 30px; border-top: 2px solid #ddd; padding-top: 10px; }
        .mil { color: #15803d; font-weight: bold; }
        .empty { color: #94a3b8; font-style: italic; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>Alocação de Equipes - Missão DECO-KO</h1>
  `;

  appState.teams.forEach(t => {
    let hasSlots = false;
    let teamHtml = `<h2>${t.nome}</h2>`;
    t.subgrupos.forEach((sg, si) => {
      const slots = getSlots(t.id, si);
      if (slots.length === 0) return;
      hasSlots = true;
      if (sg.nome && sg.nome.trim() !== '') {
        teamHtml += `<h3>${sg.nome}</h3>`;
      }
      teamHtml += `<table><tbody>`;
      slots.forEach(slot => {
        let workerName = '<span class="empty">A DEFINIR</span>';
        if (slot.worker) {
          const w = WORKERS.find(x => x.id === slot.worker);
          if (w) workerName = w.tipo === 'militar' ? `<span class="mil">${w.nome} (${w.funcao})</span>` : `${w.nome} (${w.funcao})`;
        }
        teamHtml += `<tr><td style="width:100%; border-left:none; border-right:none; padding:4px 0; border-bottom:1px solid #eee;">${workerName}</td></tr>`;
      });
      teamHtml += `</tbody></table>`;
    });
    if (hasSlots) html += teamHtml;
  });

  html += `<div class="unallocated-section"><h2>⚠️ Pessoal Não Alocado (Livres)</h2>`;
  
  html += `<h3>Militares Não Alocados (${unallocatedMil.length})</h3>`;
  if (unallocatedMil.length > 0) {
    html += `<table><tbody>`;
    unallocatedMil.forEach(w => {
      html += `<tr><th class="mil">${w.nome}</th><td>${w.funcao}</td></tr>`;
    });
    html += `</tbody></table>`;
  } else {
    html += `<p>Todos os militares estão alocados.</p>`;
  }

  html += `<h3>Civis Não Alocados (${unallocatedCiv.length})</h3>`;
  if (unallocatedCiv.length > 0) {
    html += `<table><tbody>`;
    unallocatedCiv.forEach(w => {
      html += `<tr><th>${w.nome}</th><td>${w.funcao}</td></tr>`;
    });
    html += `</tbody></table>`;
  } else {
    html += `<p>Todos os civis estão alocados.</p>`;
  }

  html += `</div>
    <script>
      window.onload = function() { setTimeout(function() { window.print(); }, 500); }
    </script>
    </body></html>`;

  const win = window.open('', '_blank');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---- SLOT MANAGEMENT ----
function addSlot(teamId, sgIdx, label) {
  if (!appState.slots[teamId]) appState.slots[teamId] = {};
  if (!appState.slots[teamId][sgIdx]) appState.slots[teamId][sgIdx] = [];
  appState.slots[teamId][sgIdx].push({ label, worker: null });
  save(); renderAll();
}

function removeSlot(teamId, sgIdx, slotIdx) {
  const slots = appState.slots[teamId]?.[sgIdx];
  if (!slots || !slots[slotIdx]) return;
  if (slots[slotIdx].worker) {
    if (!confirm(`Esta vaga tem um trabalhador alocado. Remover mesmo assim?`)) return;
  }
  slots.splice(slotIdx, 1);
  save(); renderAll();
}

function moveSlot(teamId, sgIdx, slotIdx, direction) {
  const slots = appState.slots[teamId]?.[sgIdx];
  if (!slots) return;
  const newIdx = slotIdx + direction;
  if (newIdx < 0 || newIdx >= slots.length) return;
  [slots[slotIdx], slots[newIdx]] = [slots[newIdx], slots[slotIdx]];
  save(); renderAll();
}

function duplicateTeam(teamId) {
  const t = appState.teams.find(x => x.id === teamId);
  if (!t) return;
  const newId = `${teamId}-copy-${Date.now()}`;
  const newTeam = JSON.parse(JSON.stringify(t));
  newTeam.id = newId;
  newTeam.nome = `${t.nome} (Cópia)`;
  appState.teams.push(newTeam);
  
  appState.slots[newId] = {};
  const oldSlots = appState.slots[teamId];
  if (oldSlots) {
    for(let sgIdx in oldSlots) {
      appState.slots[newId][sgIdx] = oldSlots[sgIdx].map(s => ({ label: s.label, worker: null }));
    }
  } else {
    newTeam.subgrupos.forEach((sg, si) => {
      appState.slots[newId][si] = sg.slots.map(s => ({ label: s.label, worker: null }));
    });
  }
  save(); renderAll();
}

function deleteTeam(teamId) {
  if (!confirm('Tem certeza que deseja excluir esta equipe inteira? Todas as vagas serão perdidas.')) return;
  appState.teams = appState.teams.filter(t => t.id !== teamId);
  delete appState.slots[teamId];
  save(); renderAll();
}

function renameTeam(teamId) {
  const t = appState.teams.find(x => x.id === teamId);
  if (!t) return;
  const newName = prompt('Digite o novo nome para esta equipe:', t.nome);
  if (newName !== null && newName.trim() !== '') {
    t.nome = newName.trim();
    save(); renderAll();
  }
}

function renameSubgroup(teamId, sgIdx) {
  const t = appState.teams.find(x => x.id === teamId);
  if (!t) return;
  const sg = t.subgrupos[sgIdx];
  const newName = prompt('Digite o novo título do subgrupo (deixe em branco para ocultar):', sg.nome);
  if (newName !== null) {
    sg.nome = newName.trim();
    save(); renderAll();
  }
}

function assignWorker(teamId, sgIdx, slotIdx, workerId) {
  if (!appState.slots[teamId]) appState.slots[teamId] = {};
  if (!appState.slots[teamId][sgIdx]) appState.slots[teamId][sgIdx] = [];
  appState.slots[teamId][sgIdx][slotIdx].worker = workerId;
  save();
}

function unassignWorker(teamId, sgIdx, slotIdx) {
  appState.slots[teamId][sgIdx][slotIdx].worker = null;
  save();
}

// ---- HELPERS ----
function getWorkerTeamMap() {
  const map = {};
  appState.teams.forEach(t => {
    t.subgrupos.forEach((sg, si) => {
      getSlots(t.id, si).forEach(slot => {
        if (slot.worker) {
          if (!map[slot.worker]) map[slot.worker] = new Set();
          map[slot.worker].add(t.id);
        }
      });
    });
  });
  return map;
}
function getTeamNames(wid, wtMap) {
  return wtMap[wid] ? [...wtMap[wid]].map(tid => appState.teams.find(t => t.id === tid)?.nome || tid) : [];
}

// ---- RENDER ----
function renderAll() {
  const wtMap = getWorkerTeamMap();
  renderPool(wtMap); renderTeams(wtMap); updateStats(wtMap);
}

function renderPool(wtMap) {
  const body = document.getElementById('poolBody'); body.innerHTML = '';
  const filterVal = document.getElementById('poolFilterSelect')?.value || 'todos';
  
  let list = WORKERS;
  if (filterVal === 'alocados') list = WORKERS.filter(w => wtMap[w.id]);
  if (filterVal === 'livres') list = WORKERS.filter(w => !wtMap[w.id]);
  
  document.getElementById('poolCount').textContent = list.length;
  
  const add = (title, sublist) => {
    if (sublist.length === 0) return;
    const h = document.createElement('div'); h.className = 'pool-section';
    h.textContent = `${title} (${sublist.length})`; body.appendChild(h);
    sublist.forEach(w => body.appendChild(mkCard(w, 'pool', null, null, wtMap)));
  };
  add('🟢 Militares', list.filter(w => w.tipo === 'militar'));
  add('🔵 Civis SPTF-KO', list.filter(w => w.subtipo === 'civil-ko'));
  add('🟠 Civis SPTF-BE', list.filter(w => w.subtipo === 'civil-be'));
}

function mkCard(w, fromTeam, fromSg, fromSlot, wtMap) {
  const el = document.createElement('div');
  const tc = wtMap[w.id]?.size || 0;
  const disp = getWorkerDisplay(w);
  el.className = `card ${tc > 1 ? 'duplicate' : ''}`;
  el.draggable = true; el.dataset.workerId = w.id;
  let title = `${w.nomeCompleto}\n${disp.funcao}`;
  if (disp.role) title += `\nCargo: ${disp.role}`;
  if (disp.descricao) title += `\n${disp.descricao}`;
  if (w.servico) title += `\n${w.servico}`;
  if (tc > 0) title += `\n\n📍 ${getTeamNames(w.id, wtMap).join(', ')}`;
  el.title = title;
  let badge = tc > 1 ? `<span class="dup-badge">${tc}×</span>` : (tc === 1 ? '<span style="font-size:9px;color:var(--mil);">✓</span>' : '');
  let roleHtml = disp.role ? `<span class="card-role">${disp.role}</span>` : '';
  el.innerHTML = `<span class="type-badge ${w.subtipo}"></span><span class="card-name">${w.nome}</span>${roleHtml}<span class="card-funcao">${disp.funcao}</span>${badge}`;
  el.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', w.id);
    e.dataTransfer.setData('fromTeam', fromTeam || 'pool');
    e.dataTransfer.setData('fromSg', String(fromSg ?? ''));
    e.dataTransfer.setData('fromSlot', String(fromSlot ?? ''));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); openEditModal(w.id); });
  return el;
}

function renderTeams(wtMap) {
  const c = document.getElementById('teamsScroll'); c.innerHTML = '';
  appState.teams.forEach(t => c.appendChild(mkTeamCol(t, wtMap)));
}

function moveTeam(teamId, direction) {
  const idx = appState.teams.findIndex(t => t.id === teamId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= appState.teams.length) return;
  [appState.teams[idx], appState.teams[newIdx]] = [appState.teams[newIdx], appState.teams[idx]];
  save(); renderAll();
}

function mkTeamCol(team, wtMap) {
  const col = document.createElement('div'); col.className = 'column';
  let filled = 0, total = 0;
  team.subgrupos.forEach((sg, si) => {
    const slots = getSlots(team.id, si);
    total += slots.length;
    filled += slots.filter(s => s.worker).length;
  });
  
  // Calculate if it's the first or last team to disable arrows if needed
  const isFirst = appState.teams[0].id === team.id;
  const isLast = appState.teams[appState.teams.length - 1].id === team.id;

  col.innerHTML = `<div class="column-header">
    <div class="dot" style="background:${team.cor}"></div>
    <h2>${team.nome}</h2><span class="count">${filled}/${total}</span>
    <div class="team-actions">
      <button title="Mover para Esquerda" onclick="moveTeam('${team.id}', -1)" ${isFirst ? 'style="opacity:0.2;cursor:default;" disabled' : ''}>⬅️</button>
      <button title="Mover para Direita" onclick="moveTeam('${team.id}', 1)" ${isLast ? 'style="opacity:0.2;cursor:default;" disabled' : ''}>➡️</button>
      <button title="Renomear Equipe" onclick="renameTeam('${team.id}')">✏️</button>
      <button title="Duplicar Equipe" onclick="duplicateTeam('${team.id}')">📄</button>
      <button title="Excluir Equipe" onclick="deleteTeam('${team.id}')">🗑</button>
    </div>
  </div>`;

  // Filter input
  const filterWrap = document.createElement('div');
  filterWrap.className = 'column-filter';
  filterWrap.innerHTML = `<input type="text" placeholder="Filtrar vagas..." data-team="${team.id}">`;
  const filterInput = filterWrap.querySelector('input');
  filterInput.addEventListener('input', () => filterColumn(col, filterInput.value));
  col.appendChild(filterWrap);

  const body = document.createElement('div'); body.className = 'column-body';

  team.subgrupos.forEach((sg, si) => {
    const sgDiv = document.createElement('div'); sgDiv.className = 'subgroup';
    let sgHeader = '';
    if (sg.nome.trim() !== '') {
      sgHeader = `<div class="subgroup-title" style="display:flex; align-items:center;">
        <span style="flex:1;">${sg.nome}</span>
        <button class="ctrl-btn" title="Renomear Subgrupo" onclick="renameSubgroup('${team.id}', ${si})">✏️</button>
      </div>`;
    } else {
      sgHeader = `<div class="subgroup-title" style="display:flex; justify-content:flex-end;">
        <button class="ctrl-btn" title="Nomear Subgrupo" onclick="renameSubgroup('${team.id}', ${si})">✏️</button>
      </div>`;
    }
    sgDiv.innerHTML = sgHeader;
    const slots = getSlots(team.id, si);

    slots.forEach((slot, sli) => {
      const wid = slot.worker;
      const sl = document.createElement('div');
      sl.className = `slot ${wid ? 'filled' : 'empty'}`;
      // Store searchable text on the slot element
      let searchText = slot.label.toLowerCase();
      if (wid) {
        const w = WORKERS.find(x => x.id === wid);
        if (w) {
          const disp = getWorkerDisplay(w);
          searchText += ` ${w.nome.toLowerCase()} ${w.nomeCompleto.toLowerCase()} ${disp.funcao.toLowerCase()} ${disp.role.toLowerCase()}`;
        }
      }
      sl.dataset.searchText = searchText;

      // Drop zone
      sl.addEventListener('dragover', e => { e.preventDefault(); sl.classList.add('drag-over'); });
      sl.addEventListener('dragleave', () => sl.classList.remove('drag-over'));
      sl.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation(); sl.classList.remove('drag-over');
        const did = e.dataTransfer.getData('text/plain');
        const ft = e.dataTransfer.getData('fromTeam');
        const fs = e.dataTransfer.getData('fromSg');
        const fsl = e.dataTransfer.getData('fromSlot');
        
        const targetWorkerId = slot.worker;
        
        if (ft && ft !== 'pool' && fs !== '' && fsl !== '') {
          if (targetWorkerId) {
            // Swap! Move current worker to the old slot
            assignWorker(ft, parseInt(fs), parseInt(fsl), targetWorkerId);
          } else {
            // Just move, clear old slot
            unassignWorker(ft, parseInt(fs), parseInt(fsl));
          }
        }
        assignWorker(team.id, si, sli, did);
        renderAll();
      });

      if (wid) {
        const w = WORKERS.find(x => x.id === wid);
        if (w) {
          const lb = document.createElement('span'); lb.className = 'slot-label';
          lb.textContent = slot.label; sl.appendChild(lb);
          const cd = mkCard(w, team.id, si, sli, wtMap);
          cd.style.cssText = 'margin:0;flex:1;border:none;padding:2px 4px;background:transparent;';
          sl.appendChild(cd);
          const ctrls = document.createElement('div');
          ctrls.className = 'slot-controls';
          ctrls.innerHTML = `
            <button class="ctrl-btn" title="Mover para cima" ${sli === 0 ? 'disabled' : ''}>▲</button>
            <button class="ctrl-btn" title="Mover para baixo" ${sli === slots.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="ctrl-btn ctrl-rm" title="Remover trabalhador">✕</button>`;
          ctrls.children[0].onclick = (e) => { e.stopPropagation(); moveSlot(team.id, si, sli, -1); };
          ctrls.children[1].onclick = (e) => { e.stopPropagation(); moveSlot(team.id, si, sli, 1); };
          ctrls.children[2].onclick = (e) => { e.stopPropagation(); unassignWorker(team.id, si, sli); save(); renderAll(); };
          sl.appendChild(ctrls);
        }
      } else {
        const labelSpan = document.createElement('span');
        labelSpan.style.cssText = 'flex:1;text-align:center;';
        labelSpan.textContent = slot.label; sl.appendChild(labelSpan);
        const ctrls = document.createElement('div');
        ctrls.className = 'slot-controls';
        ctrls.innerHTML = `
          <button class="ctrl-btn" title="Mover para cima" ${sli === 0 ? 'disabled' : ''}>▲</button>
          <button class="ctrl-btn" title="Mover para baixo" ${sli === slots.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="ctrl-btn ctrl-del" title="Excluir vaga">🗑</button>`;
        ctrls.children[0].onclick = (e) => { e.stopPropagation(); moveSlot(team.id, si, sli, -1); };
        ctrls.children[1].onclick = (e) => { e.stopPropagation(); moveSlot(team.id, si, sli, 1); };
        ctrls.children[2].onclick = (e) => { e.stopPropagation(); removeSlot(team.id, si, sli); };
        sl.appendChild(ctrls);
      }
      sgDiv.appendChild(sl);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-slot-btn';
    addBtn.innerHTML = '➕ Nova vaga';
    addBtn.onclick = () => openAddSlotModal(team.id, si, sg.nome);
    sgDiv.appendChild(addBtn);

    body.appendChild(sgDiv);
  });
  col.appendChild(body); return col;
}

function filterColumn(col, query) {
  const q = query.toLowerCase().trim();
  col.querySelectorAll('.slot').forEach(sl => {
    const text = sl.dataset.searchText || '';
    sl.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
  // Hide subgroup titles if all their slots are hidden
  col.querySelectorAll('.subgroup').forEach(sg => {
    const slots = sg.querySelectorAll('.slot');
    const visible = [...slots].some(s => s.style.display !== 'none');
    sg.style.display = visible || !q ? '' : 'none';
  });
}

// ---- ADD SLOT MODAL ----
function openAddSlotModal(teamId, sgIdx, sgNome) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const team = appState.teams.find(t => t.id === teamId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>➕ Nova Vaga</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Equipe</label><input type="text" class="readonly" value="${team.nome}" readonly></div>
        <div class="field"><label>Subgrupo</label><input type="text" class="readonly" value="${sgNome}" readonly></div>
        <div class="field"><label>Nome da função / vaga</label>
          <input type="text" id="newSlotName" placeholder="Ex: Operador de Serra, Pedreiro...">
          <div class="hint">Nome que aparecerá no slot</div></div>
        <div class="field"><label>Quantidade</label>
          <input type="number" id="newSlotQtd" value="1" min="1" max="20" style="width:80px;">
          <div class="hint">Quantas vagas criar</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-save" id="btnAddSlot">➕ Criar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('btnAddSlot').addEventListener('click', () => {
    const nome = document.getElementById('newSlotName').value.trim();
    const qtd = parseInt(document.getElementById('newSlotQtd').value) || 1;
    if (!nome) { alert('Informe o nome da função'); return; }
    for (let i = 0; i < qtd; i++) addSlot(teamId, sgIdx, qtd > 1 ? `${nome} #${i+1}` : nome);
    overlay.remove();
  });
  setTimeout(() => document.getElementById('newSlotName').focus(), 100);
}

// ---- EDIT MODAL ----
function openEditModal(workerId) {
  const w = WORKERS.find(x => x.id === workerId);
  if (!w) return;
  const e = appState.edits[workerId] || {};
  const wtMap = getWorkerTeamMap();
  const teams = getTeamNames(workerId, wtMap);
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
  const teamsHtml = teams.length ? teams.map(t => `<span class="team-tag">${t}</span>`).join('') : '<span style="color:var(--text2);font-size:10px;">Nenhuma</span>';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="type-badge ${w.subtipo}" style="width:12px;height:12px;border-radius:50%;flex-shrink:0;"></span>
        <h3>${w.nome}</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Nome completo</label><input type="text" class="readonly" value="${w.nomeCompleto}" readonly></div>
        <div class="field"><label>Tipo</label><input type="text" class="readonly" value="${w.subtipo === 'militar' ? 'Militar' : w.subtipo === 'civil-ko' ? 'Civil SPTF-KO' : 'Civil SPTF-BE'}" readonly></div>
        <div class="field"><label>Função (registro)</label><input type="text" class="readonly" value="${w.funcao}" readonly><div class="hint">Original — somente leitura</div></div>
        <div class="field"><label>Função na missão</label><input type="text" id="editFuncao" value="${e.funcaoCustom || w.funcao}"><div class="hint">Exibida no card</div></div>
        <div class="field"><label>Cargo / Posição</label><input type="text" id="editRole" value="${e.role || ''}" placeholder="Encarregado, Chefe..."><div class="hint">Destaque azul</div></div>
        <div class="field"><label>Observações</label><textarea id="editDescricao" placeholder="Anotações...">${e.descricao || ''}</textarea></div>
        <div class="field"><label>Equipes</label><div class="teams-list">${teamsHtml}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn-save" id="btnSaveEdit">💾 Salvar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('btnSaveEdit').addEventListener('click', () => {
    const funcaoCustom = document.getElementById('editFuncao').value.trim();
    const role = document.getElementById('editRole').value.trim();
    const descricao = document.getElementById('editDescricao').value.trim();
    if (funcaoCustom !== w.funcao || role || descricao) {
      appState.edits[workerId] = { funcaoCustom: funcaoCustom || w.funcao, role, descricao };
    } else { delete appState.edits[workerId]; }
    saveEdits(); overlay.remove(); renderAll();
  });
  setTimeout(() => document.getElementById('editFuncao').focus(), 100);
}

// ---- SEARCH ----
function onSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.card').forEach(c => {
    const n = c.querySelector('.card-name')?.textContent.toLowerCase() || '';
    const f = c.querySelector('.card-funcao')?.textContent.toLowerCase() || '';
    const r = c.querySelector('.card-role')?.textContent.toLowerCase() || '';
    c.classList.toggle('hidden', !!q && !n.includes(q) && !f.includes(q) && !r.includes(q));
  });
}

// ---- STATS ----
function updateStats(wtMap) {
  const alloc = Object.keys(wtMap).length;
  let dups = 0;
  Object.values(wtMap).forEach(s => { if (s.size > 1) dups++; });
  document.getElementById('statAllocated').textContent = `Alocados: ${alloc}/${WORKERS.length}`;
  const d = document.getElementById('statDuplicates');
  d.textContent = dups > 0 ? `⚠️ ${dups} em múltiplas equipes` : `✅ Sem duplicidades`;
  d.className = dups > 0 ? 'dup-count' : '';
}

// ---- HISTORY / SNAPSHOTS ----
let appHistory = [];

function getHistory() {
  return appHistory;
}
function saveHistory(h) { 
  db.ref('history').set(h); 
}

function saveSnapshot(name) {
  const h = getHistory();
  const wtMap = getWorkerTeamMap();
  const alloc = Object.keys(wtMap).length;
  let filled = 0, total = 0;
  TEAMS.forEach(t => t.subgrupos.forEach((sg, si) => {
    const slots = getSlots(t.id, si);
    total += slots.length;
    filled += slots.filter(s => s.worker).length;
  }));
  h.unshift({
    id: Date.now(),
    name: name,
    date: new Date().toISOString(),
    slots: JSON.parse(JSON.stringify(appState.slots)),
    edits: JSON.parse(JSON.stringify(appState.edits)),
    stats: { alloc, filled, total, workers: WORKERS.length }
  });
  if (h.length > 50) h.length = 50; // max 50 snapshots
  saveHistory(h);
}

function restoreSnapshot(id) {
  const h = getHistory();
  const snap = h.find(s => s.id === id);
  if (!snap) return;
  if (!confirm(`Restaurar "${snap.name}"? O estado atual será substituído.`)) return;
  appState.slots = JSON.parse(JSON.stringify(snap.slots));
  appState.edits = JSON.parse(JSON.stringify(snap.edits));
  save(); saveEdits(); renderAll();
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
}

function deleteSnapshot(id) {
  const h = getHistory();
  const idx = h.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (!confirm(`Excluir snapshot "${h[idx].name}"?`)) return;
  h.splice(idx, 1);
  saveHistory(h);
  openHistoryModal(); // refresh
}

function openHistoryModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const history = getHistory();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

  let listHtml = '';
  if (history.length === 0) {
    listHtml = '<div style="text-align:center;padding:20px;color:var(--text2);font-size:13px;">Nenhum snapshot salvo ainda.<br>Salve o estado atual para criar o primeiro registro.</div>';
  } else {
    listHtml = history.map(s => {
      const d = new Date(s.date);
      const dateStr = d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
      const timeStr = d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
      const stats = s.stats || {};
      return `<div class="history-item">
        <div class="history-info">
          <div class="history-name">${s.name}</div>
          <div class="history-meta">📅 ${dateStr} às ${timeStr} · 👥 ${stats.alloc || '?'}/${stats.workers || '?'} alocados · ${stats.filled || '?'}/${stats.total || '?'} vagas</div>
        </div>
        <div class="history-actions">
          <button class="btn-hist btn-restore" data-id="${s.id}">↩️ Restaurar</button>
          <button class="btn-hist btn-del" data-id="${s.id}">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  overlay.innerHTML = `
    <div class="modal" style="width:550px;">
      <div class="modal-header">
        <h3>📋 Histórico de Equipes</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:12px 20px;">
        <div class="field">
          <label>Salvar estado atual</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="snapName" placeholder="Ex: Dia 1, Pré-chuva, Config final..." style="flex:1;">
            <button class="btn-save" id="btnSnap" style="white-space:nowrap;">📸 Salvar</button>
          </div>
          <div class="hint">Cria um snapshot que pode ser restaurado depois</div>
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;">Snapshots salvos (${history.length})</label>
          <div class="history-list" style="margin-top:8px;max-height:400px;overflow-y:auto;">${listHtml}</div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('btnSnap').addEventListener('click', () => {
    const name = document.getElementById('snapName').value.trim();
    if (!name) { alert('Dê um nome ao snapshot'); return; }
    saveSnapshot(name);
    openHistoryModal(); // refresh modal
  });

  overlay.querySelectorAll('.btn-restore').forEach(b => {
    b.addEventListener('click', () => restoreSnapshot(parseInt(b.dataset.id)));
  });
  overlay.querySelectorAll('.btn-del').forEach(b => {
    b.addEventListener('click', () => deleteSnapshot(parseInt(b.dataset.id)));
  });

  setTimeout(() => document.getElementById('snapName').focus(), 100);
}

document.addEventListener('DOMContentLoaded', init);

/* DECO-KO — Controle de Equipes v6
   Slots fully managed in localStorage: add, remove, reorder */

const STATE_KEY = 'deco-ko-state-v6';
const EDITS_KEY = 'deco-ko-edits-v1';
let appState = {}; // { slots: {teamId:{sgIdx:[{label,worker}]}}, edits:{} }
let activeSnapshotId = null;
let activeSnapshotName = '';

let db = null;
try {
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
  db = firebase.database();
} catch (err) {
  console.warn("Firebase offline ou bloqueado:", err);
}

function init() {
  if (sessionStorage.getItem('decoko_auth') !== 'true') {
    document.getElementById('loginOverlay').style.display = 'flex';
  } else {
    document.getElementById('loginOverlay').style.display = 'none';
  }
  
  // Previne tela preta carregando o estado local/backup imediatamente
  initializeDefaultState();
  renderAll();

  if (db) {
    // Escuta o snapshot ativo
    db.ref('activeSnapshotId').on('value', snap => {
      activeSnapshotId = snap.val();
      // Busca o nome do snapshot ativo
      if (activeSnapshotId) {
        const h = getHistory();
        const s = h.find(x => x.id == activeSnapshotId);
        activeSnapshotName = s ? s.name : '';
      } else {
        activeSnapshotName = '';
      }
      updateSnapshotIndicator();
    });

    db.ref('appState').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        appState = data;
        if (!appState.teams && typeof TEAMS !== 'undefined') appState.teams = JSON.parse(JSON.stringify(TEAMS));
        if (!appState.slots) appState.slots = {};
        if (!appState.edits) appState.edits = {};
        renderAll();
      } else {
        save(); // Se o banco estiver vazio, salva o estado atual
      }
    }, (error) => {
      console.warn("Erro ao conectar no Firebase:", error.message);
    });

    db.ref('history').on('value', snap => {
      appHistory = snap.val() || [];
      // Atualiza o nome se mudou
      if (activeSnapshotId) {
        const s = appHistory.find(x => x.id == activeSnapshotId);
        activeSnapshotName = s ? s.name : '';
        updateSnapshotIndicator();
      }
      const modal = document.querySelector('.history-modal');
      if (modal) {
        const parent = modal.parentElement;
        parent.remove();
        openHistoryModal();
      }
    });
  } else {
    initializeDefaultState();
    renderAll();
  }

  document.getElementById('searchInput').addEventListener('input', onSearch);
  const filterSel = document.getElementById('poolFilterSelect');
  if (filterSel) filterSel.addEventListener('change', () => renderPool(getWorkerTeamMap()));
}



function checkLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  if (u === 'deco-ko' && p === 'comara123') {
    sessionStorage.setItem('decoko_auth', 'true');
    sessionStorage.setItem('decoko_readonly', 'false');
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
  } else if (u === 'visualizar' && p === 'comara123') {
    sessionStorage.setItem('decoko_auth', 'true');
    sessionStorage.setItem('decoko_readonly', 'true');
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
}

// ---- PERSISTENCE ----
function initializeDefaultState() {
  if (typeof DEFAULT_BACKUP !== 'undefined' && DEFAULT_BACKUP.appState) {
    try { appState = JSON.parse(DEFAULT_BACKUP.appState); } catch(e) { appState = {}; }
    if (DEFAULT_BACKUP.edits) {
      try { appState.edits = JSON.parse(DEFAULT_BACKUP.edits); } catch(e) {}
    }
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
  if (!appState.teams && typeof TEAMS !== 'undefined') appState.teams = JSON.parse(JSON.stringify(TEAMS));
  if (!appState.slots) appState.slots = {};
  if (!appState.edits) appState.edits = {};
}

function save() { 
  if (sessionStorage.getItem('decoko_readonly') === 'true') return;
  if (appState && appState.slots && db) {
    db.ref('appState').set(appState);
    // Auto-salva no snapshot ativo
    if (activeSnapshotId) {
      const h = getHistory();
      const idx = h.findIndex(s => s.id == activeSnapshotId);
      if (idx !== -1) {
        h[idx].slots = JSON.parse(JSON.stringify(appState.slots));
        h[idx].edits = JSON.parse(JSON.stringify(appState.edits));
        h[idx].date = new Date().toISOString();
        // Atualiza stats
        const wtMap = getWorkerTeamMap();
        h[idx].stats.alloc = Object.keys(wtMap).length;
        saveHistory(h);
      }
    }
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
    appState: JSON.stringify(appState)
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
        appState = JSON.parse(data.appState);
        if (data.edits) appState.edits = JSON.parse(data.edits);
        if (!appState.teams && typeof TEAMS !== 'undefined') appState.teams = JSON.parse(JSON.stringify(TEAMS));
        if (!appState.slots) appState.slots = {};
        if (!appState.edits) appState.edits = {};
        
        if (db) db.ref('appState').set(appState);
        alert('Backup importado com sucesso!');
        renderAll();
      } else {
        alert('Arquivo inválido ou corrompido.');
      }
    } catch (err) {
      alert('Erro ao ler arquivo: ' + err.message);
    }
  }
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

function addSubgroup(teamId) {
  const t = appState.teams.find(x => x.id === teamId);
  if (!t) return;
  const name = prompt('Nome da nova subcategoria:');
  if (!name || !name.trim()) return;
  const newSg = { nome: name.trim(), slots: [{ label: 'Vaga 1' }] };
  t.subgrupos.push(newSg);
  // Inicializa os slots no appState
  const newIdx = t.subgrupos.length - 1;
  if (!appState.slots[teamId]) appState.slots[teamId] = {};
  appState.slots[teamId][newIdx] = [{ label: 'Vaga 1', worker: null }];
  save(); renderAll();
}

function deleteSubgroup(teamId, sgIdx) {
  const t = appState.teams.find(x => x.id === teamId);
  if (!t) return;
  const sgName = t.subgrupos[sgIdx].nome || `Subgrupo ${sgIdx + 1}`;
  if (!confirm(`Excluir a subcategoria "${sgName}" e todas as suas vagas?`)) return;
  // Remove o subgrupo
  t.subgrupos.splice(sgIdx, 1);
  // Reorganiza os slots (reindexar)
  const oldSlots = appState.slots[teamId] || {};
  const newSlots = {};
  t.subgrupos.forEach((sg, newIdx) => {
    // Mapeia: indices < sgIdx ficam iguais, >= sgIdx pegam o próximo
    const oldIdx = newIdx < sgIdx ? newIdx : newIdx + 1;
    newSlots[newIdx] = oldSlots[oldIdx] || sg.slots.map(s => ({ label: s.label, worker: null }));
  });
  appState.slots[teamId] = newSlots;
  save(); renderAll();
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

  // Team info panel (turno, meta, obs)
  const teamInfo = appState.teamInfo?.[team.id] || {};
  const currentTurno = teamInfo.turno || '07:00–12:00 / 13:00–16:00';
  const infoPanel = document.createElement('div');
  infoPanel.className = 'team-info-panel';
  infoPanel.innerHTML = `
    <div class="team-info-row">
      <label>⏰ Turno</label>
      <select class="team-info-select" data-field="turno" data-team="${team.id}">
        <option value="07:00–12:00 / 13:00–16:00" ${currentTurno === '07:00–12:00 / 13:00–16:00' ? 'selected' : ''}>07:00–16:00 (Expediente)</option>
        <option value="07:00–12:00" ${currentTurno === '07:00–12:00' ? 'selected' : ''}>07:00–12:00 (Meio turno manhã)</option>
        <option value="13:00–18:00" ${currentTurno === '13:00–18:00' ? 'selected' : ''}>13:00–18:00 (Meio turno tarde)</option>
        <option value="integral" ${currentTurno === 'integral' ? 'selected' : ''}>Integral</option>
        <option value="custom" ${currentTurno === 'custom' ? 'selected' : ''}>Personalizado...</option>
      </select>
    </div>
    ${currentTurno === 'custom' ? `<div class="team-info-row"><label></label><input type="text" class="team-info-input" data-field="turnoCustom" data-team="${team.id}" value="${teamInfo.turnoCustom || ''}" placeholder="Ex: 05:30–14:00"></div>` : ''}
    <div class="team-info-row">
      <label>🎯 Meta</label>
      <input type="text" class="team-info-input" data-field="meta" data-team="${team.id}" value="${teamInfo.meta || ''}" placeholder="Ex: 50m de canaleta (opcional)">
    </div>
    <div class="team-info-row">
      <label>📝 Obs</label>
      <input type="text" class="team-info-input" data-field="obs" data-team="${team.id}" value="${teamInfo.obs || ''}" placeholder="Observação da equipe...">
    </div>`;
  col.appendChild(infoPanel);

  // Bind events for info panel
  infoPanel.querySelectorAll('.team-info-select').forEach(sel => {
    sel.addEventListener('change', () => {
      if (!appState.teamInfo) appState.teamInfo = {};
      if (!appState.teamInfo[team.id]) appState.teamInfo[team.id] = {};
      appState.teamInfo[team.id].turno = sel.value;
      if (sel.value !== 'custom') delete appState.teamInfo[team.id].turnoCustom;
      save(); renderAll();
    });
  });
  infoPanel.querySelectorAll('.team-info-input').forEach(inp => {
    let debounceTimer;
    inp.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!appState.teamInfo) appState.teamInfo = {};
        if (!appState.teamInfo[team.id]) appState.teamInfo[team.id] = {};
        appState.teamInfo[team.id][inp.dataset.field] = inp.value;
        save();
      }, 500);
    });
  });

  const body = document.createElement('div'); body.className = 'column-body';

  team.subgrupos.forEach((sg, si) => {
    const sgDiv = document.createElement('div'); sgDiv.className = 'subgroup';
    let sgHeader = '';
    if (sg.nome.trim() !== '') {
      sgHeader = `<div class="subgroup-title" style="display:flex; align-items:center;">
        <span style="flex:1;">${sg.nome}</span>
        <button class="ctrl-btn" title="Renomear" onclick="renameSubgroup('${team.id}', ${si})">✏️</button>
        <button class="ctrl-btn ctrl-del" title="Excluir Subcategoria" onclick="deleteSubgroup('${team.id}', ${si})">🗑</button>
      </div>`;
    } else {
      sgHeader = `<div class="subgroup-title" style="display:flex; justify-content:flex-end;">
        <button class="ctrl-btn" title="Nomear" onclick="renameSubgroup('${team.id}', ${si})">✏️</button>
        <button class="ctrl-btn ctrl-del" title="Excluir Subcategoria" onclick="deleteSubgroup('${team.id}', ${si})">🗑</button>
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

  // Botão para adicionar nova subcategoria
  const addSgBtn = document.createElement('button');
  addSgBtn.className = 'add-slot-btn';
  addSgBtn.style.cssText = 'margin:8px 6px; border-style:dashed; opacity:0.7;';
  addSgBtn.innerHTML = '📁 Nova subcategoria';
  addSgBtn.onclick = () => addSubgroup(team.id);
  body.appendChild(addSgBtn);

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
  if (db) db.ref('history').set(h); 
}

function updateSnapshotIndicator() {
  let el = document.getElementById('snapshotIndicator');
  const slot = document.getElementById('snapshotIndicatorSlot');
  if (!slot) return;
  if (!el) {
    el = document.createElement('div');
    el.id = 'snapshotIndicator';
    el.className = 'snapshot-indicator';
    slot.appendChild(el);
  }
  if (activeSnapshotId && activeSnapshotName) {
    el.innerHTML = `<span class="snap-dot">●</span> <span class="snap-label">Editando:</span> <strong>${activeSnapshotName}</strong>`;
    el.style.display = 'flex';
    el.title = 'Todas as alterações são salvas automaticamente neste planejamento';
  } else {
    el.innerHTML = `<span class="snap-dot off">●</span> <span class="snap-label">Nenhum planejamento selecionado</span>`;
    el.style.display = 'flex';
    el.title = 'Abra o Histórico e selecione um planejamento para auto-salvar';
  }
}

function saveSnapshot(name) {
  const h = getHistory();
  const wtMap = getWorkerTeamMap();
  const alloc = Object.keys(wtMap).length;
  let filled = 0, total = 0;
  (appState.teams || TEAMS).forEach(t => t.subgrupos.forEach((sg, si) => {
    const slots = getSlots(t.id, si);
    total += slots.length;
    filled += slots.filter(s => s.worker).length;
  }));
  const newId = Date.now();
  h.unshift({
    id: newId,
    name: name,
    date: new Date().toISOString(),
    slots: JSON.parse(JSON.stringify(appState.slots)),
    edits: JSON.parse(JSON.stringify(appState.edits)),
    stats: { alloc, filled, total, workers: WORKERS.length }
  });
  if (h.length > 50) h.length = 50;
  saveHistory(h);
  // Ativa o novo snapshot automaticamente
  selectSnapshot(newId, name);
}

function selectSnapshot(id, skipLoad) {
  const h = getHistory();
  const snap = h.find(s => s.id == id);
  if (!snap) return;
  
  // Carrega os dados do snapshot
  if (!skipLoad) {
    appState.slots = JSON.parse(JSON.stringify(snap.slots));
    appState.edits = JSON.parse(JSON.stringify(snap.edits || {}));
    if (db) db.ref('appState').set(appState);
    renderAll();
  }

  // Define como ativo
  activeSnapshotId = snap.id;
  activeSnapshotName = snap.name;
  if (db) db.ref('activeSnapshotId').set(snap.id);
  updateSnapshotIndicator();
  
  // Fecha modais
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
}

function deleteSnapshot(id) {
  const h = getHistory();
  const idx = h.findIndex(s => s.id == id);
  if (idx === -1) return;
  if (!confirm(`Excluir planejamento "${h[idx].name}"?`)) return;
  // Se estiver deletando o ativo, desativa
  if (activeSnapshotId == id) {
    activeSnapshotId = null;
    activeSnapshotName = '';
    if (db) db.ref('activeSnapshotId').remove();
    updateSnapshotIndicator();
  }
  h.splice(idx, 1);
  saveHistory(h);
  openHistoryModal();
}

function renameSnapshot(id) {
  const h = getHistory();
  const snap = h.find(s => s.id == id);
  if (!snap) return;
  const newName = prompt('Novo nome:', snap.name);
  if (!newName || !newName.trim()) return;
  snap.name = newName.trim();
  saveHistory(h);
  if (activeSnapshotId == id) {
    activeSnapshotName = snap.name;
    updateSnapshotIndicator();
  }
  openHistoryModal();
}

function openHistoryModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const history = getHistory();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

  let listHtml = '';
  if (history.length === 0) {
    listHtml = '<div style="text-align:center;padding:20px;color:var(--text2);font-size:13px;">Nenhum planejamento salvo ainda.<br>Crie o primeiro para começar a trabalhar.</div>';
  } else {
    listHtml = history.map(s => {
      const d = new Date(s.date);
      const dateStr = d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
      const timeStr = d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
      const stats = s.stats || {};
      const isActive = (activeSnapshotId == s.id);
      return `<div class="history-item ${isActive ? 'history-active' : ''}">
        <div class="history-info">
          <div class="history-name">${isActive ? '🟢 ' : ''}${s.name}${isActive ? ' <span style="font-size:10px;color:var(--accent);font-weight:400;">(editando agora)</span>' : ''}</div>
          <div class="history-meta">📅 ${dateStr} às ${timeStr} · 👥 ${stats.alloc || '?'}/${stats.workers || '?'} alocados · ${stats.filled || '?'}/${stats.total || '?'} vagas</div>
        </div>
        <div class="history-actions">
          ${isActive 
            ? '<button class="btn-hist btn-active-label" disabled>✅ Ativo</button>' 
            : `<button class="btn-hist btn-select" data-id="${s.id}">📂 Selecionar</button>`}
          <button class="btn-hist btn-rename" data-id="${s.id}" title="Renomear">✏️</button>
          <button class="btn-hist btn-del" data-id="${s.id}" title="Excluir">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  overlay.innerHTML = `
    <div class="modal" style="width:580px;">
      <div class="modal-header">
        <h3>📋 Planejamentos</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:12px 20px;">
        <div class="field">
          <label>Criar novo planejamento</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="snapName" placeholder="Ex: Porto Dia 1, Pré-chuva, Config final..." style="flex:1;">
            <button class="btn-save" id="btnSnap" style="white-space:nowrap;">➕ Criar</button>
          </div>
          <div class="hint">Cria um novo planejamento a partir do estado atual e o seleciona para edição</div>
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;">Planejamentos salvos (${history.length})</label>
          <div class="history-list" style="margin-top:8px;max-height:400px;overflow-y:auto;">${listHtml}</div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('btnSnap').addEventListener('click', () => {
    const name = document.getElementById('snapName').value.trim();
    if (!name) { alert('Dê um nome ao planejamento'); return; }
    saveSnapshot(name);
  });

  overlay.querySelectorAll('.btn-select').forEach(b => {
    b.addEventListener('click', () => selectSnapshot(parseInt(b.dataset.id)));
  });
  overlay.querySelectorAll('.btn-rename').forEach(b => {
    b.addEventListener('click', () => renameSnapshot(parseInt(b.dataset.id)));
  });
  overlay.querySelectorAll('.btn-del').forEach(b => {
    b.addEventListener('click', () => deleteSnapshot(parseInt(b.dataset.id)));
  });

  setTimeout(() => document.getElementById('snapName').focus(), 100);
}

function openDaySummary() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

  const today = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const snapName = activeSnapshotName || 'Sem planejamento selecionado';

  let rows = '';
  (appState.teams || []).forEach(t => {
    const info = appState.teamInfo?.[t.id] || {};
    let filled = 0, total = 0;
    t.subgrupos.forEach((sg, si) => {
      const slots = getSlots(t.id, si);
      total += slots.length;
      filled += slots.filter(s => s.worker).length;
    });
    const turnoDisplay = info.turno === 'custom' ? (info.turnoCustom || '—') : (info.turno || '—');
    rows += `<tr>
      <td><span class="summary-dot" style="background:${t.cor}"></span>${t.nome}</td>
      <td>${turnoDisplay}</td>
      <td style="text-align:center;">${filled}/${total}</td>
      <td>${info.meta || '—'}</td>
      <td>${info.obs || '—'}</td>
    </tr>`;
  });

  overlay.innerHTML = `
    <div class="modal" style="width:900px;max-width:95vw;">
      <div class="modal-header">
        <h3>📊 Resumo do Dia</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:16px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);">📅 ${today}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px;">Planejamento: <strong style="color:var(--accent);">${snapName}</strong></div>
          </div>
          <button class="btn" onclick="printDaySummary()">🖨️ Imprimir</button>
        </div>
        <div style="overflow-x:auto;">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>Turno</th>
                <th style="text-align:center;">Efetivo</th>
                <th>Meta</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
}

function printDaySummary() {
  const today = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const snapName = activeSnapshotName || '';
  let html = `<html><head><meta charset="utf-8"><title>Resumo do Dia - DECO-KO</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
      .sub { text-align: center; font-size: 12px; color: #666; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 10px; border: 1px solid #ddd; text-align: left; font-size: 12px; }
      th { background: #f1f5f9; font-weight: bold; }
      .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>
    <h1>Resumo do Dia — Missão DECO-KO</h1>
    <div class="sub">${today}${snapName ? ' · Planejamento: ' + snapName : ''}</div>
    <table><thead><tr><th>Equipe</th><th>Turno</th><th>Efetivo</th><th>Meta</th><th>Observações</th></tr></thead><tbody>`;
  
  (appState.teams || []).forEach(t => {
    const info = appState.teamInfo?.[t.id] || {};
    let filled = 0, total = 0;
    t.subgrupos.forEach((sg, si) => {
      const slots = getSlots(t.id, si);
      total += slots.length;
      filled += slots.filter(s => s.worker).length;
    });
    const turno = info.turno === 'custom' ? (info.turnoCustom || '—') : (info.turno || '—');
    html += `<tr>
      <td><span class="dot" style="background:${t.cor}"></span>${t.nome}</td>
      <td>${turno}</td><td style="text-align:center;">${filled}/${total}</td>
      <td>${info.meta || '—'}</td><td>${info.obs || '—'}</td>
    </tr>`;
  });
  html += '</tbody></table></body></html>';
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

document.addEventListener('DOMContentLoaded', init);

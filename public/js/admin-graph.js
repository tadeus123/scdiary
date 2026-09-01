const nameInput = document.getElementById('people-name');
const photoInput = document.getElementById('people-photo');
const descInput = document.getElementById('people-description');
const fromSelect = document.getElementById('people-from');
const editIdInput = document.getElementById('people-edit-id');
const form = document.getElementById('people-form');
const formTitle = document.getElementById('people-form-title');
const saveBtn = document.getElementById('people-save-btn');
const cancelBtn = document.getElementById('people-cancel-btn');
const messageEl = document.getElementById('people-form-message');
const listEl = document.getElementById('people-list');
const emptyEl = document.getElementById('people-empty');
const previewWrap = document.getElementById('people-photo-preview');
const previewImg = document.getElementById('people-preview-img');

let nodes = [];
let edges = [];

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = `form-message ${kind || ''}`;
}

function outgoingCount(id) {
  return edges.filter((e) => e.from_id === id).length;
}

function parentId(id) {
  const edge = edges.find((e) => e.to_id === id);
  return edge ? edge.from_id : '';
}

function parentName(id) {
  const pid = parentId(id);
  if (!pid) return '';
  const parent = nodes.find((n) => n.id === pid);
  return parent ? parent.name : '';
}

function fillFromSelect(exceptId) {
  const current = fromSelect.value;
  fromSelect.innerHTML = '<option value="">new starting node</option>';
  nodes
    .filter((n) => n.id !== exceptId)
    .forEach((n) => {
      const given = outgoingCount(n.id);
      const option = document.createElement('option');
      option.value = n.id;
      option.textContent = given >= 2 ? `${n.name} (${given})` : `${n.name} (${given}/2)`;
      fromSelect.appendChild(option);
    });
  if (current && [...fromSelect.options].some((o) => o.value === current)) {
    fromSelect.value = current;
  }
}

function resetForm() {
  editIdInput.value = '';
  formTitle.textContent = 'add a person';
  saveBtn.textContent = 'add';
  cancelBtn.classList.add('hidden');
  form.reset();
  previewWrap.classList.add('hidden');
  previewImg.src = '';
  fillFromSelect(null);
}

function startEdit(id) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  editIdInput.value = id;
  formTitle.textContent = 'edit person';
  saveBtn.textContent = 'save';
  cancelBtn.classList.remove('hidden');
  nameInput.value = node.name;
  descInput.value = node.description || '';
  photoInput.value = '';
  fillFromSelect(id);
  fromSelect.value = parentId(id);
  if (node.photo_url) {
    previewImg.src = node.photo_url;
    previewWrap.classList.remove('hidden');
  } else {
    previewWrap.classList.add('hidden');
    previewImg.src = '';
  }
  nameInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderList() {
  if (!nodes.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = nodes.map((node) => {
    const given = outgoingCount(node.id);
    const from = parentName(node.id);
    const photo = node.photo_url
      ? `<img src="${escapeHtml(node.photo_url)}" alt="">`
      : `<span>${escapeHtml((node.name || '?').charAt(0).toUpperCase())}</span>`;
    return `<article class="entry people-admin-entry" data-id="${escapeHtml(node.id)}">
      <div class="people-admin-row">
        <div class="people-admin-photo">${photo}</div>
        <div class="people-admin-meta">
          <div class="entry-date">${escapeHtml(node.name)}</div>
          <p class="people-admin-from">${from ? `from ${escapeHtml(from)}` : 'starting node'} · ${given}/2 intros</p>
          ${node.description ? `<div class="entry-content"><p>${escapeHtml(node.description)}</p></div>` : ''}
        </div>
        <div class="people-admin-actions">
          <button type="button" class="people-edit-btn" data-edit="${escapeHtml(node.id)}">edit</button>
          <button type="button" class="delete-entry-btn" data-delete="${escapeHtml(node.id)}" aria-label="Delete">×</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadPeople() {
  const response = await fetch(`/api/graph?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  const data = await response.json();
  if (!data.success) {
    showMessage('could not load people', 'error');
    return;
  }
  nodes = data.nodes || [];
  edges = data.edges || [];
  fillFromSelect(editIdInput.value || null);
  renderList();
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    previewImg.src = reader.result;
    previewWrap.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

cancelBtn.addEventListener('click', () => {
  resetForm();
  showMessage('');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    showMessage('name is required', 'error');
    return;
  }

  const editId = editIdInput.value;
  const body = new FormData();
  body.append('name', name);
  body.append('description', descInput.value.trim());
  body.append('from_id', fromSelect.value);
  if (photoInput.files && photoInput.files[0]) {
    body.append('photo', photoInput.files[0]);
  }

  saveBtn.disabled = true;
  try {
    const response = await fetch(editId ? `/admin/graph/node/${editId}` : '/admin/graph/node', {
      method: editId ? 'PUT' : 'POST',
      body
    });
    const data = await response.json();
    if (!data.success) {
      showMessage(data.error || 'could not save', 'error');
      return;
    }
    showMessage(editId ? 'saved.' : 'added.', 'success');
    resetForm();
    await loadPeople();
  } catch (error) {
    showMessage('could not save', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

listEl.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit]');
  if (editBtn) {
    startEdit(editBtn.getAttribute('data-edit'));
    return;
  }
  const delBtn = e.target.closest('[data-delete]');
  if (!delBtn) return;
  const id = delBtn.getAttribute('data-delete');
  const node = nodes.find((n) => n.id === id);
  if (!confirm(`Delete ${node ? node.name : 'this person'}?`)) return;
  const response = await fetch(`/admin/graph/node/${id}`, { method: 'DELETE' });
  const data = await response.json();
  if (!data.success) {
    showMessage(data.error || 'could not delete', 'error');
    return;
  }
  if (editIdInput.value === id) resetForm();
  showMessage('deleted.', 'success');
  await loadPeople();
});

loadPeople().catch((error) => {
  console.error(error);
  showMessage('could not load people', 'error');
});

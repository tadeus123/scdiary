document.addEventListener('DOMContentLoaded', () => {
  const headlineInput = document.getElementById('eisenkind-headline-input');
  const blocksEditor = document.getElementById('eisenkind-blocks-editor');
  const addBlockBtn = document.getElementById('eisenkind-add-block');
  const addBlockType = document.getElementById('eisenkind-add-block-type');
  const initialDataEl = document.getElementById('eisenkind-initial-data');
  const statusEl = document.getElementById('save-status');

  if (!headlineInput || !blocksEditor || !addBlockBtn || !addBlockType || !initialDataEl || !statusEl) {
    return;
  }

  const BLOCK_TYPES = ['principle', 'question', 'note', 'quote', 'entry'];
  const BLOCK_LABELS = {
    principle: 'principle',
    question: 'question',
    note: 'note',
    quote: 'quote',
    entry: 'entry'
  };

  let blocks = [];
  let saveTimer = null;
  let saving = false;

  try {
    const initial = JSON.parse(initialDataEl.textContent || '{}');
    blocks = Array.isArray(initial.blocks) ? initial.blocks : [];
  } catch {
    blocks = [];
  }

  function newBlockId() {
    return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || '';
  }

  function collectBlocksFromDom() {
    return Array.from(blocksEditor.querySelectorAll('.eisenkind-block-row')).map((row) => {
      const type = row.querySelector('.eisenkind-block-type-select')?.value || 'note';
      const text = row.querySelector('.eisenkind-block-text')?.value || '';
      const date = row.querySelector('.eisenkind-block-date')?.value || '';
      const block = {
        id: row.dataset.blockId || newBlockId(),
        type,
        text
      };
      if (type === 'entry' && date) block.date = date;
      return block;
    });
  }

  function syncBlocksFromDom() {
    blocks = collectBlocksFromDom();
  }

  function createBlockRow(block) {
    const row = document.createElement('div');
    row.className = 'eisenkind-block-row';
    row.dataset.blockId = block.id || newBlockId();

    const toolbar = document.createElement('div');
    toolbar.className = 'eisenkind-block-row-toolbar';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'eisenkind-block-type-select';
    typeSelect.setAttribute('aria-label', 'Block type');
    BLOCK_TYPES.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = BLOCK_LABELS[type];
      option.selected = block.type === type;
      typeSelect.appendChild(option);
    });

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'eisenkind-block-date';
    dateInput.value = block.date || '';
    dateInput.setAttribute('aria-label', 'Entry date');
    dateInput.hidden = block.type !== 'entry';

    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'eisenkind-block-move';
    moveUp.textContent = '↑';
    moveUp.setAttribute('aria-label', 'Move block up');

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'eisenkind-block-move';
    moveDown.textContent = '↓';
    moveDown.setAttribute('aria-label', 'Move block down');

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'eisenkind-block-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove block');

    toolbar.append(typeSelect, dateInput, moveUp, moveDown, removeBtn);

    const preview = document.createElement('div');
    preview.className = `eisenkind-block eisenkind-block--${block.type || 'note'} eisenkind-block--preview`;

    if (block.type === 'entry' && block.date) {
      const dateEl = document.createElement('time');
      dateEl.className = 'eisenkind-block-date-label';
      dateEl.dateTime = block.date;
      dateEl.textContent = formatEntryDate(block.date);
      preview.appendChild(dateEl);
    }

    const textArea = document.createElement('textarea');
    textArea.className = 'eisenkind-block-text eisenkind-a4-input';
    textArea.rows = 3;
    textArea.spellcheck = true;
    textArea.value = block.text || '';
    textArea.placeholder = placeholderForType(block.type || 'note');
    textArea.setAttribute('aria-label', `${BLOCK_LABELS[block.type || 'note']} text`);

    preview.appendChild(textArea);
    row.append(toolbar, preview);

    typeSelect.addEventListener('change', () => {
      const type = typeSelect.value;
      dateInput.hidden = type !== 'entry';
      preview.className = `eisenkind-block eisenkind-block--${type} eisenkind-block--preview`;
      textArea.placeholder = placeholderForType(type);
      syncBlocksFromDom();
      scheduleSave();
    });

    dateInput.addEventListener('change', () => {
      updatePreviewDate(preview, typeSelect.value, dateInput.value);
      scheduleSave();
    });

    textArea.addEventListener('input', () => {
      autoResize(textArea);
      scheduleSave();
    });

    textArea.addEventListener('blur', () => {
      autoResize(textArea);
      window.clearTimeout(saveTimer);
      saveNotes();
    });

    moveUp.addEventListener('click', () => moveBlock(row, -1));
    moveDown.addEventListener('click', () => moveBlock(row, 1));
    removeBtn.addEventListener('click', () => {
      row.remove();
      syncBlocksFromDom();
      saveNotes();
    });

    autoResize(textArea);
    return row;
  }

  function placeholderForType(type) {
    switch (type) {
      case 'principle':
        return 'A conviction that guides the work.';
      case 'question':
        return 'Something still open or worth exploring.';
      case 'quote':
        return 'A line worth remembering.';
      case 'entry':
        return 'A dated thought or update.';
      default:
        return 'Supporting note or detail.';
    }
  }

  function formatEntryDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function updatePreviewDate(preview, type, value) {
    let dateEl = preview.querySelector('.eisenkind-block-date-label');
    if (type !== 'entry' || !value) {
      if (dateEl) dateEl.remove();
      return;
    }
    if (!dateEl) {
      dateEl = document.createElement('time');
      dateEl.className = 'eisenkind-block-date-label';
      preview.insertBefore(dateEl, preview.firstChild);
    }
    dateEl.dateTime = value;
    dateEl.textContent = formatEntryDate(value);
  }

  function renderBlocks() {
    blocksEditor.innerHTML = '';
    if (!blocks.length) {
      const empty = document.createElement('p');
      empty.className = 'eisenkind-blocks-empty';
      empty.textContent = 'No blocks yet. Add one above.';
      blocksEditor.appendChild(empty);
      return;
    }

    blocks.forEach((block) => {
      blocksEditor.appendChild(createBlockRow(block));
    });
  }

  function moveBlock(row, direction) {
    syncBlocksFromDom();
    const index = blocks.findIndex((block) => block.id === row.dataset.blockId);
    if (index < 0) return;

    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;

    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    blocks = next;
    renderBlocks();
    saveNotes();
  }

  function addBlock(type) {
    syncBlocksFromDom();
    const block = {
      id: newBlockId(),
      type: type || 'note',
      text: ''
    };
    if (block.type === 'entry') {
      block.date = new Date().toISOString().slice(0, 10);
    }
    blocks.push(block);
    renderBlocks();
    const lastTextarea = blocksEditor.querySelector('.eisenkind-block-row:last-child .eisenkind-block-text');
    if (lastTextarea) lastTextarea.focus();
    scheduleSave();
  }

  async function saveNotes() {
    if (saving) return;
    saving = true;
    setStatus('saving…', 'pending');

    syncBlocksFromDom();
    const payload = {
      headline: headlineInput.value,
      blocks: blocks.filter((block) => block.text.trim())
    };

    try {
      const response = await fetch('/admin/eisenkind/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Save failed (${response.status})`);
      }

      if (Array.isArray(data.notes?.blocks)) {
        blocks = data.notes.blocks;
        renderBlocks();
      }

      setStatus('saved', 'ok');
      window.setTimeout(() => {
        if (statusEl.dataset.kind === 'ok') setStatus('');
      }, 2000);
    } catch (error) {
      console.error('Error saving eisenkind notes:', error);
      const msg = error.message || 'save failed';
      setStatus(msg.length > 48 ? 'save failed — see console' : msg, 'error');
    } finally {
      saving = false;
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNotes, 800);
  }

  headlineInput.addEventListener('input', () => {
    autoResize(headlineInput);
    scheduleSave();
  });

  headlineInput.addEventListener('blur', () => {
    autoResize(headlineInput);
    window.clearTimeout(saveTimer);
    saveNotes();
  });

  addBlockBtn.addEventListener('click', () => {
    addBlock(addBlockType.value);
  });

  autoResize(headlineInput);
  renderBlocks();
});

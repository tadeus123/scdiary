function showMessage(containerId, text, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const messageClass = type === 'error' ? 'error-message' : 'success-message';
  container.innerHTML = `<div class="${messageClass}">${text}</div>`;
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}

function todayInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeMoneyString(value) {
  let s = String(value).trim().replace(/\s/g, '').replace(/[−–—]/g, '-');
  if (!s) return '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(/,/g, '.');
  }
  return s;
}

function parseSignedAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(normalizeMoneyString(value));
  if (!Number.isFinite(n) || n === 0) return null;
  const amount = Math.round(Math.abs(n) * 100) / 100;
  if (!(amount > 0)) return null;
  return { amount, direction: n < 0 ? 'out' : 'in' };
}

function formatUnsignedAmount(amount) {
  return Math.abs(Number(amount) || 0).toFixed(2);
}

function formatSignedAmount(parsed) {
  const formatted = parsed.amount.toFixed(2);
  return parsed.direction === 'out' ? `-${formatted}` : formatted;
}

function readAmountWithDirection(amountId, directionId, fallbackDirection) {
  const parsed = parseSignedAmount(document.getElementById(amountId)?.value);
  if (!parsed) return null;
  const pill = document.getElementById(directionId)?.value;
  const direction = pill === 'in' || pill === 'out' ? pill : (fallbackDirection || parsed.direction);
  return { amount: parsed.amount, direction };
}

function bindAmountInputs() {
  ['liability-amount', 'entry-amount', 'recurring-amount'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => {
      const parsed = parseSignedAmount(input.value);
      if (parsed) input.value = formatUnsignedAmount(parsed.amount);
    });
  });
}

function setCurrencyPill(targetId, value) {
  const input = document.getElementById(targetId);
  const group = document.querySelector(`.liquidity-pills[data-target="${targetId}"]`);
  if (input) input.value = value;
  if (!group) return;
  group.querySelectorAll('.liquidity-pill').forEach((pill) => {
    pill.classList.toggle('is-active', pill.dataset.value === value);
  });
}

function editingLiabilityId() {
  return (document.getElementById('liability-edit-id')?.value || '').trim();
}

function clearLiabilityForm() {
  const amount = document.getElementById('liability-amount');
  const name = document.getElementById('liability-name');
  const date = document.getElementById('liability-date');
  const editId = document.getElementById('liability-edit-id');
  const saveBtn = document.getElementById('save-liability-btn');
  const cancelBtn = document.getElementById('cancel-liability-edit-btn');
  if (amount) amount.value = '';
  if (name) name.value = '';
  if (date) date.value = todayInputValue();
  if (editId) editId.value = '';
  if (saveBtn) saveBtn.textContent = 'add liability';
  if (cancelBtn) cancelBtn.hidden = true;
  setCurrencyPill('liability-currency', 'EUR');
  document.querySelectorAll('.liquidity-liability-list .entry.is-editing').forEach((row) => {
    row.classList.remove('is-editing');
  });
}

function editLiquidityLiability(button) {
  const row = button?.closest?.('[data-liability-id]');
  if (!row) return;
  const id = row.getAttribute('data-liability-id');
  const name = row.getAttribute('data-name') || '';
  const amount = Number(row.getAttribute('data-amount'));
  const currency = row.getAttribute('data-currency') === 'EUR' ? 'EUR' : 'USD';
  const date = row.getAttribute('data-date') || todayInputValue();
  const nameInput = document.getElementById('liability-name');
  const amountInput = document.getElementById('liability-amount');
  const dateInput = document.getElementById('liability-date');
  const editId = document.getElementById('liability-edit-id');
  const saveBtn = document.getElementById('save-liability-btn');
  const cancelBtn = document.getElementById('cancel-liability-edit-btn');
  if (nameInput) nameInput.value = name;
  if (amountInput) {
    amountInput.value = Number.isFinite(amount) && amount > 0
      ? formatUnsignedAmount(amount)
      : '';
  }
  if (dateInput) dateInput.value = date;
  setCurrencyPill('liability-currency', currency);
  if (editId) editId.value = id;
  if (saveBtn) saveBtn.textContent = 'save changes';
  if (cancelBtn) cancelBtn.hidden = false;
  document.querySelectorAll('.liquidity-liability-list .entry.is-editing').forEach((item) => {
    item.classList.remove('is-editing');
  });
  row.classList.add('is-editing');
  amountInput?.focus();
  amountInput?.select();
}

async function saveSettings() {
  const button = document.getElementById('save-settings-btn');
  button.disabled = true;
  button.textContent = 'saving...';
  try {
    const response = await fetch('/admin/liquidity/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_eur: document.getElementById('settings-bank').value,
        cash_eur: document.getElementById('settings-cash').value,
        date: todayInputValue()
      })
    });
    const data = await response.json();
    if (data.success) {
      showMessage('settings-message', 'Saved.', 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      showMessage('settings-message', data.error || 'Failed to save.', 'error');
    }
  } catch (error) {
    console.error('Save settings error:', error);
    showMessage('settings-message', 'Network error. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'save bank / cash';
  }
}

async function saveLiability() {
  const button = document.getElementById('save-liability-btn');
  const parsed = parseSignedAmount(document.getElementById('liability-amount').value);
  const payload = {
    amount: parsed ? formatSignedAmount({ amount: parsed.amount, direction: 'out' }) : document.getElementById('liability-amount').value,
    currency: document.getElementById('liability-currency').value,
    name: document.getElementById('liability-name').value.trim(),
    date: document.getElementById('liability-date').value
  };

  if (!parsed || !payload.name) {
    showMessage('liability-message', 'Amount, date, and a name are required.', 'error');
    return;
  }

  const editId = editingLiabilityId();
  button.disabled = true;
  button.textContent = 'saving...';

  try {
    const response = await fetch(editId ? `/admin/liquidity/liability/${editId}` : '/admin/liquidity/liability', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.success) {
      showMessage('liability-message', editId ? 'Liability updated.' : 'Liability added.', 'success');
      setTimeout(() => window.location.reload(), 600);
    } else {
      showMessage('liability-message', data.error || 'Failed to save liability.', 'error');
    }
  } catch (error) {
    console.error('Save liability error:', error);
    showMessage('liability-message', 'Network error. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = editId ? 'save changes' : 'add liability';
  }
}

async function deleteLiquidityLiability(itemId) {
  if (!confirm('Remove this without paying? Liquidity comes back.')) return;

  try {
    const response = await fetch(`/admin/liquidity/liability/${itemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      window.location.reload();
    } else {
      showMessage('liability-message', data.error || 'Failed to delete liability.', 'error');
    }
  } catch (error) {
    console.error('Delete liability error:', error);
    showMessage('liability-message', 'Network error. Please try again.', 'error');
  }
}

async function payLiquidityLiability(itemId) {
  if (!confirm('Mark as paid? Money leaves bank, the liability disappears, liquidity stays the same.')) return;

  try {
    const response = await fetch(`/admin/liquidity/liability/${itemId}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayInputValue(), account: 'bank' })
    });
    const data = await response.json();
    if (data.success) {
      window.location.reload();
    } else {
      showMessage('liability-message', data.error || 'Failed to mark as paid.', 'error');
    }
  } catch (error) {
    console.error('Pay liability error:', error);
    showMessage('liability-message', 'Network error. Please try again.', 'error');
  }
}

async function saveEntry() {
  const parsed = readAmountWithDirection('entry-amount', 'entry-direction', 'out');
  const currency = document.getElementById('entry-currency').value;
  const note = document.getElementById('entry-content').value.trim();
  const saveBtn = document.getElementById('save-btn');

  if (!parsed) {
    showMessage('message-container', 'Amount is required.', 'error');
    return;
  }

  const amount = formatSignedAmount(parsed);
  document.getElementById('entry-amount').value = formatUnsignedAmount(parsed.amount);

  saveBtn.disabled = true;
  saveBtn.textContent = 'saving...';

  try {
    const response = await fetch('/admin/liquidity/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        note,
        date: document.getElementById('entry-date').value,
        status: document.getElementById('entry-status').value,
        account: document.getElementById('entry-account').value,
        liability_id: document.getElementById('entry-liability').value
      })
    });
    const data = await response.json();
    if (data.success) {
      showMessage('message-container', 'Entry saved.', 'success');
      document.getElementById('entry-amount').value = '';
      document.getElementById('entry-content').value = '';
      setTimeout(() => window.location.reload(), 600);
    } else {
      showMessage('message-container', data.error || 'Failed to save entry.', 'error');
    }
  } catch (error) {
    console.error('Save entry error:', error);
    showMessage('message-container', 'Network error. Please try again.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'save';
  }
}

async function approveLiquidityEntry(entryId) {
  try {
    const response = await fetch(`/admin/liquidity/entry/${entryId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      window.location.reload();
    } else {
      showMessage('pending-message', data.error || 'Failed to approve.', 'error');
    }
  } catch (error) {
    console.error('Approve entry error:', error);
    showMessage('pending-message', 'Network error. Please try again.', 'error');
  }
}

async function deleteLiquidityEntry(entryId) {
  if (!confirm('Delete this movement?')) return;

  try {
    const response = await fetch(`/admin/liquidity/entry/${entryId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      window.location.reload();
    } else {
      showMessage('message-container', data.error || 'Failed to delete entry.', 'error');
    }
  } catch (error) {
    console.error('Delete entry error:', error);
    showMessage('message-container', 'Network error. Please try again.', 'error');
  }
}

async function saveRecurring(event) {
  event.preventDefault();
  const button = document.getElementById('save-recurring-btn');
  const parsed = readAmountWithDirection('recurring-amount', 'recurring-direction', 'out');
  if (parsed) {
    document.getElementById('recurring-amount').value = formatUnsignedAmount(parsed.amount);
  }
  const payload = {
    name: document.getElementById('recurring-name').value,
    amount: parsed ? formatSignedAmount(parsed) : document.getElementById('recurring-amount').value,
    currency: document.getElementById('recurring-currency').value,
    day_of_month: document.getElementById('recurring-day').value
  };

  if (!parsed) {
    showMessage('recurring-message', 'Amount is required.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'saving...';

  try {
    const response = await fetch('/admin/liquidity/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.success) {
      showMessage('recurring-message', 'Monthly payment added.', 'success');
      setTimeout(() => window.location.reload(), 600);
    } else {
      showMessage('recurring-message', data.error || 'Failed to add monthly payment.', 'error');
    }
  } catch (error) {
    console.error('Save recurring error:', error);
    showMessage('recurring-message', 'Network error. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'add monthly';
  }
}

async function deleteLiquidityRecurring(itemId) {
  if (!confirm('Delete this monthly payment?')) return;

  try {
    const response = await fetch(`/admin/liquidity/recurring/${itemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      window.location.reload();
    } else {
      showMessage('recurring-message', data.error || 'Failed to delete monthly payment.', 'error');
    }
  } catch (error) {
    console.error('Delete recurring error:', error);
    showMessage('recurring-message', 'Network error. Please try again.', 'error');
  }
}

function bindPills() {
  document.querySelectorAll('.liquidity-pills').forEach((group) => {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('.liquidity-pill');
      if (!button || !group.contains(button)) return;
      group.querySelectorAll('.liquidity-pill').forEach((pill) => pill.classList.remove('is-active'));
      button.classList.add('is-active');
      const input = document.getElementById(group.dataset.target);
      if (input) input.value = button.dataset.value;
    });
  });
}

window.deleteLiquidityLiability = deleteLiquidityLiability;
window.editLiquidityLiability = editLiquidityLiability;
window.payLiquidityLiability = payLiquidityLiability;
window.deleteLiquidityEntry = deleteLiquidityEntry;
window.approveLiquidityEntry = approveLiquidityEntry;
window.deleteLiquidityRecurring = deleteLiquidityRecurring;

document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);
document.getElementById('save-liability-btn')?.addEventListener('click', saveLiability);
document.getElementById('cancel-liability-edit-btn')?.addEventListener('click', clearLiabilityForm);
document.getElementById('save-btn')?.addEventListener('click', saveEntry);
document.getElementById('recurring-form')?.addEventListener('submit', saveRecurring);
bindPills();
bindAmountInputs();

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveEntry();
  }
});

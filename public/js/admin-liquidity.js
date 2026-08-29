function showMessage(containerId, text, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const messageClass = type === 'error' ? 'error-message' : 'success-message';
  container.innerHTML = `<div class="${messageClass}">${text}</div>`;
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}

function localNowTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
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

function formatSignedAmount(parsed) {
  const formatted = parsed.amount.toFixed(2);
  return parsed.direction === 'out' ? `-${formatted}` : formatted;
}

function bindAmountInputs() {
  ['liability-amount', 'entry-amount', 'recurring-amount'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => {
      const parsed = parseSignedAmount(input.value);
      if (parsed) input.value = formatSignedAmount(parsed);
    });
  });
}

async function saveLiability() {
  const button = document.getElementById('save-liability-btn');
  const parsed = parseSignedAmount(document.getElementById('liability-amount').value);
  const payload = {
    amount: parsed ? formatSignedAmount(parsed) : document.getElementById('liability-amount').value,
    currency: document.getElementById('liability-currency').value,
    name: document.getElementById('liability-name').value.trim()
  };

  if (!parsed || !payload.name) {
    showMessage('liability-message', 'Amount and a name are required.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'saving...';

  try {
    const response = await fetch('/admin/liquidity/liability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.success) {
      showMessage('liability-message', 'Liability added.', 'success');
      setTimeout(() => window.location.reload(), 600);
    } else {
      showMessage('liability-message', data.error || 'Failed to save liability.', 'error');
    }
  } catch (error) {
    console.error('Save liability error:', error);
    showMessage('liability-message', 'Network error. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'add liability';
  }
}

async function deleteLiquidityLiability(itemId) {
  if (!confirm('Remove this liability without logging a payment?')) return;

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
  if (!confirm('Mark as paid? This logs the cash going out and clears the liability.')) return;

  try {
    const response = await fetch(`/admin/liquidity/liability/${itemId}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
  const parsed = parseSignedAmount(document.getElementById('entry-amount').value);
  const currency = document.getElementById('entry-currency').value;
  const note = document.getElementById('entry-content').value.trim();
  const saveBtn = document.getElementById('save-btn');

  if (!parsed) {
    showMessage('message-container', 'Amount is required. Use -25.32 for out, 25.32 for in.', 'error');
    return;
  }

  const amount = formatSignedAmount(parsed);
  document.getElementById('entry-amount').value = amount;

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
        timestamp: localNowTimestamp()
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

async function deleteLiquidityEntry(entryId) {
  if (!confirm('Delete this movement?')) return;

  try {
    const response = await fetch(`/admin/liquidity/entry/${entryId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      const entryElement = document.querySelector(`[data-entry-id="${entryId}"]`);
      if (entryElement) {
        entryElement.style.opacity = '0';
        entryElement.style.transition = 'opacity 0.3s ease';
        setTimeout(() => window.location.reload(), 300);
      } else {
        window.location.reload();
      }
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
  const parsed = parseSignedAmount(document.getElementById('recurring-amount').value);
  if (parsed) {
    document.getElementById('recurring-amount').value = formatSignedAmount(parsed);
  }
  const payload = {
    name: document.getElementById('recurring-name').value,
    amount: parsed ? formatSignedAmount(parsed) : document.getElementById('recurring-amount').value,
    currency: document.getElementById('recurring-currency').value,
    day_of_month: document.getElementById('recurring-day').value
  };

  if (!parsed) {
    showMessage('recurring-message', 'Amount is required. Use -25.32 for out, 25.32 for in.', 'error');
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
window.payLiquidityLiability = payLiquidityLiability;
window.deleteLiquidityEntry = deleteLiquidityEntry;
window.deleteLiquidityRecurring = deleteLiquidityRecurring;

document.getElementById('save-liability-btn')?.addEventListener('click', saveLiability);
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

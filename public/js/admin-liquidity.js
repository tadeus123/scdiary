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

function timestampFromDateInput(value) {
  if (!value) return localNowTimestamp();
  return `${value}T12:00:00.000Z`;
}

async function saveLiability() {
  const button = document.getElementById('save-liability-btn');
  const payload = {
    amount: document.getElementById('liability-amount').value,
    currency: document.getElementById('liability-currency').value,
    due_date: document.getElementById('liability-due').value,
    name: document.getElementById('liability-name').value.trim()
  };

  if (!payload.amount || !payload.name) {
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
  const amount = document.getElementById('entry-amount').value;
  const currency = document.getElementById('entry-currency').value;
  const direction = document.getElementById('entry-direction').value;
  const note = document.getElementById('entry-content').value.trim();
  const date = document.getElementById('entry-date').value;
  const saveBtn = document.getElementById('save-btn');

  if (!amount) {
    showMessage('message-container', 'Amount is required.', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'saving...';

  try {
    const response = await fetch('/admin/liquidity/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        direction,
        note,
        timestamp: timestampFromDateInput(date)
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
  const payload = {
    name: document.getElementById('recurring-name').value,
    amount: document.getElementById('recurring-amount').value,
    currency: document.getElementById('recurring-currency').value,
    direction: document.getElementById('recurring-direction').value,
    day_of_month: document.getElementById('recurring-day').value,
    start_date: document.getElementById('recurring-start').value
  };

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

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveEntry();
  }
});

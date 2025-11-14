// Admin panel functionality - save entry

// Get elements
const entryContent = document.getElementById('entry-content');
const saveBtn = document.getElementById('save-btn');
const messageContainer = document.getElementById('message-container');

// Save entry
async function saveEntry() {
  const content = entryContent.value.trim();
  
  if (!content) {
    showMessage('Please write something before saving.', 'error');
    return;
  }
  
  saveBtn.disabled = true;
  saveBtn.textContent = 'saving...';
  
  try {
    // Create ISO string using local time (not UTC)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
    
    const response = await fetch('/admin/entry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        content,
        timestamp: localTimestamp
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showMessage('Entry saved successfully!', 'success');
      entryContent.value = '';
      
      // Reload page to show new entry
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showMessage(data.error || 'Failed to save entry.', 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showMessage('Network error. Please try again.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'save';
  }
}

// Show message
function showMessage(text, type) {
  const messageClass = type === 'error' ? 'error-message' : 'success-message';
  messageContainer.innerHTML = `<div class="${messageClass}">${text}</div>`;
  
  setTimeout(() => {
    messageContainer.innerHTML = '';
  }, 5000);
}

// Delete entry
async function deleteEntry(entryId) {
  if (!confirm('Are you sure you want to delete this entry?')) {
    return;
  }
  
  try {
    const response = await fetch(`/admin/entry/${entryId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Remove the entry from the DOM
      const entryElement = document.querySelector(`[data-entry-id="${entryId}"]`);
      if (entryElement) {
        entryElement.style.opacity = '0';
        entryElement.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          entryElement.remove();
          // Reload page to refresh the list
          window.location.reload();
        }, 300);
      }
    } else {
      showMessage(data.error || 'Failed to delete entry.', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showMessage('Network error. Please try again.', 'error');
  }
}

// Logout function
function logout(event) {
  event.preventDefault();
  document.getElementById('logout-form').submit();
}

// Allow Ctrl/Cmd + S to save
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveEntry();
  }
});

// Goals management
const goalInput = document.getElementById('goal-input');
const goalsList = document.getElementById('goals-list');

// Load goals on page load
if (goalsList) {
  loadGoals();
}

async function loadGoals() {
  try {
    const response = await fetch('/admin/goals');
    const data = await response.json();
    
    if (data.success) {
      renderGoals(data.goals);
    }
  } catch (error) {
    console.error('Error loading goals:', error);
  }
}

function renderGoals(goals) {
  if (!goalsList) return;
  
  if (goals.length === 0) {
    goalsList.innerHTML = '<p style="opacity: 0.5; font-style: italic;">No goals yet. Add your first goal above!</p>';
    return;
  }
  
  goalsList.innerHTML = goals.map(goal => `
    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 3px;">
      <span style="flex: 1; font-size: 0.95rem;">${escapeHtml(goal.text)}</span>
      <button onclick="deleteGoal('${goal.id}')" style="background: none; border: none; color: var(--text-color); cursor: pointer; opacity: 0.5; font-size: 1.2rem; padding: 0 0.5rem;" title="Delete goal">×</button>
    </div>
  `).join('');
}

async function addGoal() {
  if (!goalInput) return;
  
  const text = goalInput.value.trim();
  
  if (!text) {
    return;
  }
  
  try {
    const response = await fetch('/admin/goal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text })
    });
    
    const data = await response.json();
    
    if (data.success) {
      goalInput.value = '';
      loadGoals();
    } else {
      showMessage(data.error || 'Failed to add goal.', 'error');
    }
  } catch (error) {
    console.error('Error adding goal:', error);
    showMessage('Network error. Please try again.', 'error');
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Are you sure you want to delete this goal?')) {
    return;
  }
  
  try {
    const response = await fetch(`/admin/goal/${goalId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      loadGoals();
    } else {
      showMessage(data.error || 'Failed to delete goal.', 'error');
    }
  } catch (error) {
    console.error('Error deleting goal:', error);
    showMessage('Network error. Please try again.', 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


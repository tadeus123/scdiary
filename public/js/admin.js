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
    const response = await fetch('/admin/entry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content })
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


// Admin panel functionality - save entry

// Get elements
const entryContent = document.getElementById('entry-content');
const saveBtn = document.getElementById('save-btn');
const messageContainer = document.getElementById('message-container');

// Book autocomplete variables
let autocompleteBooks = [];
let autocompleteDropdown = null;
let autocompleteVisible = false;
let autocompleteSelectedIndex = -1;
let autocompleteMentionStart = -1;

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

// ========================================
// BOOK MENTION AUTOCOMPLETE
// ========================================

// Create autocomplete dropdown element
function createAutocompleteDropdown() {
  if (autocompleteDropdown) return;
  
  autocompleteDropdown = document.createElement('div');
  autocompleteDropdown.className = 'book-autocomplete';
  autocompleteDropdown.style.display = 'none';
  document.body.appendChild(autocompleteDropdown);
}

// Score and rank books based on query match quality
function scoreBookMatch(book, query) {
  if (!query || query.trim() === '') return { book, score: 0 };
  
  const q = query.toLowerCase();
  const title = book.title.toLowerCase();
  const author = book.author.toLowerCase();
  
  let score = 0;
  
  // Highest priority: Title starts with query (e.g., "ste" matches "Steve Jobs")
  if (title.startsWith(q)) {
    score += 100;
  }
  
  // High priority: Word in title starts with query (e.g., "job" matches "Steve Jobs")
  const titleWords = title.split(/\s+/);
  if (titleWords.some(word => word.startsWith(q))) {
    score += 50;
  }
  
  // Medium priority: Title contains query anywhere
  if (title.includes(q)) {
    score += 25;
  }
  
  // Lower priority: Author starts with query
  if (author.startsWith(q)) {
    score += 20;
  }
  
  // Low priority: Author contains query
  if (author.includes(q)) {
    score += 10;
  }
  
  // Bonus: Shorter titles rank higher (more specific)
  score += Math.max(0, 10 - title.length / 10);
  
  return { book, score };
}

// Show autocomplete dropdown
function showAutocomplete(books, query) {
  if (!autocompleteDropdown) createAutocompleteDropdown();
  
  // Score and sort books by relevance
  let scored = books.map(book => scoreBookMatch(book, query));
  
  // Filter out books with zero score (no match)
  scored = scored.filter(item => item.score > 0);
  
  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);
  
  // Extract just the books
  const filtered = scored.map(item => item.book);
  
  if (filtered.length === 0) {
    hideAutocomplete();
    return;
  }
  
  autocompleteBooks = filtered.slice(0, 6); // Limit to 6 results (more compact)
  autocompleteSelectedIndex = -1;
  
  // Build dropdown HTML with highlighting
  autocompleteDropdown.innerHTML = autocompleteBooks.map((book, index) => {
    const highlightedTitle = highlightMatch(book.title, query);
    const highlightedAuthor = highlightMatch(book.author, query);
    return `
      <div class="book-autocomplete-item" data-index="${index}">
        <div class="book-autocomplete-title">${highlightedTitle}</div>
        <div class="book-autocomplete-author">${highlightedAuthor}</div>
      </div>
    `;
  }).join('');
  
  // Position dropdown near cursor position in textarea
  const coords = getCaretCoordinates(entryContent, entryContent.selectionEnd);
  const textareaRect = entryContent.getBoundingClientRect();
  
  autocompleteDropdown.style.left = `${textareaRect.left + coords.left}px`;
  autocompleteDropdown.style.top = `${textareaRect.top + coords.top + 20}px`; // 20px below cursor line
  autocompleteDropdown.style.display = 'block';
  autocompleteVisible = true;
  
  // Add click handlers
  autocompleteDropdown.querySelectorAll('.book-autocomplete-item').forEach((item, index) => {
    item.addEventListener('click', () => selectAutocompleteItem(index));
    item.addEventListener('mouseenter', () => {
      autocompleteSelectedIndex = index;
      updateAutocompleteSelection();
    });
  });
}

// Hide autocomplete dropdown
function hideAutocomplete() {
  if (autocompleteDropdown) {
    autocompleteDropdown.style.display = 'none';
  }
  autocompleteVisible = false;
  autocompleteSelectedIndex = -1;
  autocompleteMentionStart = -1;
}

// Update visual selection in autocomplete
function updateAutocompleteSelection() {
  if (!autocompleteDropdown) return;
  
  const items = autocompleteDropdown.querySelectorAll('.book-autocomplete-item');
  items.forEach((item, index) => {
    if (index === autocompleteSelectedIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Select an autocomplete item
function selectAutocompleteItem(index) {
  if (index < 0 || index >= autocompleteBooks.length) return;
  
  const book = autocompleteBooks[index];
  const content = entryContent.value;
  const cursorPos = entryContent.selectionStart;
  
  // Find the @ symbol position
  let mentionStart = autocompleteMentionStart;
  if (mentionStart === -1) {
    mentionStart = content.lastIndexOf('@', cursorPos);
  }
  
  if (mentionStart === -1) {
    hideAutocomplete();
    return;
  }
  
  // Replace @query with @[Book Title]
  const before = content.substring(0, mentionStart);
  const after = content.substring(cursorPos);
  const mention = `@[${book.title}]`;
  
  entryContent.value = before + mention + after;
  entryContent.selectionStart = entryContent.selectionEnd = before.length + mention.length;
  
  hideAutocomplete();
  entryContent.focus();
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Highlight matching text in search results
function highlightMatch(text, query) {
  if (!query || query.trim() === '') return escapeHtml(text);
  
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
  const regex = new RegExp(`(${q})`, 'gi');
  
  return escaped.replace(regex, '<strong>$1</strong>');
}

// Get cursor coordinates within textarea (for positioning dropdown)
function getCaretCoordinates(element, position) {
  // Create a mirror div to measure text position
  const mirror = document.createElement('div');
  const computed = window.getComputedStyle(element);
  
  // Copy textarea styles to mirror
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.font = computed.font;
  mirror.style.padding = computed.padding;
  mirror.style.border = computed.border;
  mirror.style.width = computed.width;
  mirror.style.lineHeight = computed.lineHeight;
  
  document.body.appendChild(mirror);
  
  // Get text up to cursor
  const textBeforeCursor = element.value.substring(0, position);
  mirror.textContent = textBeforeCursor;
  
  // Create a span for the cursor position
  const cursorSpan = document.createElement('span');
  cursorSpan.textContent = '|';
  mirror.appendChild(cursorSpan);
  
  const coords = {
    top: cursorSpan.offsetTop,
    left: cursorSpan.offsetLeft
  };
  
  document.body.removeChild(mirror);
  
  return coords;
}

// Handle input in textarea - detect @ mentions
entryContent.addEventListener('input', async (e) => {
  const content = entryContent.value;
  const cursorPos = entryContent.selectionStart;
  
  // Find if we're in an @ mention
  const textBeforeCursor = content.substring(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
  
  if (atMatch) {
    // We're typing after an @
    autocompleteMentionStart = cursorPos - atMatch[0].length;
    const query = atMatch[1];
    
    // Fetch books from server
    try {
      const response = await fetch(`/admin/api/books-search?q=${encodeURIComponent(query)}`);
      
      // Check if response is ok
      if (!response.ok) {
        console.warn('Failed to fetch books:', response.status);
        hideAutocomplete();
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.books && data.books.length > 0) {
        showAutocomplete(data.books, query);
      } else {
        hideAutocomplete();
      }
    } catch (error) {
      console.error('Error fetching books:', error);
      hideAutocomplete();
    }
  } else {
    hideAutocomplete();
  }
});

// Handle keyboard navigation in autocomplete
entryContent.addEventListener('keydown', (e) => {
  if (!autocompleteVisible) return;
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      autocompleteSelectedIndex = Math.min(
        autocompleteSelectedIndex + 1,
        autocompleteBooks.length - 1
      );
      updateAutocompleteSelection();
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, 0);
      updateAutocompleteSelection();
      break;
      
    case 'Enter':
    case 'Tab':
      if (autocompleteSelectedIndex >= 0) {
        e.preventDefault();
        selectAutocompleteItem(autocompleteSelectedIndex);
      }
      break;
      
    case 'Escape':
      e.preventDefault();
      hideAutocomplete();
      break;
  }
});

// Hide autocomplete when clicking outside
document.addEventListener('click', (e) => {
  if (autocompleteVisible && 
      !autocompleteDropdown.contains(e.target) && 
      e.target !== entryContent) {
    hideAutocomplete();
  }
});


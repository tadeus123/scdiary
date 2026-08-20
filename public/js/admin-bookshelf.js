// Admin Bookshelf Management
let network = null;
let nodesDataSet = null;
let edgesDataSet = null;

// Get edge colors based on current theme
function getEdgeColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    color: isDark ? 'rgba(226, 232, 240, 0.15)' : 'rgba(26, 26, 26, 0.1)',
    highlight: 'rgba(193, 106, 40, 0.3)'
  };
}

// Update edge colors when theme changes
function updateEdgeColors() {
  if (edgesDataSet) {
    const newColor = getEdgeColor();
    edgesDataSet.forEach(edge => {
      edgesDataSet.update({
        id: edge.id,
        color: newColor
      });
    });
  }
}

// Initialize admin bookshelf network
async function initAdminBookshelf() {
  try {
    const response = await fetch('/api/books');
    const data = await response.json();
    
    if (!data.success) {
      console.error('Failed to load books');
      return;
    }
    
    const { books, connections } = data;

    if (network) {
      network.destroy();
      network = null;
    }
    
    const networkDiv = document.getElementById('admin-bookshelf-network');
    const emptyDiv = document.getElementById('network-empty');
    
    // Show/hide empty state
    if (books.length === 0) {
      networkDiv.style.display = 'none';
      emptyDiv.style.display = 'block';
      return;
    } else {
      networkDiv.style.display = 'block';
      emptyDiv.style.display = 'none';
    }
    
    // Create nodes from books
    nodesDataSet = new vis.DataSet(
      books.map(book => ({
        id: book.id,
        shape: 'image',
        image: book.cover_image_url,
        shapeProperties: {
          useImageSize: false,
          useBorderWithImage: true
        },
        borderWidth: 2,
        borderWidthSelected: 4,
        color: {
          border: 'rgba(193, 106, 40, 0.3)',
          highlight: {
            border: '#C16A28'
          }
        },
        bookData: book
      }))
    );
    
    // Create edges from connections
    const edgeColor = getEdgeColor();
    edgesDataSet = new vis.DataSet(
      connections.map(conn => ({
        id: conn.id, // Use the actual database ID
        from: conn.from_book_id,
        to: conn.to_book_id,
        color: edgeColor,
        width: 1,
        smooth: {
          type: 'continuous'
        },
        connectionData: conn // Store full connection data
      }))
    );
    
    const container = document.getElementById('admin-bookshelf-network');
    const graphData = { 
      nodes: nodesDataSet, 
      edges: edgesDataSet 
    };
    
    const options = {
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 300
        },
        barnesHut: {
          gravitationalConstant: -5000, // Much stronger repulsion = less overlap
          centralGravity: 0.05, // Less center pull = more spread
          springLength: 250, // Longer springs = more space between groups
          springConstant: 0.015, // Weaker springs = softer connections
          damping: 0.15, // More damping = smoother settling
          avoidOverlap: 1 // Maximum overlap avoidance
        }
      },
      interaction: {
        zoomView: true,
        dragView: true,
        hover: true,
        zoomSpeed: 0.5,  // Smooth zoom
        zoomMin: 0.2,    // Can zoom out far
        zoomMax: 8.0     // Deep infinite zoom feeling
      },
      nodes: {
        borderWidth: 2,
        borderWidthSelected: 4,
        shape: 'image',
        size: 40,
        shapeProperties: {
          useImageSize: false,
          interpolation: true
        },
        scaling: {
          min: 10,
          max: 150,  // Allow larger growth for infinite depth feeling
          label: {
            enabled: false
          }
        }
      },
      edges: {
        scaling: {
          min: 1,
          max: 3
        }
      }
    };
    
    network = new vis.Network(container, graphData, options);
    
    // Obsidian-style: Infinite depth zoom - ultra smooth, no jitter
    let lastUpdate = 0;
    network.on('zoom', function(params) {
      const scale = network.getScale();
      
      // Nodes grow VERY slowly - mostly camera creates depth feeling
      const updates = [];
      nodesDataSet.forEach(node => {
        const nodeSize = 40 * Math.pow(scale, 0.12); // Very slow growth
        updates.push({
          id: node.id,
          size: Math.min(nodeSize, 65)
        });
      });
      nodesDataSet.update(updates);
      
      // Ultra-smooth spacing expansion - responsive, no jitter
      const now = Date.now();
      if (now - lastUpdate > 100) { // Responsive throttle
        lastUpdate = now;
        
        // Gentle spacing expansion
        const dynamicSpacing = 250 * Math.pow(scale, 0.4);
        
        network.setOptions({
          physics: {
            enabled: true,
            barnesHut: {
              springLength: dynamicSpacing,
              springConstant: 0.001, // Very weak springs = minimal movement
              damping: 0.9, // Maximum damping = no jitter
              avoidOverlap: 1
            }
          }
        });
        
        // Quick freeze
        setTimeout(() => {
          network.stopSimulation();
        }, 60);
      }
    });
    
    // Disable physics after initial layout
    network.once('stabilizationIterationsDone', function() {
      network.setOptions({ physics: false });
    });
    
    // Click a book to open its panel
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesDataSet.get(nodeId);
        showAdminBookPanel(node.bookData);
      }
    });
    
  } catch (error) {
    console.error('Error loading admin bookshelf:', error);
  }
}

async function deleteCurrentBook() {
  if (!currentAdminBookId || !nodesDataSet) return;

  const node = nodesDataSet.get(currentAdminBookId);
  const book = node?.bookData;
  const label = book ? `"${book.title}" by ${book.author}` : 'this book';

  if (!confirm(`Delete ${label}?\n\nThis will also delete all its connections.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/books/${currentAdminBookId}`, {
      method: 'DELETE'
    });
    const data = await response.json();

    if (data.success) {
      hideAdminBookPanel();
      showMessage('Book deleted.', 'success');
      await initAdminBookshelf();
    } else {
      showMessage('Failed to delete book: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting book:', error);
    showMessage('Error deleting book', 'error');
  }
}

// Image preview
document.getElementById('cover').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById('cover-preview');
      const img = document.getElementById('preview-img');
      img.src = e.target.result;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
});

// Form submission
document.getElementById('book-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  
  try {
    const response = await fetch('/api/books', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      showMessage('Book added successfully!', 'success');
      
      // Reset form
      e.target.reset();
      document.getElementById('cover-preview').classList.add('hidden');
      
      // Reload network
      await initAdminBookshelf();
    } else {
      showMessage('Failed to add book: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error adding book:', error);
    showMessage('Error adding book', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Book';
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillBookResearch(container, book) {
  if (!container) return;
  const profile = book.research_profile || {};
  const genre = profile.category || book.category;
  const about = profile.about;

  if (!about && !genre) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = [
    genre ? `<p class="book-genre">${escapeHtml(genre)}</p>` : '',
    about ? `<p class="book-research-about">${escapeHtml(about)}</p>` : ''
  ].join('');
}

// Show admin book panel (with re-read option)
let currentAdminBookId = null;

function showAdminBookPanel(book) {
  currentAdminBookId = book.id;
  const panel = document.getElementById('admin-book-panel');
  const coverImg = document.getElementById('admin-book-cover');
  const titleEl = document.getElementById('admin-book-title');
  const authorEl = document.getElementById('admin-book-author');
  const datesContainer = document.getElementById('admin-book-dates');
  const dateInput = document.getElementById('reread-date');

  coverImg.src = book.cover_image_url;
  coverImg.alt = book.title;
  titleEl.textContent = book.title;
  authorEl.textContent = book.author;
  fillBookResearch(document.getElementById('admin-book-research'), book);

  // Build read dates list
  const allReadDates = [
    { date: book.date_read },
    ...(book.rereads || []).map(r => ({ date: r.date_read }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  datesContainer.innerHTML = allReadDates.map(rd =>
    `<p class="book-date">Read: ${formatDate(rd.date)}</p>`
  ).join('');

  dateInput.value = '';

  panel.classList.remove('hidden');
}

function hideAdminBookPanel() {
  document.getElementById('admin-book-panel').classList.add('hidden');
  currentAdminBookId = null;
}

// Close admin book panel
document.getElementById('admin-close-panel')?.addEventListener('click', hideAdminBookPanel);
document.getElementById('admin-delete-book-btn')?.addEventListener('click', deleteCurrentBook);

// Mark as re-read
document.getElementById('mark-reread-btn')?.addEventListener('click', async () => {
  if (!currentAdminBookId) return;

  const dateInput = document.getElementById('reread-date');
  const dateRead = dateInput.value;

  if (!dateRead) {
    showRereadMessage('Please select a date', 'error');
    return;
  }

  const btn = document.getElementById('mark-reread-btn');
  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    const response = await fetch(`/api/books/${currentAdminBookId}/reread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRead })
    });

    const data = await response.json();

    if (data.success) {
      showRereadMessage('Re-read added!', 'success');
      // Refetch books and update panel
      const booksResponse = await fetch('/api/books');
      const booksData = await booksResponse.json();
      if (booksData.success) {
        const updatedBook = booksData.books.find(b => b.id === currentAdminBookId);
        if (updatedBook) {
          // Update node's bookData
          nodesDataSet.update([{ id: currentAdminBookId, bookData: updatedBook }]);
          showAdminBookPanel(updatedBook);
        }
      }
      } else {
      showRereadMessage('Failed: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error adding re-read:', error);
    showRereadMessage('Error adding re-read', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'I read it again';
  }
});

// Show message in re-read panel
function showRereadMessage(message, type = 'info') {
  const el = document.getElementById('reread-message');
  if (!el) return;
  el.textContent = message;
  el.className = `reread-message ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Show message helper
function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('form-message');
  messageDiv.textContent = message;
  messageDiv.className = `form-message ${type}`;
  messageDiv.style.display = 'block';
  
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}

// AI Tools: research every book, then rebuild connections from matching
document.getElementById('recategorize-all')?.addEventListener('click', async () => {
  const button = document.getElementById('recategorize-all');
  const messageDiv = document.getElementById('ai-tools-message');
  
  if (!confirm('This lets gpt-4o look at the researched shelf and draw connections like a person — same kinds of books together, plus the extra links that belong. Continue?')) {
    return;
  }
  
  button.disabled = true;
  button.textContent = 'Researching books...';
  messageDiv.textContent = 'Drawing connections the way a person would. This is usually under a minute.';
  messageDiv.className = 'form-message info';
  messageDiv.style.display = 'block';
  
  try {
    const response = await fetch('/api/books/recategorize-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      messageDiv.textContent = `Done. ${data.connectionsCreated} connections. Click a book to read its research notes.`;
      messageDiv.className = 'form-message success';
      await initAdminBookshelf();
    } else {
      messageDiv.textContent = `Error: ${data.error}`;
      messageDiv.className = 'form-message error';
    }
  } catch (error) {
    console.error('Error researching books:', error);
    messageDiv.textContent = `Error: ${error.message}`;
    messageDiv.className = 'form-message error';
  } finally {
    button.disabled = false;
    button.textContent = 'Research & reconnect';
    
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 8000);
  }
});

// Listen for theme changes to update edge colors
document.addEventListener('themeChanged', updateEdgeColors);

// Initialize on page load
window.addEventListener('DOMContentLoaded', initAdminBookshelf);

// Admin Bookshelf Management
let network = null;
let connectionMode = false;
let deleteMode = false;
let selectedNode = null;
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
    
    // Click handler for connection and delete modes
    network.on('click', function(params) {
      if (deleteMode) {
        handleDeleteClick(params);
      } else if (connectionMode && params.nodes.length > 0) {
        handleConnectionClick(params.nodes[0]);
      }
    });
    
  } catch (error) {
    console.error('Error loading admin bookshelf:', error);
  }
}

// Handle connection mode clicks
function handleConnectionClick(nodeId) {
  if (!selectedNode) {
    // First node selected
    selectedNode = nodeId;
    network.selectNodes([nodeId]);
    showMessage('Now click another book to connect', 'info');
  } else if (selectedNode === nodeId) {
    // Clicked same node - deselect
    selectedNode = null;
    network.unselectAll();
    showMessage('Selection cancelled', 'info');
  } else {
    // Second node selected - create connection
    createConnection(selectedNode, nodeId);
    selectedNode = null;
    network.unselectAll();
  }
}

// Create connection between two books
async function createConnection(fromId, toId) {
  try {
    const response = await fetch('/api/books/connections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fromId, toId })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showMessage('Connection created!', 'success');
      // Add edge to network with the database ID
      const edgeColor = getEdgeColor();
      edgesDataSet.add({
        id: data.connection.id, // Use the database ID
        from: fromId,
        to: toId,
        color: edgeColor,
        width: 1,
        smooth: {
          type: 'continuous'
        },
        connectionData: data.connection
      });
    } else {
      showMessage('Failed to create connection: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error creating connection:', error);
    showMessage('Error creating connection', 'error');
  }
}

// Toggle connection mode
document.getElementById('toggle-connection-mode').addEventListener('click', () => {
  // Turn off delete mode if it's on
  if (deleteMode) {
    deleteMode = false;
    document.getElementById('delete-status').textContent = 'OFF';
    document.getElementById('toggle-delete-mode').classList.remove('active');
  }
  
  connectionMode = !connectionMode;
  const statusSpan = document.getElementById('connection-status');
  const button = document.getElementById('toggle-connection-mode');
  
  if (connectionMode) {
    statusSpan.textContent = 'ON';
    button.classList.add('active');
    showMessage('Connection mode enabled. Click two books to connect them.', 'info');
  } else {
    statusSpan.textContent = 'OFF';
    button.classList.remove('active');
    selectedNode = null;
    if (network) network.unselectAll();
    showMessage('Connection mode disabled', 'info');
  }
});

// Toggle delete mode
document.getElementById('toggle-delete-mode').addEventListener('click', () => {
  // Turn off connection mode if it's on
  if (connectionMode) {
    connectionMode = false;
    document.getElementById('connection-status').textContent = 'OFF';
    document.getElementById('toggle-connection-mode').classList.remove('active');
    selectedNode = null;
    if (network) network.unselectAll();
  }
  
  deleteMode = !deleteMode;
  const statusSpan = document.getElementById('delete-status');
  const button = document.getElementById('toggle-delete-mode');
  
  if (deleteMode) {
    statusSpan.textContent = 'ON';
    button.classList.add('active');
    showMessage('Delete mode enabled. Click a book or connection to delete it.', 'info');
  } else {
    statusSpan.textContent = 'OFF';
    button.classList.remove('active');
    showMessage('Delete mode disabled', 'info');
  }
});

// Handle delete mode clicks
async function handleDeleteClick(params) {
  // Delete book (node)
  if (params.nodes.length > 0) {
    const nodeId = params.nodes[0];
    const node = nodesDataSet.get(nodeId);
    
    if (confirm(`Delete "${node.bookData.title}" by ${node.bookData.author}?\n\nThis will also delete all its connections.`)) {
      try {
        const response = await fetch(`/api/books/${nodeId}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          showMessage('Book deleted successfully!', 'success');
          // Reload network
          await initAdminBookshelf();
        } else {
          showMessage('Failed to delete book: ' + data.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting book:', error);
        showMessage('Error deleting book', 'error');
      }
    }
  }
  // Delete connection (edge)
  else if (params.edges.length > 0) {
    const edgeId = params.edges[0];
    const edge = edgesDataSet.get(edgeId);
    
    if (confirm('Delete this connection between books?')) {
      try {
        const response = await fetch(`/api/books/connections/${edgeId}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          showMessage('Connection deleted!', 'success');
          // Remove from network
          edgesDataSet.remove(edgeId);
        } else {
          showMessage('Failed to delete connection: ' + data.error, 'error');
        }
      } catch (error) {
        console.error('Error deleting connection:', error);
        showMessage('Error deleting connection', 'error');
      }
    }
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

// AI Tools: Recategorize all books button
document.getElementById('recategorize-all')?.addEventListener('click', async () => {
  const button = document.getElementById('recategorize-all');
  const messageDiv = document.getElementById('ai-tools-message');
  
  if (!confirm('This will re-categorize all books using AI and rebuild all connections. This may take a few minutes. Continue?')) {
    return;
  }
  
  button.disabled = true;
  button.textContent = '🤖 Categorizing...';
  messageDiv.textContent = 'AI is analyzing your books... This may take a few minutes.';
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
      messageDiv.textContent = `✅ Success! Categorized ${data.categorized} books, created ${data.connectionsCreated} connections.`;
      messageDiv.className = 'form-message success';
      
      // Reload network
      setTimeout(async () => {
        await initAdminBookshelf();
        messageDiv.style.display = 'none';
      }, 3000);
    } else {
      messageDiv.textContent = `❌ Error: ${data.error}`;
      messageDiv.className = 'form-message error';
    }
  } catch (error) {
    console.error('Error recategorizing:', error);
    messageDiv.textContent = `❌ Error: ${error.message}`;
    messageDiv.className = 'form-message error';
  } finally {
    button.disabled = false;
    button.textContent = 'Recategorize All Books';
    
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 8000);
  }
});

// Listen for theme changes to update edge colors
document.addEventListener('themeChanged', updateEdgeColors);

// Initialize on page load
window.addEventListener('DOMContentLoaded', initAdminBookshelf);

// Admin Bookshelf Management
let network = null;
let connectionMode = false;
let selectedNode = null;
let nodesDataSet = null;
let edgesDataSet = null;

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
        shape: 'circularImage',
        image: book.cover_image_url,
        size: 40,
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
    edgesDataSet = new vis.DataSet(
      connections.map(conn => ({
        id: `${conn.from_book_id}-${conn.to_book_id}`,
        from: conn.from_book_id,
        to: conn.to_book_id,
        color: {
          color: 'rgba(26, 26, 26, 0.1)',
          highlight: 'rgba(193, 106, 40, 0.3)'
        },
        width: 1,
        smooth: {
          type: 'continuous'
        }
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
          iterations: 200
        },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 150,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.5
        }
      },
      interaction: {
        zoomView: true,
        dragView: true,
        hover: true
      },
      nodes: {
        borderWidth: 2,
        borderWidthSelected: 4
      }
    };
    
    network = new vis.Network(container, graphData, options);
    
    // Click handler for connection mode
    network.on('click', function(params) {
      if (connectionMode && params.nodes.length > 0) {
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
      // Add edge to network
      edgesDataSet.add({
        id: `${fromId}-${toId}`,
        from: fromId,
        to: toId,
        color: {
          color: 'rgba(26, 26, 26, 0.1)',
          highlight: 'rgba(193, 106, 40, 0.3)'
        },
        width: 1,
        smooth: {
          type: 'continuous'
        }
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

// Initialize on page load
window.addEventListener('DOMContentLoaded', initAdminBookshelf);

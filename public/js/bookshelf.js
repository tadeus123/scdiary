// Bookshelf Network Visualization
let network = null;
let selectedNodeId = null;
let edgesDataSet = null;
let nodesDataSet = null;

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

// Initialize bookshelf network
async function loadBookshelf() {
  try {
    const response = await fetch('/api/books');
    const data = await response.json();
    
    if (!data.success) {
      console.error('Failed to load books');
      return;
    }
    
    const { books, connections } = data;
    
    // If no books, just show empty canvas
    if (books.length === 0) {
      console.log('No books yet');
      return;
    }
    
    // Create nodes from books (book covers as images)
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
        }
      }))
    );
    
    const container = document.getElementById('bookshelf-network');
    const graphData = { nodes: nodesDataSet, edges: edgesDataSet };
    
    const options = {
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 300,
          updateInterval: 25
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
        tooltipDelay: 300,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
        zoomSpeed: 0.6  // Smooth, responsive zoom
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
          min: 15,
          max: 80,
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
    
    // Obsidian-style: Camera zoom + Subtle node scaling + Seamless spacing expansion
    let lastSpacingUpdate = 0;
    network.on('zoom', function(params) {
      const scale = network.getScale();
      
      // Nodes scale VERY subtly - mostly camera movement, less object growth
      const updates = [];
      nodesDataSet.forEach(node => {
        // Much more subtle scaling - caps out quickly, then pure camera zoom
        const nodeSize = 40 * Math.pow(scale, 0.15); // Very subtle scaling
        updates.push({
          id: node.id,
          size: Math.min(nodeSize, 70) // Cap max size - stops growing, pure depth
        });
      });
      nodesDataSet.update(updates);
      
      // 🌊 SEAMLESS SPACING: Dots spread apart smoothly as you zoom in
      // Gentle, smooth transitions
      const now = Date.now();
      if (now - lastSpacingUpdate > 100) { // Slower throttle = smoother
        lastSpacingUpdate = now;
        
        // Gentle spacing expansion - smooth and subtle
        const baseSpacing = 250;
        const spacingMultiplier = Math.pow(scale, 0.6); // Gentler expansion
        const dynamicSpacing = baseSpacing * spacingMultiplier;
        
        network.setOptions({
          physics: {
            enabled: true,
            barnesHut: {
              springLength: dynamicSpacing,
              damping: 0.5 // Very high damping = very smooth
            }
          }
        });
        
        // Longer stabilization for smooth settling
        setTimeout(() => {
          network.stopSimulation();
        }, 200);
      }
    });
    
    // Disable physics after initial layout
    network.once('stabilizationIterationsDone', function() {
      network.setOptions({ physics: false });
    });
    
    // Click handler - show book details
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesDataSet.get(nodeId);
        showBookDetails(node.bookData, nodeId);
      } else {
        hideBookDetails();
      }
    });
    
    // Double click to hide details
    network.on('doubleClick', function(params) {
      hideBookDetails();
    });
    
  } catch (error) {
    console.error('Error loading bookshelf:', error);
  }
}

// Show book details overlay
function showBookDetails(book, nodeId) {
  selectedNodeId = nodeId;
  
  const detailsDiv = document.getElementById('book-details');
  const coverImg = document.getElementById('book-cover-detail');
  const titleEl = document.getElementById('book-title');
  const authorEl = document.getElementById('book-author');
  const dateEl = document.getElementById('book-date');
  
  coverImg.src = book.cover_image_url;
  coverImg.alt = book.title;
  titleEl.textContent = book.title;
  authorEl.textContent = book.author;
  
  // Format date nicely
  const dateRead = new Date(book.date_read);
  dateEl.textContent = `Read: ${dateRead.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`;
  
  detailsDiv.classList.remove('hidden');
  
  // Enlarge the selected node
  if (network) {
    network.selectNodes([nodeId], false);
  }
}

// Hide book details overlay
function hideBookDetails() {
  const detailsDiv = document.getElementById('book-details');
  detailsDiv.classList.add('hidden');
  selectedNodeId = null;
  
  if (network) {
    network.unselectAll();
  }
}

// Close button handler
document.getElementById('close-details').addEventListener('click', hideBookDetails);

// Close on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideBookDetails();
  }
});

// Toggle switch handler (placeholder for future functionality)
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('bookshelf-toggle');
  if (toggleSwitch) {
    toggleSwitch.addEventListener('change', function() {
      // Placeholder for future functionality
      console.log('Toggle switched:', this.checked);
    });
  }
});

// Listen for theme changes to update edge colors
document.addEventListener('themeChanged', updateEdgeColors);

// Initialize on page load
window.addEventListener('DOMContentLoaded', loadBookshelf);

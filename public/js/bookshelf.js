// Bookshelf Network Visualization
let network = null;
let selectedNodeId = null;
let edgesDataSet = null;
let nodesDataSet = null;
let allBooks = [];
let allConnections = [];
let isTimelineView = false;
let timelineBooks = []; // Store sorted books for timeline clicks
let timelineBooksByPosition = {}; // Group books by x-position
let currentBookIndexByPosition = {}; // Track current book index for each position

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
    let data;
    
    // Use prefetched data if available (from corner page)
    if (window.__prefetchedBookshelfData__) {
      console.log('Using prefetched bookshelf data - instant load!');
      data = window.__prefetchedBookshelfData__;
      // Clear it so we don't use stale data on refresh
      window.__prefetchedBookshelfData__ = null;
    } else {
      // Fetch normally if not prefetched
      const response = await fetch(`/api/books?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      data = await response.json();
    }
    
    if (!data.success) {
      console.error('Failed to load books');
      return;
    }
    
    const { books, connections } = data;
    
    // Store books and connections globally
    allBooks = books;
    allConnections = connections;
    
    // If no books, just show empty canvas
    if (books.length === 0) {
      console.log('No books yet');
      return;
    }
    
    // If timeline view is active, refresh it with new data
    if (isTimelineView) {
      renderTimeline();
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

// Toggle switch handler - Switch between network and timeline views
document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('bookshelf-toggle');
  if (toggleSwitch) {
    toggleSwitch.addEventListener('change', function() {
      // Hide book details when switching views
      hideBookDetails();
      
      isTimelineView = this.checked;
      if (isTimelineView) {
        showTimelineView();
      } else {
        showNetworkView();
      }
    });
  }
});

// Show network view
function showNetworkView() {
  const networkContainer = document.getElementById('bookshelf-network');
  const timelineContainer = document.getElementById('bookshelf-timeline');
  
  networkContainer.style.display = 'block';
  if (timelineContainer) {
    timelineContainer.style.display = 'none';
  }
  
  // Refresh network if it exists
  if (network) {
    network.redraw();
  }
}

// Show timeline view
function showTimelineView() {
  const networkContainer = document.getElementById('bookshelf-network');
  let timelineContainer = document.getElementById('bookshelf-timeline');
  
  networkContainer.style.display = 'none';
  
  // Create timeline container if it doesn't exist
  if (!timelineContainer) {
    timelineContainer = document.createElement('div');
    timelineContainer.id = 'bookshelf-timeline';
    timelineContainer.className = 'bookshelf-timeline';
    document.body.appendChild(timelineContainer);
  }
  
  timelineContainer.style.display = 'block';
  renderTimeline();
}

// Render timeline visualization - simple line graph
async function renderTimeline() {
  const container = document.getElementById('bookshelf-timeline');
  if (!container || allBooks.length === 0) return;
  
  // Sort books by date
  const sortedBooks = [...allBooks].sort((a, b) => 
    new Date(a.date_read) - new Date(b.date_read)
  );
  
  // Store for click handlers
  timelineBooks = sortedBooks;
  
  // Fetch total reading time (use prefetched if available)
  let readingTimeHtml = '';
  try {
    let data;
    
    // Use prefetched reading time if available
    if (window.__prefetchedReadingTime__) {
      console.log('Using prefetched reading time - instant load!');
      data = window.__prefetchedReadingTime__;
      window.__prefetchedReadingTime__ = null; // Clear after use
    } else {
      // Fetch normally if not prefetched
      const response = await fetch(`/api/books/total-reading-time?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      data = await response.json();
    }
    
    if (data.success) {
      readingTimeHtml = `
        <div class="reading-time-summary">
          total reading time: ${data.totalHours} hours
        </div>
      `;
    }
  } catch (error) {
    console.error('Error fetching reading time:', error);
  }
  
  // Create SVG line graph - scale based on number of books
  const minWidth = 1200;
  const pixelsPerBook = 25; // Give each book more space
  const svgWidth = Math.max(minWidth, sortedBooks.length * pixelsPerBook);
  const svgHeight = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;
  
  const firstDate = new Date(sortedBooks[0].date_read);
  const lastDate = new Date(sortedBooks[sortedBooks.length - 1].date_read);
  let timeRange = lastDate - firstDate;
  
  // Handle edge case: if all books on same day or only one book, add 1 day padding
  if (timeRange === 0) {
    timeRange = 86400000; // 1 day in milliseconds
  }
  
  // Create points for line graph (cumulative books over time)
  const points = sortedBooks.map((book, index) => {
    const date = new Date(book.date_read);
    let x = padding.left + ((date - firstDate) / timeRange) * graphWidth;
    
    // If all books are on the same day, center them
    if (lastDate - firstDate === 0) {
      x = padding.left + graphWidth / 2;
    }
    
    const y = padding.top + graphHeight - ((index + 1) / sortedBooks.length) * graphHeight;
    return { x, y, book, index };
  });
  
  // Group books by the exact same date (not just proximity)
  timelineBooksByPosition = {};
  currentBookIndexByPosition = {};
  
  points.forEach(point => {
    const book = point.book;
    const date = new Date(book.date_read);
    
    // Safeguard: ensure valid date
    if (isNaN(date.getTime())) {
      console.warn('Invalid date for book:', book.title);
      return;
    }
    
    const dateKey = date.toDateString(); // Use date as key
    
    // Create group for this date if it doesn't exist
    if (!timelineBooksByPosition[dateKey]) {
      timelineBooksByPosition[dateKey] = [];
      currentBookIndexByPosition[dateKey] = 0;
    }
    
    timelineBooksByPosition[dateKey].push(point.index);
    
    // Store the date key with the point for later use
    point.dateKey = dateKey;
  });
  
  // Create line path
  const linePath = points.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');
  
  // Render
  container.innerHTML = `
    <svg class="timeline-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <!-- Grid lines -->
      ${[0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const bookCount = Math.round(sortedBooks.length * ratio);
        return `
        <line x1="${padding.left}" y1="${padding.top + graphHeight * (1 - ratio)}" 
              x2="${svgWidth - padding.right}" y2="${padding.top + graphHeight * (1 - ratio)}" 
              class="timeline-grid-line" />
        <text x="${padding.left - 10}" y="${padding.top + graphHeight * (1 - ratio) + 5}" 
              class="timeline-axis-label" text-anchor="end">
          ${bookCount}
        </text>
      `;}).join('')}
      
      <!-- Line graph -->
      <path d="${linePath}" class="timeline-line" />
      
      <!-- Book markers -->
      ${points.map((p, idx) => {
        return `
        <g class="timeline-marker">
          <line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${svgHeight - padding.bottom}" 
                class="timeline-marker-line" 
                onclick="window.showTimelineBook('${p.dateKey}')" />
          <circle cx="${p.x}" cy="${p.y}" r="5" 
                  class="timeline-marker-dot" 
                  onclick="window.showTimelineBook('${p.dateKey}')" />
        </g>
      `;}).join('')}
      
      <!-- Axis labels -->
      <text x="${svgWidth / 2}" y="${svgHeight - 10}" class="timeline-axis-title" text-anchor="middle">
        Time
      </text>
      <text x="20" y="${svgHeight / 2}" class="timeline-axis-title" text-anchor="middle" 
            transform="rotate(-90 20 ${svgHeight / 2})">
        Books Read
      </text>
    </svg>
    ${readingTimeHtml}
  `;
  
}

// Global function for timeline book clicks (called from SVG onclick)
window.showTimelineBook = function(positionKey) {
  console.log('Timeline position clicked:', positionKey);
  
  const booksAtPosition = timelineBooksByPosition[positionKey];
  if (!booksAtPosition || booksAtPosition.length === 0) {
    console.error('No books found at position:', positionKey);
    return;
  }
  
  // Get current index for this position (cycles through books)
  const currentIdx = currentBookIndexByPosition[positionKey];
  const bookIndex = booksAtPosition[currentIdx];
  const book = timelineBooks[bookIndex];
  
  if (book) {
    console.log(`Showing book ${currentIdx + 1}/${booksAtPosition.length}:`, book.title);
    showBookDetails(book, book.id);
    
    // Increment for next click (cycle back to 0 when reaching end)
    currentBookIndexByPosition[positionKey] = (currentIdx + 1) % booksAtPosition.length;
  } else {
    console.error('Book not found at index:', bookIndex);
  }
}

// Listen for theme changes to update edge colors
document.addEventListener('themeChanged', updateEdgeColors);

// Initialize on page load
window.addEventListener('DOMContentLoaded', loadBookshelf);

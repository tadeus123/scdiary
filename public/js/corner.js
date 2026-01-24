// Corner page - load and display images with hover switch effect
document.addEventListener('DOMContentLoaded', async () => {
  const imageStack = document.getElementById('corner-image-stack');
  if (!imageStack) return;
  
  try {
    const response = await fetch('/api/corner-images');
    const data = await response.json();
    
    if (data.success && data.images.length > 0) {
      renderImages(data.images);
    } else {
      imageStack.innerHTML = '<p class="corner-empty">No memories yet.</p>';
    }
  } catch (error) {
    console.error('Error loading images:', error);
    imageStack.innerHTML = '<p class="corner-empty">Error loading images.</p>';
  }
});

function renderImages(images) {
  const imageStack = document.getElementById('corner-image-stack');
  if (!imageStack || images.length === 0) return;
  
  // Use first two images for switch effect
  const image1 = images[0];
  const image2 = images[1] || images[0];
  
  imageStack.innerHTML = `
    <div class="image-card" id="image-card-1">
      <img src="${image1.url}" alt="${image1.alt}" onerror="this.parentElement.style.display='none'">
    </div>
    <div class="image-card" id="image-card-2">
      <img src="${image2.url}" alt="${image2.alt}" onerror="this.parentElement.style.display='none'">
    </div>
  `;
  
  const card1 = document.getElementById('image-card-1');
  const card2 = document.getElementById('image-card-2');
  
  if (card1 && card2) {
    // Hover on first image switches to second
    card1.addEventListener('mouseenter', () => {
      card1.classList.add('flipped');
      card2.classList.add('flipped');
    });
    
    // Hover on second image switches back to first
    card2.addEventListener('mouseenter', () => {
      card1.classList.remove('flipped');
      card2.classList.remove('flipped');
    });
  }
}

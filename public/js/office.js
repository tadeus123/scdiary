// Office page - taste training gallery
document.addEventListener('DOMContentLoaded', async () => {
  const gallery = document.getElementById('office-gallery');
  if (!gallery) return;

  try {
    const response = await fetch('/api/office-items');
    const data = await response.json();

    if (!data.success || !data.categories || data.categories.length === 0) {
      gallery.innerHTML = '<p class="office-empty">Add items to config.json to build your taste board.</p>';
      return;
    }

    let hasAnyItems = false;
    gallery.innerHTML = data.categories.map(category => {
      const items = category.items || [];
      if (items.length > 0) hasAnyItems = true;

      const itemsHtml = items.map(item => `
        <div class="office-card">
          <div class="office-card-image">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.parentElement.classList.add('error')">
          </div>
          ${item.title ? `<h3 class="office-card-title">${escapeHtml(item.title)}</h3>` : ''}
          ${item.description ? `<p class="office-card-desc">${escapeHtml(item.description)}</p>` : ''}
        </div>
      `).join('');

      return `
        <section class="office-category" data-category="${escapeHtml(category.id)}">
          <h2 class="office-category-title">${escapeHtml(category.name)}</h2>
          ${category.description ? `<p class="office-category-desc">${escapeHtml(category.description)}</p>` : ''}
          <div class="office-grid">
            ${items.length > 0 ? itemsHtml : '<p class="office-category-empty">No items yet.</p>'}
          </div>
        </section>
      `;
    }).join('');

    if (!hasAnyItems) {
      gallery.insertAdjacentHTML('afterbegin', '<p class="office-empty">Add images to <code>public/images/office/config.json</code> to build your taste board.</p>');
    }
  } catch (error) {
    console.error('Error loading office gallery:', error);
    gallery.innerHTML = '<p class="office-empty">Error loading gallery.</p>';
  }
});

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openCategory(button) {
  const content = button.nextElementSibling;
  const icon = button.querySelector('.ce-folder-icon');

  button.setAttribute('aria-expanded', 'true');
  content.hidden = false;
  icon.textContent = '▼';
  button.classList.add('is-open');
}

function renderCategories(categories) {
  const container = document.getElementById('ce-categories');
  const emptyState = document.getElementById('ce-empty');

  const categoriesWithVideos = categories.filter((category) => category.videos.length > 0);

  if (categoriesWithVideos.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = categoriesWithVideos.map((category, index) => `
    <section class="ce-category">
      <button
        type="button"
        class="ce-category-header"
        aria-expanded="false"
        aria-controls="ce-category-${index}"
        id="ce-category-toggle-${index}"
      >
        <span class="ce-folder-icon" aria-hidden="true">▶</span>
        <span class="ce-category-name">${escapeHtml(category.name)}</span>
        <span class="ce-video-count">${category.videos.length}</span>
      </button>
      <div
        class="ce-category-content"
        id="ce-category-${index}"
        role="region"
        aria-labelledby="ce-category-toggle-${index}"
        hidden
      >
        <div class="ce-video-grid">
          ${category.videos.map((video) => `
            <a
              class="ce-video-card"
              href="${escapeHtml(video.youtube_url)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div class="ce-video-thumb-wrap">
                <img
                  class="ce-video-thumb"
                  src="${escapeHtml(video.thumbnail_url)}"
                  alt=""
                  loading="lazy"
                >
              </div>
              <h3 class="ce-video-title">${escapeHtml(video.custom_title)}</h3>
            </a>
          `).join('')}
        </div>
      </div>
    </section>
  `).join('');

  container.querySelectorAll('.ce-category-header').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      const content = button.nextElementSibling;
      const icon = button.querySelector('.ce-folder-icon');

      button.setAttribute('aria-expanded', String(!expanded));
      content.hidden = expanded;
      icon.textContent = expanded ? '▶' : '▼';
      button.classList.toggle('is-open', !expanded);
    });
  });

  const firstCategory = container.querySelector('.ce-category-header');
  if (firstCategory) {
    openCategory(firstCategory);
  }
}

async function loadCompanyEducation() {
  try {
    const response = await fetch(`/api/ce?t=${Date.now()}`, { cache: 'no-cache' });
    const data = await response.json();

    if (!data.success) {
      console.error('Failed to load company education data');
      return;
    }

    renderCategories(data.categories || []);
  } catch (error) {
    console.error('Error loading company education:', error);
  }
}

loadCompanyEducation();

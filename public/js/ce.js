function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function setPanelState(state) {
  document.getElementById('ce-loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('ce-categories').classList.toggle('hidden', state !== 'content');
  document.getElementById('ce-empty').classList.toggle('hidden', state !== 'empty');
  document.getElementById('ce-error').classList.toggle('hidden', state !== 'error');
}

function closeCategory(button) {
  const content = button.nextElementSibling;
  const icon = button.querySelector('.ce-folder-icon');

  button.setAttribute('aria-expanded', 'false');
  content.classList.remove('is-open');
  icon.textContent = '▶';
  button.classList.remove('is-open');
}

function openCategory(button, { closeOthers = false } = {}) {
  if (closeOthers) {
    document.querySelectorAll('.ce-category-header.is-open').forEach((openButton) => {
      if (openButton !== button) {
        closeCategory(openButton);
      }
    });
  }

  const content = button.nextElementSibling;
  const icon = button.querySelector('.ce-folder-icon');

  button.setAttribute('aria-expanded', 'true');
  content.classList.add('is-open');
  icon.textContent = '▼';
  button.classList.add('is-open');
}

function renderCategories(categories) {
  const container = document.getElementById('ce-categories');
  const categoriesWithVideos = categories.filter((category) => category.videos.length > 0);

  if (categoriesWithVideos.length === 0) {
    container.innerHTML = '';
    setPanelState('empty');
    return;
  }

  setPanelState('content');
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
      >
        <div class="ce-category-content-inner">
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
                    decoding="async"
                  >
                </div>
                <h3 class="ce-video-title">${escapeHtml(video.custom_title)}</h3>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    </section>
  `).join('');

  container.querySelectorAll('.ce-category-header').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';

      if (expanded) {
        closeCategory(button);
        return;
      }

      openCategory(button, { closeOthers: isMobileLayout() });
    });
  });
}

async function loadCompanyEducation() {
  setPanelState('loading');

  try {
    const response = await fetch(`/api/ce?t=${Date.now()}`, { cache: 'no-cache' });
    const data = await response.json();

    if (!data.success) {
      setPanelState('error');
      return;
    }

    renderCategories(data.categories || []);
  } catch (error) {
    console.error('Error loading company education:', error);
    setPanelState('error');
  }
}

loadCompanyEducation();

function parseYouTubeUrlClient(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const patterns = [
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:[?&]v=)([a-zA-Z0-9_-]{11})/,
    /(?:embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        videoId: match[1],
        thumbnailUrl: `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
      };
    }
  }

  return null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(text, type, elementId = 'form-message') {
  const messageEl = document.getElementById(elementId);
  messageEl.textContent = text;
  messageEl.className = `form-message ${type}`;
  messageEl.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 4000);
  }
}

function updateYouTubePreview() {
  const input = document.getElementById('youtubeUrl');
  const preview = document.getElementById('youtube-preview');
  const img = document.getElementById('youtube-preview-img');
  const parsed = parseYouTubeUrlClient(input.value);

  if (parsed) {
    img.src = parsed.thumbnailUrl;
    preview.classList.remove('hidden');
  } else {
    img.removeAttribute('src');
    preview.classList.add('hidden');
  }
}

let draggedSortItem = null;
let draggedVideoItem = null;
let activeCategoryId = null;
let activeCategoryName = '';

function getSortListIds() {
  return Array.from(document.querySelectorAll('#ce-category-sort-list .ce-category-sort-item'))
    .map((item) => item.dataset.id);
}

async function saveCategoryOrder() {
  const categoryIds = getSortListIds();
  if (categoryIds.length === 0) return;

  try {
    const response = await fetch('/api/ce/categories/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryIds })
    });

    const data = await response.json();

    if (data.success) {
      showMessage('Category order saved', 'success', 'sort-message');
    } else {
      showMessage(data.error || 'Failed to save order', 'error', 'sort-message');
    }
  } catch (error) {
    console.error('Error saving category order:', error);
    showMessage('Error saving category order', 'error', 'sort-message');
  }
}

function initCategorySortDragDrop() {
  const list = document.getElementById('ce-category-sort-list');

  list.querySelectorAll('.ce-category-sort-item').forEach((item) => {
    item.addEventListener('dragstart', () => {
      draggedSortItem = item;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedSortItem = null;
      list.querySelectorAll('.ce-category-sort-item').forEach((el) => {
        el.classList.remove('drag-over');
      });
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedSortItem || draggedSortItem === item) return;

      item.classList.add('drag-over');
      const rect = item.getBoundingClientRect();
      const insertAfter = e.clientY > rect.top + rect.height / 2;

      if (insertAfter) {
        item.after(draggedSortItem);
      } else {
        item.before(draggedSortItem);
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      saveCategoryOrder();
    });

    item.addEventListener('dblclick', (e) => {
      e.preventDefault();
      openCategoryVideos(item.dataset.id, item.dataset.name);
    });
  });
}

function renderCategorySortList(categories) {
  const list = document.getElementById('ce-category-sort-list');

  if (!categories.length) {
    list.innerHTML = '<li class="ce-category-sort-empty">No categories yet.</li>';
    return;
  }

  list.innerHTML = categories.map((category) => `
    <li
      class="ce-category-sort-item${category.id === activeCategoryId ? ' is-selected' : ''}"
      draggable="true"
      data-id="${escapeHtml(category.id)}"
      data-name="${escapeHtml(category.name)}"
    >
      <span class="ce-category-sort-handle" aria-hidden="true">≡</span>
      <span class="ce-category-sort-name">${escapeHtml(category.name)}</span>
    </li>
  `).join('');

  initCategorySortDragDrop();
}

function getVideoSortListIds() {
  return Array.from(document.querySelectorAll('#ce-category-videos-list .ce-video-sort-item'))
    .map((item) => item.dataset.id);
}

async function saveVideoOrder() {
  if (!activeCategoryId) return;

  const videoIds = getVideoSortListIds();
  if (videoIds.length === 0) return;

  try {
    const response = await fetch(`/api/ce/categories/${activeCategoryId}/videos/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds })
    });

    const data = await response.json();

    if (data.success) {
      showMessage('Video order saved', 'success', 'video-message');
    } else {
      showMessage(data.error || 'Failed to save video order', 'error', 'video-message');
    }
  } catch (error) {
    console.error('Error saving video order:', error);
    showMessage('Error saving video order', 'error', 'video-message');
  }
}

function initVideoSortDragDrop() {
  const list = document.getElementById('ce-category-videos-list');

  list.querySelectorAll('.ce-video-sort-item').forEach((item) => {
    item.addEventListener('dragstart', () => {
      draggedVideoItem = item;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedVideoItem = null;
      list.querySelectorAll('.ce-video-sort-item').forEach((el) => {
        el.classList.remove('drag-over');
      });
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedVideoItem || draggedVideoItem === item) return;

      item.classList.add('drag-over');
      const rect = item.getBoundingClientRect();
      const insertAfter = e.clientY > rect.top + rect.height / 2;

      if (insertAfter) {
        item.after(draggedVideoItem);
      } else {
        item.before(draggedVideoItem);
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      saveVideoOrder();
    });
  });

  list.querySelectorAll('.ce-video-sort-delete').forEach((button) => {
    button.addEventListener('click', async (e) => {
      e.stopPropagation();

      const videoId = button.dataset.id;
      const title = button.dataset.title;

      if (!confirm(`Delete "${title}"?`)) {
        return;
      }

      button.disabled = true;

      try {
        const response = await fetch(`/api/ce/videos/${videoId}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
          showMessage('Video deleted', 'success', 'video-message');
          await openCategoryVideos(activeCategoryId, activeCategoryName);
        } else {
          showMessage(data.error || 'Failed to delete video', 'error', 'video-message');
          button.disabled = false;
        }
      } catch (error) {
        console.error('Error deleting video:', error);
        showMessage('Error deleting video', 'error', 'video-message');
        button.disabled = false;
      }
    });
  });
}

function renderCategoryVideos(videos) {
  const list = document.getElementById('ce-category-videos-list');

  if (!videos.length) {
    list.innerHTML = '<li class="ce-video-sort-empty">No videos in this category yet.</li>';
    return;
  }

  list.innerHTML = videos.map((video) => `
    <li
      class="ce-video-sort-item"
      draggable="true"
      data-id="${escapeHtml(video.id)}"
    >
      <span class="ce-category-sort-handle" aria-hidden="true">≡</span>
      <img
        class="ce-video-sort-thumb"
        src="${escapeHtml(video.thumbnail_url)}"
        alt=""
        loading="lazy"
      >
      <span class="ce-video-sort-title">${escapeHtml(video.custom_title)}</span>
      <button
        type="button"
        class="ce-video-sort-delete"
        data-id="${escapeHtml(video.id)}"
        data-title="${escapeHtml(video.custom_title)}"
        aria-label="Delete ${escapeHtml(video.custom_title)}"
      >Delete</button>
    </li>
  `).join('');

  initVideoSortDragDrop();
}

async function openCategoryVideos(categoryId, categoryName) {
  activeCategoryId = categoryId;
  activeCategoryName = categoryName;

  const panel = document.getElementById('ce-category-videos-panel');
  const title = document.getElementById('ce-category-videos-title');

  title.textContent = categoryName;
  panel.classList.remove('hidden');

  document.querySelectorAll('.ce-category-sort-item').forEach((item) => {
    item.classList.toggle('is-selected', item.dataset.id === categoryId);
  });

  try {
    const response = await fetch(`/api/ce/categories/${categoryId}/videos`);
    const data = await response.json();

    if (!data.success) {
      showMessage(data.error || 'Failed to load videos', 'error', 'video-message');
      return;
    }

    renderCategoryVideos(data.videos || []);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('Error loading category videos:', error);
    showMessage('Error loading videos', 'error', 'video-message');
  }
}

function closeCategoryVideosPanel() {
  activeCategoryId = null;
  activeCategoryName = '';
  document.getElementById('ce-category-videos-panel').classList.add('hidden');
  document.querySelectorAll('.ce-category-sort-item').forEach((item) => {
    item.classList.remove('is-selected');
  });
}

async function loadCategories() {
  try {
    const response = await fetch('/api/ce/categories');
    const data = await response.json();

    if (!data.success) return;

    const categories = data.categories || [];

    const datalist = document.getElementById('category-options');
    datalist.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category.name)}"></option>`)
      .join('');

    renderCategorySortList(categories);

    if (activeCategoryId) {
      const activeCategory = categories.find((category) => category.id === activeCategoryId);
      if (activeCategory) {
        activeCategoryName = activeCategory.name;
        document.getElementById('ce-category-videos-title').textContent = activeCategoryName;
      } else {
        closeCategoryVideosPanel();
      }
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

document.getElementById('youtubeUrl').addEventListener('input', updateYouTubePreview);
document.getElementById('youtubeUrl').addEventListener('paste', () => {
  setTimeout(updateYouTubePreview, 0);
});

document.getElementById('ce-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const youtubeUrl = form.youtubeUrl.value.trim();
  const category = form.category.value.trim();
  const title = form.title.value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';

  try {
    const response = await fetch('/api/ce/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeUrl, category, title })
    });

    const data = await response.json();

    if (data.success) {
      showMessage('Video added successfully!', 'success');
      form.reset();
      document.getElementById('youtube-preview').classList.add('hidden');
      await loadCategories();

      if (activeCategoryId && data.category && data.category.id === activeCategoryId) {
        await openCategoryVideos(activeCategoryId, activeCategoryName);
      }
    } else {
      showMessage(data.error || 'Failed to add video', 'error');
    }
  } catch (error) {
    console.error('Error adding video:', error);
    showMessage('Error adding video', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Video';
  }
});

document.getElementById('ce-category-videos-close').addEventListener('click', closeCategoryVideosPanel);

loadCategories();

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

function showMessage(text, type) {
  const messageEl = document.getElementById('form-message');
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

async function loadCategories() {
  try {
    const response = await fetch('/api/ce/categories');
    const data = await response.json();

    if (!data.success) return;

    const datalist = document.getElementById('category-options');
    datalist.innerHTML = data.categories
      .map((category) => `<option value="${escapeHtml(category.name)}"></option>`)
      .join('');
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

loadCategories();

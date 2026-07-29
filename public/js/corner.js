// Corner selfie wall — fill tiles that have uploaded year photos
document.addEventListener('DOMContentLoaded', async () => {
  const tiles = document.querySelectorAll('.selfie-tile[data-year]');
  if (!tiles.length) return;

  try {
    const response = await fetch('/api/corner/selfies');
    const data = await response.json();

    if (!data.success || !Array.isArray(data.selfies)) return;

    data.selfies.forEach((selfie) => {
      const year = Number(selfie.year);
      const url = selfie.image_url;
      if (!year || !url) return;

      const tile = document.querySelector(`.selfie-tile[data-year="${year}"]`);
      if (!tile || tile.querySelector('img')) return;

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Year ${year}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => {
        img.remove();
        tile.classList.remove('has-image');
      };

      tile.classList.add('has-image');
      tile.prepend(img);
    });
  } catch (error) {
    console.error('Error loading corner selfies:', error);
  }
});

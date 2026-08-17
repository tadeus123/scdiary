const fs = require('fs');
const path = require('path');

const EPISODES_PATH = path.join(__dirname, '../../public/edu-episodes.json');

function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function loadEpisodes() {
  try {
    const data = JSON.parse(fs.readFileSync(EPISODES_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading edu episodes:', error);
    return [];
  }
}

function sortedEpisodes(episodes = loadEpisodes()) {
  return [...episodes].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name));
}

function getEpisode(id) {
  return loadEpisodes().find((episode) => episode.id === id) || null;
}

function episodePath(id) {
  return `/edu/${encodeURIComponent(id)}`;
}

function episodeLinks(episode) {
  const links = Array.isArray(episode.links) && episode.links.length
    ? episode.links
    : (episode.url ? [{ url: episode.url }] : []);
  return links.map((link) => {
    let label = link.label;
    if (!label) {
      try {
        label = new URL(link.url).host.replace(/^www\./, '');
      } catch {
        label = link.url;
      }
    }
    return { url: link.url, label };
  });
}

function episodeSeo(episode) {
  const image = String(episode.image || '').split('?')[0];
  return {
    title: `${episode.name} — edu`,
    description: episode.bio || 'Conversation collected by Tade Mehl.',
    path: `/edu/${episode.id}`,
    noindex: true,
    includePersonSchema: false,
    ogImage: image || null,
  };
}

module.exports = {
  loadEpisodes,
  sortedEpisodes,
  getEpisode,
  episodePath,
  episodeLinks,
  episodeSeo,
};

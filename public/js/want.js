/**
 * Hardcoded requirements tree for /want.
 * Add children arrays to grow the tree downward.
 */
const WANT_TREE = {
  text: 'i want to build a humanoid that i want',
  owner: 'tade',
  children: [
    {
      text: 'around 8–11k€ consumer purchase price — buyable for me and for families',
      owner: 'tade',
      children: []
    },
    {
      text: 'i can teach it a skill by showing once, then it does it correctly without me',
      owner: 'tade',
      children: []
    },
    {
      text: 'it needs to be able to learn my way (when i show it a skill)',
      owner: 'tade',
      children: []
    },
    {
      text: 'it needs to be an extension of me as a creative person',
      owner: 'tade',
      children: []
    },
    {
      text: 'it needs to be able to do any labour work that a human can do (so any human motion)',
      owner: 'tade',
      children: []
    },
    {
      text: 'i want to manufacture it by myself (have my own hardware factory)',
      owner: 'tade',
      children: []
    }
  ]
};

function renderWantNode(node, depth = 0) {
  const li = document.createElement('li');
  li.className = `want-node want-depth-${Math.min(depth, 4)}`;

  const entry = document.createElement('div');
  entry.className = 'want-entry';

  const text = document.createElement('p');
  text.className = 'want-text';
  text.textContent = node.text;

  const owner = document.createElement('span');
  owner.className = 'want-owner';
  owner.textContent = node.owner;

  entry.appendChild(text);
  entry.appendChild(owner);
  li.appendChild(entry);

  if (node.children && node.children.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'want-children';
    node.children.forEach((child) => {
      ul.appendChild(renderWantNode(child, depth + 1));
    });
    li.appendChild(ul);
  }

  return li;
}

function fitWantTree(viewport, scaleEl) {
  scaleEl.style.transform = 'scale(1)';

  const availableWidth = viewport.clientWidth;
  const availableHeight = viewport.clientHeight;
  const naturalWidth = scaleEl.scrollWidth;
  const naturalHeight = scaleEl.scrollHeight;

  if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) {
    return;
  }

  const scale = Math.min(
    1,
    availableWidth / naturalWidth,
    availableHeight / naturalHeight
  );

  scaleEl.style.transform = `scale(${scale})`;
}

function initWantTree() {
  const root = document.getElementById('want-tree');
  if (!root) return;

  const scaleEl = document.createElement('div');
  scaleEl.className = 'want-tree-scale';

  const ul = document.createElement('ul');
  ul.className = 'want-tree-list';
  ul.appendChild(renderWantNode(WANT_TREE));
  scaleEl.appendChild(ul);
  root.appendChild(scaleEl);

  const refit = () => fitWantTree(root, scaleEl);
  refit();
  window.addEventListener('resize', refit);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refit);
  }
}

document.addEventListener('DOMContentLoaded', initWantTree);

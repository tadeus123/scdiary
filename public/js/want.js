/**
 * Hardcoded requirements tree for /want.
 * Add children arrays to grow the tree downward.
 */
const WANT_TREE = {
  text: 'i want to build a humanoid that i want',
  owner: 'tade',
  children: []
};

function renderWantNode(node) {
  const li = document.createElement('li');
  li.className = 'want-node';

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
      ul.appendChild(renderWantNode(child));
    });
    li.appendChild(ul);
  }

  return li;
}

function initWantTree() {
  const root = document.getElementById('want-tree');
  if (!root) return;

  const ul = document.createElement('ul');
  ul.className = 'want-tree-list';
  ul.appendChild(renderWantNode(WANT_TREE));
  root.appendChild(ul);
}

document.addEventListener('DOMContentLoaded', initWantTree);

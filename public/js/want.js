/**
 * Hardcoded requirements tree for /want.
 * Add children arrays to grow the tree downward.
 */
const WANT_TREE = {
  text: 'i want to build a humanoid that i want',
  owner: 'tade',
  children: [
    {
      text: 'it needs to cost max of 11k€',
      owner: 'tade',
      children: []
    },
    {
      text: 'it needs to be teachable with my own skills and can do them then',
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

const { marked } = require('marked');

function prepareDiaryContent(content) {
  return (content || '')
    .replace(/\r\n/g, '\n')
    .replace(/^(\s*↓\s*)$/gm, '\n$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderDiaryHtml(content) {
  return marked(prepareDiaryContent(content));
}

module.exports = {
  prepareDiaryContent,
  renderDiaryHtml
};

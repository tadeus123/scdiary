const { createMcp } = require('./v2/mcp');
const db = require('./v2/db');

module.exports = createMcp({ store: db });

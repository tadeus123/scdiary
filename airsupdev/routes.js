/**
 * Airsupdev routes. Mounted at /airsupdev.
 * Ops MCP only — no marketing site.
 */
const express = require('express');
const { createMcp } = require('./mcp');

const router = express.Router();
const mcp = createMcp();

router.all('/mcp', mcp.handleMcp);

module.exports = router;

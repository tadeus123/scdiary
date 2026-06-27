// Restore recovered cause graph into Supabase
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { saveCauseGraph } = require('../db/supabase');

async function main() {
  const graphPath = path.join(__dirname, '../../data/cause-graph-recovered.json');
  if (!fs.existsSync(graphPath)) {
    console.error('Missing', graphPath, '- run extract-cause-graph-level.js first');
    process.exit(1);
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const result = await saveCauseGraph(graph);

  if (!result.success) {
    console.error('Save failed:', result.error);
    process.exit(1);
  }

  console.log('Restored to Supabase cause_graph');
  console.log('Points:', result.graph.points.length);
  console.log('Edges:', result.graph.edges.length);
  console.log('Positions:', result.graph.positions ? Object.keys(result.graph.positions).length : 0);
  console.log('Updated at:', result.updated_at);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

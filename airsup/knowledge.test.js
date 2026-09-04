const assert = require('assert');
const { nameMatchScore, knowledgeDocument, PRIVATE_IDS } = require('./knowledge');

const anna = {
  display_name: 'Tade Mehl',
  endpoint_email: 'tm9sko@gmail.com',
  answers: {
    full_name: 'Anna Schmidt',
    help_others: 'poetry',
    sex_like: 'secret',
  },
};

assert.ok(nameMatchScore(anna, 'Anna') > 0);
assert.strictEqual(nameMatchScore(anna, 'zzzz') , 0);
assert.ok(!knowledgeDocument(anna).includes('secret'));
assert.ok(PRIVATE_IDS.has('sex_like'));
assert.ok(!knowledgeDocument(anna).toLowerCase().includes('tm9sko'));

console.log('knowledge tests passed');

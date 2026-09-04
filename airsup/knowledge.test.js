const assert = require('assert');
const { nameMatchScore, knowledgeDocument } = require('./knowledge');

const anna = {
  display_name: 'Tade Mehl',
  endpoint_email: 'tm9sko@gmail.com',
  answers: {
    full_name: 'Anna Schmidt',
    help_others: 'poetry',
    sex: 'listed sex answer',
  },
};

assert.ok(nameMatchScore(anna, 'Anna') > 0);
assert.strictEqual(nameMatchScore(anna, 'zzzz') , 0);
assert.ok(knowledgeDocument(anna).includes('listed sex answer'));
assert.ok(!knowledgeDocument(anna).toLowerCase().includes('tm9sko'));

console.log('knowledge tests passed');

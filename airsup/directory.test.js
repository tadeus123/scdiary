const assert = require('assert');
const { signedInBuyerName, publicDisplayName } = require('./directory');

assert.strictEqual(
  signedInBuyerName({ email: 'tademehl@gmail.com', display_name: 'Tade Mehl' }),
  'Tade Mehl'
);
assert.strictEqual(
  signedInBuyerName({ email: 'tademehl@gmail.com', display_name: 'Anna Schmidt' }),
  'tademehl@gmail.com'
);
assert.strictEqual(
  signedInBuyerName({ email: 'tm9sko@gmail.com', display_name: 'Anna Schmidt' }),
  'tm9sko@gmail.com'
);
assert.strictEqual(signedInBuyerName({ display_name: 'Ada' }), 'Ada');
assert.strictEqual(
  publicDisplayName({ answers: { full_name: 'Anna Schmidt' }, displayName: 'Tade Mehl' }),
  'Anna Schmidt'
);

console.log('directory tests passed');

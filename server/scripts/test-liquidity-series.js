const { buildLiquiditySeries, parseTypedMoney } = require('../utils/liquidity');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const euroOut = parseTypedMoney('-25€');
assert(euroOut && euroOut.amount === 25 && euroOut.direction === 'out' && euroOut.currency === 'EUR', `euro out ${JSON.stringify(euroOut)}`);
const dollarIn = parseTypedMoney('$23');
assert(dollarIn && dollarIn.amount === 23 && dollarIn.direction === 'in' && dollarIn.currency === 'USD', `dollar in ${JSON.stringify(dollarIn)}`);
const dollarOut = parseTypedMoney('-$23');
assert(dollarOut && dollarOut.amount === 23 && dollarOut.direction === 'out' && dollarOut.currency === 'USD', `dollar out ${JSON.stringify(dollarOut)}`);

const start = '2026-08-29T12:00:00.000+02:00';

const empty = buildLiquiditySeries({
  startingBank: -499.85,
  startingAt: start,
  entries: [],
  liabilities: []
});
assert(empty.current === -499.85, `empty current ${empty.current}`);
assert(empty.points[0].balance === -499.85, `start point ${empty.points[0].balance}`);

const withBill = buildLiquiditySeries({
  startingBank: -499.85,
  startingAt: start,
  entries: [],
  liabilities: [{
    id: 'lb-opa',
    name: 'Gift for Opa',
    amount: 250,
    currency: 'EUR',
    created_at: start,
    status: 'open'
  }]
});
assert(withBill.current === -749.85, `open bill current ${withBill.current}`);
assert(withBill.open === 250, `open ${withBill.open}`);

const paid = buildLiquiditySeries({
  startingBank: -499.85,
  startingAt: start,
  entries: [{
    id: 'lq-pay',
    timestamp: '2026-09-02T12:00:00.000+02:00',
    amount: 250,
    currency: 'EUR',
    direction: 'out',
    status: 'approved',
    account: 'bank',
    liability_id: 'lb-opa',
    note: 'Gift for Opa'
  }],
  liabilities: [{
    id: 'lb-opa',
    name: 'Gift for Opa',
    amount: 250,
    currency: 'EUR',
    created_at: start,
    status: 'paid',
    paid_at: '2026-09-02T12:00:00.000+02:00'
  }]
});
assert(paid.bank === -749.85, `paid bank ${paid.bank}`);
assert(paid.open === 0, `paid open ${paid.open}`);
assert(paid.current === -749.85, `paid current ${paid.current}`);

const pending = buildLiquiditySeries({
  startingBank: -499.85,
  startingAt: start,
  entries: [{
    id: 'lq-gas',
    timestamp: '2026-09-01T12:00:00.000+02:00',
    amount: 24,
    currency: 'EUR',
    direction: 'out',
    status: 'pending',
    account: 'bank',
    note: 'GasAG'
  }],
  liabilities: []
});
assert(pending.current === -499.85, `pending ignored ${pending.current}`);

const now = buildLiquiditySeries({
  startingBank: -499.85,
  startingAt: start,
  entries: [
    { id: '1', timestamp: '2026-08-31T12:00:00+02:00', amount: 1280, currency: 'EUR', direction: 'in', status: 'approved', account: 'bank' },
    { id: '2', timestamp: '2026-08-31T12:00:00+02:00', amount: 354.38, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '3', timestamp: '2026-08-31T12:00:00+02:00', amount: 130.75, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '4', timestamp: '2026-08-31T12:00:00+02:00', amount: 47.16, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '5', timestamp: '2026-08-31T12:00:00+02:00', amount: 83.85, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '6', timestamp: '2026-09-01T12:00:00+02:00', amount: 300, currency: 'EUR', direction: 'in', status: 'approved', account: 'bank' },
    { id: '7', timestamp: '2026-09-01T12:00:00+02:00', amount: 279, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '8', timestamp: '2026-09-01T12:00:00+02:00', amount: 13.22, currency: 'EUR', direction: 'in', status: 'approved', account: 'bank' },
    { id: '9', timestamp: '2026-09-01T12:00:00+02:00', amount: 35.24, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '10', timestamp: '2026-09-01T12:00:00+02:00', amount: 25.32, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '11', timestamp: '2026-09-01T12:00:00+02:00', amount: 32.01, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '12', timestamp: '2026-09-02T12:00:00+02:00', amount: 30, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '13', timestamp: '2026-09-02T12:00:00+02:00', amount: 90, currency: 'EUR', direction: 'out', status: 'approved', account: 'bank' },
    { id: '14', timestamp: '2026-09-02T12:00:00+02:00', amount: 26, currency: 'EUR', direction: 'in', status: 'approved', account: 'cash' },
    { id: '15', timestamp: '2026-09-02T12:00:00+02:00', amount: 6.3, currency: 'EUR', direction: 'out', status: 'approved', account: 'cash' },
    { id: '16', timestamp: '2026-09-01T12:00:00+02:00', amount: 24, currency: 'EUR', direction: 'out', status: 'pending', account: 'bank' }
  ],
  liabilities: [
    { id: 'a', name: 'Gift for Opa', amount: 250, currency: 'EUR', created_at: start, status: 'open' },
    { id: 'b', name: 'Mama for flight to China', amount: 300, currency: 'EUR', created_at: start, status: 'open' },
    { id: 'c', name: 'Opening Kleingewerbe costs DD', amount: 60, currency: 'EUR', created_at: '2026-08-30T12:00:00+02:00', status: 'open' }
  ]
});
assert(now.bank === -14.34, `bank ${now.bank}`);
assert(now.cash === 19.7, `cash ${now.cash}`);
assert(now.open === 610, `open ${now.open}`);
assert(now.current === -604.64, `current ${now.current}`);
assert(now.points[0].balance === -499.85, `graph start ${now.points[0].balance}`);

console.log('liquidity series ok');

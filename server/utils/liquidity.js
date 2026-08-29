function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function normalizeMoneyString(value) {
  let s = String(value).trim().replace(/\s/g, '').replace(/[−–—]/g, '-');
  if (!s) return '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(/,/g, '.');
  }
  return s;
}

function formatSignedAmount(amount, direction) {
  const formatted = roundMoney(Math.abs(amount)).toFixed(2);
  return direction === 'out' ? `-${formatted}` : formatted;
}

function parseSignedAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(normalizeMoneyString(value));
  if (!Number.isFinite(n) || n === 0) return null;
  const amount = roundMoney(Math.abs(n));
  if (!(amount > 0)) return null;
  return { amount, direction: n < 0 ? 'out' : 'in' };
}

function parsePositiveAmount(value) {
  const parsed = parseSignedAmount(value);
  return parsed ? parsed.amount : null;
}

function normalizeCurrency(value) {
  const currency = String(value || 'USD').trim().toUpperCase();
  return currency === 'EUR' ? 'EUR' : currency === 'USD' ? 'USD' : null;
}

function normalizeDirection(value) {
  const direction = String(value || '').trim().toLowerCase();
  return direction === 'in' || direction === 'out' ? direction : null;
}

function signedUsd(amount, direction, rate = 1) {
  const usd = roundMoney(toNumber(amount) * toNumber(rate, 1));
  return direction === 'out' ? -Math.abs(usd) : Math.abs(usd);
}

function toDate(value) {
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(value) {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function utcDateFromKey(key) {
  return new Date(`${key}T00:00:00.000Z`);
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function monthlyOccurrences(dayOfMonth, startDate, endDate) {
  const requestedDay = Math.min(31, Math.max(1, Math.round(toNumber(dayOfMonth, 1))));
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end || end < start) return [];

  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const startDay = Math.min(requestedDay, lastDayOfMonth(year, month));
  if (start.getUTCDate() > startDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const dates = [];
  while (true) {
    const day = Math.min(requestedDay, lastDayOfMonth(year, month));
    const occurrence = new Date(Date.UTC(year, month, day));
    if (occurrence > end) break;
    if (occurrence >= start) dates.push(occurrence);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return dates;
}

const MS_DAY = 24 * 60 * 60 * 1000;
const MIN_HORIZON_DAYS = 365;

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * MS_DAY);
}

function horizonEndAt(startDay, nowAt, lastEventAt) {
  const candidates = [
    addUtcDays(startDay, MIN_HORIZON_DAYS).getTime(),
    nowAt.getTime()
  ];
  if (lastEventAt) candidates.push(lastEventAt.getTime());
  return new Date(Math.max(...candidates));
}

function rateForDate(currency, key, ratesByDate, latestRate) {
  if (currency !== 'EUR') return 1;
  const mapped = ratesByDate && key ? ratesByDate[key] : null;
  if (Number.isFinite(Number(mapped)) && Number(mapped) > 0) return Number(mapped);
  return Number.isFinite(Number(latestRate)) && Number(latestRate) > 0 ? Number(latestRate) : 1;
}

function liabilitiesTotalUsd(liabilities = []) {
  const total = liabilities.reduce((sum, item) => sum + Math.abs(toNumber(item.amount_usd)), 0);
  return roundMoney(-total);
}

function buildLiquiditySeries({ settings, entries = [], recurring = [], liabilities = [], ratesByDate = {}, latestRate = 1, now = new Date() }) {
  const startingBalance = liabilitiesTotalUsd(liabilities);
  const startAt = toDate(settings?.starting_at) || now;
  const nowAt = toDate(now) || new Date();
  const startMs = startAt.getTime();
  const startDay = utcDateFromKey(dateKey(startAt) || dateKey(nowAt));

  const events = [];
  let lastEventAt = null;

  for (const entry of entries) {
    const at = toDate(entry.timestamp);
    if (!at || at.getTime() < startMs) continue;
    events.push({
      at,
      delta: roundMoney(entry.amount_usd),
      kind: 'entry',
      id: entry.id,
      note: entry.note || '',
      direction: entry.direction,
      amount: toNumber(entry.amount),
      currency: entry.currency,
      fx_rate: toNumber(entry.fx_rate, 1)
    });
    if (!lastEventAt || at > lastEventAt) lastEventAt = at;
  }

  const endAt = horizonEndAt(startDay, nowAt, lastEventAt);

  for (const item of recurring) {
    const itemStart = toDate(item.start_date) || startDay;
    const from = itemStart > startDay ? itemStart : startDay;
    const itemEnd = item.end_date ? toDate(item.end_date) : null;
    const to = itemEnd && itemEnd < endAt ? itemEnd : endAt;
    const occurrences = monthlyOccurrences(item.day_of_month, from, to);

    for (const atOriginal of occurrences) {
      let at = atOriginal;
      if (at.getTime() < startMs) {
        if (dateKey(at) === dateKey(startAt)) {
          at = startAt;
        } else {
          continue;
        }
      }
      if (at > endAt) continue;
      const key = dateKey(at);
      const rate = rateForDate(item.currency, key, ratesByDate, latestRate);
      events.push({
        at,
        delta: signedUsd(item.amount, item.direction, rate),
        kind: 'monthly',
        id: item.id,
        note: item.name || '',
        direction: item.direction,
        amount: toNumber(item.amount),
        currency: item.currency,
        fx_rate: rate
      });
      if (!lastEventAt || at > lastEventAt) lastEventAt = at;
    }
  }

  events.sort((a, b) => {
    const diff = a.at.getTime() - b.at.getTime();
    if (diff !== 0) return diff;
    if (a.kind === b.kind) return String(a.id).localeCompare(String(b.id));
    return a.kind === 'monthly' ? -1 : 1;
  });

  const points = [{
    at: startAt.toISOString(),
    balance: startingBalance,
    delta: 0,
    kind: 'start',
    note: 'start',
    projected: false
  }];

  let balance = startingBalance;
  let current = startingBalance;
  let nowInserted = Math.abs(nowAt.getTime() - startAt.getTime()) < 60 * 60 * 1000;

  function pushNowIfNeeded(beforeTime) {
    if (nowInserted || nowAt.getTime() >= beforeTime.getTime()) return;
    if (nowAt.getTime() <= startMs) return;
    points.push({
      at: nowAt.toISOString(),
      balance,
      delta: 0,
      kind: 'now',
      note: 'now',
      projected: false
    });
    current = balance;
    nowInserted = true;
  }

  for (const event of events) {
    pushNowIfNeeded(event.at);
    balance = roundMoney(balance + event.delta);
    const projected = event.at.getTime() > nowAt.getTime();
    points.push({
      at: event.at.toISOString(),
      balance,
      delta: event.delta,
      kind: event.kind,
      note: event.note,
      direction: event.direction,
      amount: event.amount,
      currency: event.currency,
      fx_rate: event.fx_rate,
      projected
    });
    if (!projected) current = balance;
  }

  if (!nowInserted && nowAt.getTime() > startMs && nowAt.getTime() < endAt.getTime()) {
    points.push({
      at: nowAt.toISOString(),
      balance,
      delta: 0,
      kind: 'now',
      note: 'now',
      projected: false
    });
    current = balance;
    nowInserted = true;
  }

  const lastAt = toDate(points[points.length - 1].at);
  if (!lastAt || lastAt.getTime() < endAt.getTime()) {
    points.push({
      at: endAt.toISOString(),
      balance,
      delta: 0,
      kind: 'horizon',
      note: 'horizon',
      projected: true
    });
  }

  return {
    starting_balance_usd: startingBalance,
    starting_at: startAt.toISOString(),
    current,
    horizon_at: endAt.toISOString(),
    now_at: nowAt.toISOString(),
    points
  };
}

module.exports = {
  toNumber,
  roundMoney,
  normalizeMoneyString,
  formatSignedAmount,
  parseSignedAmount,
  parsePositiveAmount,
  normalizeCurrency,
  normalizeDirection,
  signedUsd,
  dateKey,
  utcDateFromKey,
  monthlyOccurrences,
  horizonEndAt,
  liabilitiesTotalUsd,
  buildLiquiditySeries
};

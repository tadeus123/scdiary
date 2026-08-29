function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function parsePositiveAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMoney(n);
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

function rateForDate(currency, key, ratesByDate, latestRate) {
  if (currency !== 'EUR') return 1;
  const mapped = ratesByDate && key ? ratesByDate[key] : null;
  if (Number.isFinite(Number(mapped)) && Number(mapped) > 0) return Number(mapped);
  return Number.isFinite(Number(latestRate)) && Number(latestRate) > 0 ? Number(latestRate) : 1;
}

function buildLiquiditySeries({ settings, entries = [], recurring = [], ratesByDate = {}, latestRate = 1, now = new Date() }) {
  const startingBalance = roundMoney(settings?.starting_balance_usd ?? -2.5);
  const startAt = toDate(settings?.starting_at) || now;
  const endAt = toDate(now) || new Date();
  const startMs = startAt.getTime();
  const startDay = utcDateFromKey(dateKey(startAt) || dateKey(endAt));

  const events = [];

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
  }

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
    note: 'start'
  }];

  let balance = startingBalance;
  for (const event of events) {
    balance = roundMoney(balance + event.delta);
    points.push({
      at: event.at.toISOString(),
      balance,
      delta: event.delta,
      kind: event.kind,
      note: event.note,
      direction: event.direction,
      amount: event.amount,
      currency: event.currency,
      fx_rate: event.fx_rate
    });
  }

  const lastAt = toDate(points[points.length - 1].at);
  if (!lastAt || lastAt.getTime() < endAt.getTime()) {
    points.push({
      at: endAt.toISOString(),
      balance,
      delta: 0,
      kind: 'now',
      note: 'now'
    });
  }

  return {
    starting_balance_usd: startingBalance,
    starting_at: startAt.toISOString(),
    current: balance,
    points
  };
}

module.exports = {
  toNumber,
  roundMoney,
  parsePositiveAmount,
  normalizeCurrency,
  normalizeDirection,
  signedUsd,
  dateKey,
  utcDateFromKey,
  monthlyOccurrences,
  buildLiquiditySeries
};

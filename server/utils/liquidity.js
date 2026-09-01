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

function signedAmount(amount, direction) {
  const value = roundMoney(Math.abs(toNumber(amount)));
  return direction === 'out' ? -value : value;
}

function signedUsd(amount, direction, rate = 1) {
  return signedAmount(toNumber(amount) * toNumber(rate, 1), direction);
}

function liveEur(amount, currency, direction, eurUsdRate = 1) {
  const native = Math.abs(toNumber(amount));
  const rate = toNumber(eurUsdRate, 1);
  const eur = String(currency || 'EUR').trim().toUpperCase() === 'USD' && rate > 0
    ? roundMoney(native / rate)
    : roundMoney(native);
  return signedAmount(eur, direction);
}

function withLiveEur(item, eurUsdRate, direction = item.direction || 'out') {
  const amount_eur = liveEur(item.amount, item.currency, direction, eurUsdRate);
  return {
    ...item,
    fx_rate: toNumber(eurUsdRate, 1),
    amount_eur,
    amount_usd: amount_eur
  };
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

function monthlyLogId(recurringId, occurrenceKey) {
  return `lq-m-${recurringId}-${occurrenceKey}`;
}

function dueMonthlyLogs(recurring = [], now = new Date()) {
  const todayKey = dateKey(now);
  const today = utcDateFromKey(todayKey);
  if (!today) return [];

  const logs = [];
  for (const item of recurring) {
    const startKey = String(item.start_date || '').slice(0, 10);
    const from = utcDateFromKey(startKey);
    if (!from) continue;

    let to = today;
    const endKey = String(item.end_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(endKey)) {
      const end = utcDateFromKey(endKey);
      if (end && end < to) to = end;
    }

    for (const at of monthlyOccurrences(item.day_of_month, from, to)) {
      const occurrence_date = dateKey(at);
      logs.push({
        id: monthlyLogId(item.id, occurrence_date),
        recurring_id: item.id,
        occurrence_date,
        at,
        item
      });
    }
  }
  return logs;
}

function monthlyFlowEur(recurring = [], latestRate = 1) {
  let incoming = 0;
  let outgoing = 0;
  for (const item of recurring) {
    const eur = Math.abs(liveEur(item.amount, item.currency, item.direction, latestRate));
    if (item.direction === 'in') incoming = roundMoney(incoming + eur);
    else outgoing = roundMoney(outgoing + eur);
  }
  return {
    incoming,
    outgoing,
    combined: roundMoney(incoming + outgoing)
  };
}

function cashRunwayMonths(currentEur, recurring = [], latestRate = 1) {
  const { combined } = monthlyFlowEur(recurring, latestRate);
  if (!(combined > 0)) return null;
  const cash = toNumber(currentEur);
  if (cash <= 0) return 0;
  return Math.round((cash / combined) * 10) / 10;
}

function formatCashRunway(months) {
  if (months === null || !Number.isFinite(months)) return 'cash runway: —';
  const label = months === 1 ? 'month' : 'months';
  const value = Number.isInteger(months) ? String(months) : months.toFixed(1);
  return `cash runway: ${value} ${label}`;
}

function liabilitiesOpenEur(liabilities = [], eurUsdRate = 1) {
  const total = liabilities.reduce((sum, item) => {
    return sum + Math.abs(liveEur(item.amount, item.currency, 'out', eurUsdRate));
  }, 0);
  return roundMoney(total);
}

function isTapeEntry(entry) {
  const id = String(entry?.id || '');
  return !id.startsWith('lq-lb-') && !id.startsWith('lq-drop-');
}

function liabilityReservationEntryId(liabilityId) {
  return `lq-lb-${liabilityId}`;
}

function liabilityDropEntryId(liabilityId) {
  return `lq-drop-${liabilityId}`;
}

function reservationEntryFromLiability(liability, timestamp) {
  const fx_rate = toNumber(liability.fx_rate, 1);
  const amount = toNumber(liability.amount);
  return {
    id: liability.entry_id || liabilityReservationEntryId(liability.id),
    timestamp,
    amount,
    currency: liability.currency,
    fx_rate,
    amount_usd: signedUsd(amount, 'out', fx_rate),
    direction: 'out',
    note: liability.name || ''
  };
}

function dropEntryFromLiability(liability, timestamp) {
  const fx_rate = toNumber(liability.fx_rate, 1);
  const amount = toNumber(liability.amount);
  const name = String(liability.name || '').trim();
  return {
    id: liabilityDropEntryId(liability.id),
    timestamp,
    amount,
    currency: liability.currency,
    fx_rate,
    amount_usd: signedUsd(amount, 'in', fx_rate),
    direction: 'in',
    note: name ? `dropped: ${name}` : 'dropped'
  };
}

function buildLiquiditySeries({ entries = [], liabilities = [], eurUsdRate = 1 }) {
  const startingBalance = 0;
  const events = [];

  for (const entry of entries) {
    if (!isTapeEntry(entry)) continue;
    const at = toDate(entry.timestamp);
    if (!at) continue;
    events.push({
      at,
      delta: liveEur(entry.amount, entry.currency, entry.direction, eurUsdRate),
      kind: 'entry',
      id: entry.id,
      note: entry.note || '',
      direction: entry.direction,
      amount: toNumber(entry.amount),
      currency: entry.currency,
      fx_rate: toNumber(eurUsdRate, 1)
    });
  }

  events.sort((a, b) => {
    const diff = a.at.getTime() - b.at.getTime();
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });

  const points = [];
  let balance = startingBalance;
  for (const event of events) {
    balance = roundMoney(balance + event.delta);
    points.push({
      at: event.at.toISOString(),
      balance,
      delta: event.delta,
      kind: event.kind,
      id: event.id,
      note: event.note,
      direction: event.direction,
      amount: event.amount,
      currency: event.currency,
      fx_rate: event.fx_rate
    });
  }

  const cash = balance;
  const open = liabilitiesOpenEur(liabilities, eurUsdRate);
  return {
    starting_balance_eur: startingBalance,
    starting_balance_usd: startingBalance,
    cash,
    open,
    current: roundMoney(cash - open),
    eur_usd_rate: toNumber(eurUsdRate, 1),
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
  signedAmount,
  signedUsd,
  liveEur,
  withLiveEur,
  dateKey,
  utcDateFromKey,
  monthlyOccurrences,
  monthlyLogId,
  dueMonthlyLogs,
  monthlyFlowEur,
  cashRunwayMonths,
  formatCashRunway,
  horizonEndAt,
  liabilitiesOpenEur,
  isTapeEntry,
  liabilityReservationEntryId,
  liabilityDropEntryId,
  reservationEntryFromLiability,
  dropEntryFromLiability,
  buildLiquiditySeries
};

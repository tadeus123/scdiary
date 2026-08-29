const FRANKFURTER = 'https://api.frankfurter.app';

const latestCache = { rate: null, fetchedAt: 0 };
const dateCache = new Map();
const LATEST_TTL_MS = 60 * 60 * 1000;

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return todayUtcDate();
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return todayUtcDate();
  return text;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FX request failed (${response.status})`);
  }
  return response.json();
}

function readUsdRate(payload) {
  const rate = Number(payload?.rates?.USD);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('FX rate missing from response');
  }
  return rate;
}

async function getLatestEurUsdRate() {
  const now = Date.now();
  if (latestCache.rate && now - latestCache.fetchedAt < LATEST_TTL_MS) {
    return latestCache.rate;
  }

  const payload = await fetchJson(`${FRANKFURTER}/latest?from=EUR&to=USD`);
  const rate = readUsdRate(payload);
  latestCache.rate = rate;
  latestCache.fetchedAt = now;
  return rate;
}

async function getEurUsdRate(dateValue) {
  const date = normalizeDate(dateValue);
  if (date >= todayUtcDate()) {
    return getLatestEurUsdRate();
  }

  if (dateCache.has(date)) {
    return dateCache.get(date);
  }

  const payload = await fetchJson(`${FRANKFURTER}/${date}?from=EUR&to=USD`);
  const rate = readUsdRate(payload);
  dateCache.set(date, rate);
  return rate;
}

function fillDailyRates(startDate, endDate, ratesByDate, fallbackRate) {
  const filled = {};
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let last = fallbackRate;

  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
    const key = new Date(time).toISOString().slice(0, 10);
    if (Number.isFinite(Number(ratesByDate[key]))) {
      last = Number(ratesByDate[key]);
    }
    if (Number.isFinite(last)) {
      filled[key] = last;
    }
  }

  return filled;
}

async function getEurUsdRates(startValue, endValue) {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue);
  const from = startDate <= endDate ? startDate : endDate;
  const to = startDate <= endDate ? endDate : startDate;
  const latest = await getLatestEurUsdRate();

  if (from >= todayUtcDate()) {
    return fillDailyRates(from, to, {}, latest);
  }

  const rangeEnd = to < todayUtcDate() ? to : todayUtcDate();
  const payload = await fetchJson(`${FRANKFURTER}/${from}..${rangeEnd}?from=EUR&to=USD`);
  const ratesByDate = {};

  for (const [day, currencies] of Object.entries(payload.rates || {})) {
    const rate = Number(currencies?.USD);
    if (Number.isFinite(rate) && rate > 0) {
      ratesByDate[day] = rate;
    }
  }

  return fillDailyRates(from, to, ratesByDate, latest);
}

module.exports = {
  getLatestEurUsdRate,
  getEurUsdRate,
  getEurUsdRates
};

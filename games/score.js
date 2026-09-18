const ROUND_SECONDS = 45;

function computeWpm(correctChars, elapsedMs) {
  const chars = Number(correctChars) || 0;
  const ms = Number(elapsedMs) || 0;
  if (chars <= 0 || ms <= 0) return 0;
  return (chars / 5) / (ms / 60000);
}

function computeScore(wpm, mistakes) {
  const speed = Math.round((Number(wpm) || 0) * 10);
  const penalty = (Number(mistakes) || 0) * 20;
  return Math.max(0, speed - penalty);
}

function isPlausibleRun({ wpm, mistakes, score }) {
  const w = Number(wpm);
  const m = Number(mistakes);
  const s = Number(score);
  if (!Number.isFinite(w) || !Number.isFinite(m) || !Number.isFinite(s)) return false;
  if (w < 0 || w > 400) return false;
  if (m < 0 || m > 5000 || !Number.isInteger(m)) return false;
  if (s < 0 || s > 5000 || !Number.isInteger(s)) return false;
  return s === computeScore(w, m);
}

module.exports = {
  ROUND_SECONDS,
  computeWpm,
  computeScore,
  isPlausibleRun,
};

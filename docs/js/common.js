// Common helpers for Fund Flow Dashboard (static GitHub Pages)

export function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return sign + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function parseISODate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function yyyymm(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function clampText(s, max=160) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max-1) + "…" : s;
}

export function uniq(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")));
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function debounce(fn, ms=250) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function safeNumber(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

import { parseISODate, safeNumber } from './common.js';

const DATA_URL = './data/fund_flow.json';

let cached = null;

export async function loadFundFlow() {
  if (cached) return cached;
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL} (${res.status})`);
  const payload = await res.json();

  // Normalize rows
  const rows = (payload.rows || []).map(r => {
    const dateObj = parseISODate(r.Date);
    const fundsFlow = safeNumber(r["Funds Flow"]);
    const signed = safeNumber(r.amount_signed);
    return {
      ...r,
      _date: dateObj,
      _fundsFlow: fundsFlow,
      _signed: signed,
      _direction: r.direction || (r.Ref === "Dr" ? "outflow" : (r.Ref === "Cr" ? "inflow" : null)),
      _purpose: r.Purpose || null,
      _bank: r.Bank || null,
      _desc: r.Description || r["Description.1"] || "",
    };
  }).filter(r => r._date); // keep rows with valid dates

  cached = { meta: payload.meta || {}, rows };
  return cached;
}

export function applyFilters(rows, filters) {
  const {
    dateFrom, dateTo, direction, purpose, bank, search
  } = filters;

  const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
  const q = search ? String(search).toLowerCase().trim() : "";

  return rows.filter(r => {
    if (from && r._date < from) return false;
    if (to && r._date > to) return false;
    if (direction && direction !== "all" && r._direction !== direction) return false;
    if (purpose && purpose !== "all" && r._purpose !== purpose) return false;
    if (bank && bank !== "all" && r._bank !== bank) return false;
    if (q) {
      const hay = (String(r._desc) + " " + String(r._purpose || "") + " " + String(r._bank || "") + " " + String(r["Instructed By"] || "") + " " + String(r["Transferred to"] || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeKPIs(rows) {
  let inflow = 0, outflow = 0, net = 0;
  for (const r of rows) {
    const s = r._signed;
    if (s === null || s === undefined || Number.isNaN(s)) continue;
    net += s;
    if (s >= 0) inflow += s;
    else outflow += Math.abs(s);
  }
  return {
    inflow, outflow, net,
    txCount: rows.length,
  };
}

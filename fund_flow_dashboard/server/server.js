
import express from 'express';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const app = express();

// ---------------- Configuration ----------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 5177;
const REPORT_PASSWORD = process.env.REPORT_PASSWORD || 'ChangeMe123!';

// Resolve project dirs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const excelPath = process.env.EXCEL_PATH || path.join(projectRoot, 'data', 'Accounts flow.xlsx');

// ---------------- Excel parsing + caching ----------------
let cache = {
  mtimeMs: 0,
  parsedAtIso: null,
  rows: [],
  columns: [],
  dims: null,
};

function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // Remove commas and currency symbols
  const cleaned = s.replace(/[,₹₨$]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  // Excel date serial sometimes arrives as number
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y && d.m && d.d) {
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(v).trim();
  // Try Date parse
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  // Try dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}

function normalizeRow(r) {
  const row = { ...r };

  // Standardize key fields if present
  row.__date = toIsoDate(row['Date'] ?? row['date']);
  row.__ref = (row['Ref'] ?? row['ref'] ?? '').toString().trim();
  row.__bank = (row['Bank'] ?? row['bank'] ?? '').toString().trim();
  row.__purpose = (row['Purpose'] ?? row['purpose'] ?? '').toString().trim();
  row.__cat = (row['Cat'] ?? row['cat'] ?? '').toString().trim();
  row.__co = (row['Co'] ?? row['co'] ?? '').toString().trim();

  const ff = toNumber(row['Funds Flow'] ?? row['FundsFlow'] ?? row['funds flow']);
  const bal = toNumber(row['Balance'] ?? row['balance']);
  row.__funds_flow = ff;
  row.__balance = bal;

  // Direction
  const ref = row.__ref.toLowerCase();
  if (ref === 'cr') row.__direction = 'inflow';
  else if (ref === 'dr') row.__direction = 'outflow';
  else row.__direction = 'unknown';

  // Month bucket
  row.__month = row.__date ? row.__date.slice(0, 7) : null;

  return row;
}

function computeDimensions(rows) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    banks: uniq(rows.map(r => r.__bank)),
    purposes: uniq(rows.map(r => r.__purpose)),
    cats: uniq(rows.map(r => r.__cat)),
    companies: uniq(rows.map(r => r.__co)),
    refs: uniq(rows.map(r => r.__ref)),
  };
}

function filterRows(rows, q) {
  const from = q.from ? String(q.from) : null;
  const to = q.to ? String(q.to) : null;
  const purpose = q.purpose ? String(q.purpose) : null;
  const bank = q.bank ? String(q.bank) : null;
  const ref = q.ref ? String(q.ref) : null;
  const cat = q.cat ? String(q.cat) : null;
  const co = q.co ? String(q.co) : null;
  const search = q.search ? String(q.search).toLowerCase() : null;

  return rows.filter(r => {
    if (from && (!r.__date || r.__date < from)) return false;
    if (to && (!r.__date || r.__date > to)) return false;
    if (purpose && r.__purpose !== purpose) return false;
    if (bank && r.__bank !== bank) return false;
    if (ref && r.__ref !== ref) return false;
    if (cat && r.__cat !== cat) return false;
    if (co && r.__co !== co) return false;
    if (search) {
      const blob = JSON.stringify({
        sn: r['SN'],
        date: r.__date,
        desc: r['Description'],
        purpose: r.__purpose,
        bank: r.__bank,
        cat: r.__cat,
        co: r.__co,
        instructedBy: r['Instructed By'],
        transferredTo: r['Transferred to']
      }).toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

function aggregate(rows) {
  let inflow = 0;
  let outflow = 0;
  let inflowCount = 0;
  let outflowCount = 0;

  const monthMap = new Map(); // yyyy-mm -> {inflow,outflow,net}
  const purposeOut = new Map(); // purpose -> outflow sum
  const purposeIn = new Map();  // purpose -> inflow sum

  let lastBalance = null;
  let firstDate = null;
  let lastDate = null;

  for (const r of rows) {
    const amt = r.__funds_flow;
    if (amt != null) {
      if (r.__direction === 'inflow') {
        inflow += amt;
        inflowCount += 1;
        if (r.__purpose) purposeIn.set(r.__purpose, (purposeIn.get(r.__purpose) || 0) + amt);
      } else if (r.__direction === 'outflow') {
        outflow += amt;
        outflowCount += 1;
        if (r.__purpose) purposeOut.set(r.__purpose, (purposeOut.get(r.__purpose) || 0) + amt);
      }
    }

    if (r.__month) {
      const m = r.__month;
      const entry = monthMap.get(m) || { month: m, inflow: 0, outflow: 0, net: 0 };
      if (amt != null) {
        if (r.__direction === 'inflow') entry.inflow += amt;
        else if (r.__direction === 'outflow') entry.outflow += amt;
      }
      entry.net = entry.inflow - entry.outflow;
      monthMap.set(m, entry);
    }

    if (r.__balance != null) lastBalance = r.__balance;

    if (r.__date) {
      if (!firstDate || r.__date < firstDate) firstDate = r.__date;
      if (!lastDate || r.__date > lastDate) lastDate = r.__date;
    }
  }

  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const topPurposesOut = [...purposeOut.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([purpose, total]) => ({ purpose, total }));

  const topPurposesIn = [...purposeIn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([purpose, total]) => ({ purpose, total }));

  return {
    totals: {
      inflow,
      outflow,
      net: inflow - outflow,
      inflowCount,
      outflowCount,
      rows: rows.length,
      firstDate,
      lastDate,
      lastBalance
    },
    months,
    topPurposesOut,
    topPurposesIn
  };
}

function loadExcelIfChanged() {
  const st = fs.statSync(excelPath);
  if (cache.mtimeMs && st.mtimeMs === cache.mtimeMs && cache.rows.length) return cache;

  const wb = XLSX.readFile(excelPath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Convert to JSON; keep nulls for missing cells
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

  // Normalize and drop fully empty/unnamed columns at the API level later (frontend can still show all)
  const rows = raw.map(normalizeRow);
  const columns = raw.length ? Object.keys(raw[0]) : [];

  cache = {
    mtimeMs: st.mtimeMs,
    parsedAtIso: new Date().toISOString(),
    rows,
    columns,
    dims: computeDimensions(rows)
  };

  return cache;
}

// ---------------- Middleware + Static ----------------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    // Helpful for local dev so changes are visible immediately
    res.setHeader('Cache-Control', 'no-store');
  }
}));

// ---------------- API ----------------
app.get('/api/meta', (req, res) => {
  const { mtimeMs, parsedAtIso } = loadExcelIfChanged();
  res.json({ excelPath: path.basename(excelPath), mtimeMs, parsedAtIso });
});

app.get('/api/dimensions', (req, res) => {
  const { dims } = loadExcelIfChanged();
  res.json(dims);
});

// Aggregated (safe for “summary” page): does not return row-level details
app.get('/api/aggregate', (req, res) => {
  const { rows, parsedAtIso } = loadExcelIfChanged();
  const filtered = filterRows(rows, req.query);
  const agg = aggregate(filtered);
  res.json({ ...agg, parsedAtIso });
});

// Row-level data (protected): returns normalized + original columns
app.get('/api/transactions', (req, res) => {
  const pw = (req.headers['x-report-password'] || req.query.pw || '').toString();
  if (pw !== REPORT_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { rows, columns, parsedAtIso } = loadExcelIfChanged();
  const filtered = filterRows(rows, req.query);

  // Reduce payload: omit columns that are entirely null in the filtered set
  const colSet = new Set(columns);
  const alwaysKeep = new Set(['SN', 'Date', 'Description', 'Funds Flow', 'Balance', 'Ref', 'Bank', 'Purpose', 'Instructed By', 'Transferred to', 'Cat', 'Remarks', 'Co', 'TMA', 'TMP', 'Inv Ref']);
  for (const c of alwaysKeep) colSet.add(c);

  const finalCols = [...colSet];
  const presentCols = finalCols.filter(c => {
    if (alwaysKeep.has(c)) return true;
    for (const r of filtered) {
      if (r[c] != null && String(r[c]).trim() !== '') return true;
    }
    return false;
  });

  const data = filtered.map(r => {
    const o = {};
    for (const c of presentCols) o[c] = r[c] ?? null;
    // Also expose normalized helper fields
    o.__date = r.__date;
    o.__month = r.__month;
    o.__funds_flow = r.__funds_flow;
    o.__balance = r.__balance;
    o.__direction = r.__direction;
    o.__purpose = r.__purpose;
    o.__bank = r.__bank;
    o.__cat = r.__cat;
    o.__co = r.__co;
    o.__ref = r.__ref;
    return o;
  });

  res.json({ parsedAtIso, columns: presentCols, rows: data });
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Default route
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[fund-flow-dashboard] http://localhost:${PORT}`);
  console.log(`[fund-flow-dashboard] Excel: ${excelPath}`);
  console.log(`[fund-flow-dashboard] Set REPORT_PASSWORD env var to change default password.`);
});

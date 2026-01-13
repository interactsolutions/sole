import { loadFundFlow, applyFilters } from './data.js';
import { fmtMoney, debounce, clampText } from './common.js';
import { initLockGate, isUnlocked, lock, showLockOverlay } from './auth.js';

let allRows = [];
let filteredRows = [];
let sortKey = "Date";
let sortDir = "desc";
let page = 1;
const pageSize = 50;

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fillSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'All';
  el.appendChild(optAll);

  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
  el.value = Array.from(el.options).some(o => o.value === current) ? current : 'all';
}

function getFiltersFromUI() {
  return {
    dateFrom: document.getElementById('fDateFrom').value || null,
    dateTo: document.getElementById('fDateTo').value || null,
    direction: document.getElementById('fDirection').value || 'all',
    purpose: document.getElementById('fPurpose').value || 'all',
    bank: document.getElementById('fBank').value || 'all',
    search: document.getElementById('fSearch').value || '',
  };
}

function sortRows(rows) {
  const dir = sortDir === "asc" ? 1 : -1;
  const key = sortKey;

  const getVal = (r) => {
    if (key === "Date") return r._date?.getTime() || 0;
    if (key === "Amount") return r._signed ?? 0;
    if (key === "Purpose") return (r._purpose || "").toLowerCase();
    if (key === "Bank") return (r._bank || "").toLowerCase();
    if (key === "Ref") return (r.Ref || "").toLowerCase();
    return (r[key] || "").toLowerCase?.() || r[key] || "";
  };

  return [...rows].sort((a,b) => {
    const va = getVal(a), vb = getVal(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

function renderTable() {
  const body = document.getElementById("txBody");
  if (!body) return;
  body.innerHTML = "";

  const total = filteredRows.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, maxPage);

  const start = (page - 1) * pageSize;
  const slice = filteredRows.slice(start, start + pageSize);

  for (const r of slice) {
    const tr = document.createElement("tr");
    const amt = (r._signed ?? 0);
    tr.innerHTML = `
      <td class="text-nowrap">${r.SN ?? ""}</td>
      <td class="text-nowrap">${r.Date ?? ""}</td>
      <td class="text-nowrap">${r.Ref ?? ""}</td>
      <td class="text-end text-nowrap">${fmtMoney(amt)}</td>
      <td class="text-nowrap">${r._bank ?? ""}</td>
      <td>${r._purpose ?? ""}</td>
      <td>${clampText(r._desc, 140)}</td>
      <td class="text-nowrap">${r["Instructed By"] ?? ""}</td>
      <td class="text-nowrap">${r["Transferred to"] ?? ""}</td>
    `;
    body.appendChild(tr);
  }

  setText("pageInfo", `Page ${page} / ${maxPage} (rows: ${total})`);
  document.getElementById("btnPrev").disabled = page <= 1;
  document.getElementById("btnNext").disabled = page >= maxPage;
}

function renderSummary() {
  let inflow=0, outflow=0, net=0;
  for (const r of filteredRows) {
    const s = r._signed;
    if (s === null || s === undefined || Number.isNaN(s)) continue;
    net += s;
    if (s >= 0) inflow += s;
    else outflow += Math.abs(s);
  }
  setText("sumIn", fmtMoney(inflow));
  setText("sumOut", fmtMoney(outflow));
  setText("sumNet", fmtMoney(net));
  setText("sumCount", String(filteredRows.length));
}

function rerender() {
  if (!isUnlocked()) {
    showLockOverlay();
    return;
  }
  const filters = getFiltersFromUI();
  filteredRows = sortRows(applyFilters(allRows, filters));
  page = 1;
  renderSummary();
  renderTable();
}

async function init() {
  initLockGate();

  window.addEventListener("ff:unlocked", () => {
    rerender();
  });

  document.getElementById("btnLock").addEventListener("click", () => {
    lock();
    showLockOverlay();
  });

  const { meta, rows } = await loadFundFlow();
  allRows = rows;

  setText("metaGenerated", meta.generated_at || "-");
  setText("metaDateRange", `${meta.date_min || '-'} to ${meta.date_max || '-'}`);

  // Build filter dropdowns
  const purposes = Array.from(new Set(rows.map(r => r._purpose).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const banks = Array.from(new Set(rows.map(r => r._bank).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  fillSelect('fPurpose', purposes);
  fillSelect('fBank', banks);

  const debounced = debounce(rerender, 180);

  document.getElementById('fDateFrom').addEventListener('change', rerender);
  document.getElementById('fDateTo').addEventListener('change', rerender);
  document.getElementById('fDirection').addEventListener('change', rerender);
  document.getElementById('fPurpose').addEventListener('change', rerender);
  document.getElementById('fBank').addEventListener('change', rerender);
  document.getElementById('fSearch').addEventListener('input', debounced);

  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('fDateFrom').value = '';
    document.getElementById('fDateTo').value = '';
    document.getElementById('fDirection').value = 'all';
    document.getElementById('fPurpose').value = 'all';
    document.getElementById('fBank').value = 'all';
    document.getElementById('fSearch').value = '';
    rerender();
  });

  // Sorting controls
  const sorters = document.querySelectorAll("[data-sort]");
  for (const el of sorters) {
    el.addEventListener("click", () => {
      const k = el.getAttribute("data-sort");
      if (sortKey === k) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortKey = k; sortDir = "desc"; }
      rerender();
    });
  }

  document.getElementById("btnPrev").addEventListener("click", () => { page = Math.max(1, page-1); renderTable(); });
  document.getElementById("btnNext").addEventListener("click", () => { page = page+1; renderTable(); });

  // Initial render (will be gated if locked)
  rerender();
}

document.addEventListener("DOMContentLoaded", init);

import { loadFundFlow, applyFilters, computeKPIs } from './data.js';
import { fmtMoney, yyyymm, uniq, groupBy, debounce } from './common.js';

let chartInOut = null;
let chartMonthly = null;
let chartPurpose = null;

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
  // restore if possible
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

function topNWithOther(pairs, n=10) {
  const sorted = [...pairs].sort((a,b) => b[1]-a[1]);
  const top = sorted.slice(0,n);
  const rest = sorted.slice(n);
  const other = rest.reduce((s, [,v]) => s+v, 0);
  if (other > 0) top.push(["Other", other]);
  return top;
}

function rebuildCharts(filtered) {
  const kpi = computeKPIs(filtered);
  setText('kpiInflow', fmtMoney(kpi.inflow));
  setText('kpiOutflow', fmtMoney(kpi.outflow));
  setText('kpiNet', fmtMoney(kpi.net));
  setText('kpiCount', String(kpi.txCount));

  // Inflow vs Outflow
  const ctx1 = document.getElementById('chartInOut');
  if (chartInOut) chartInOut.destroy();
  chartInOut = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['Inflow', 'Outflow'],
      datasets: [{
        label: 'PKR',
        data: [kpi.inflow, kpi.outflow],
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Monthly net + inflow/outflow
  const monthMap = new Map(); // YYYY-MM -> {in, out, net}
  for (const r of filtered) {
    if (!r._date) continue;
    const key = yyyymm(r._date);
    if (!monthMap.has(key)) monthMap.set(key, { in:0, out:0, net:0 });
    const s = r._signed;
    if (s === null || s === undefined || Number.isNaN(s)) continue;
    const v = monthMap.get(key);
    v.net += s;
    if (s >= 0) v.in += s;
    else v.out += Math.abs(s);
  }
  const months = Array.from(monthMap.keys()).sort();
  const inflowSeries = months.map(m => monthMap.get(m).in);
  const outflowSeries = months.map(m => monthMap.get(m).out);
  const netSeries = months.map(m => monthMap.get(m).net);

  const ctx2 = document.getElementById('chartMonthly');
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Inflow', data: inflowSeries, tension: 0.2 },
        { label: 'Outflow', data: outflowSeries, tension: 0.2 },
        { label: 'Net', data: netSeries, tension: 0.2 },
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Outflow by Purpose
  const out = filtered.filter(r => r._direction === 'outflow' && Number.isFinite(r._signed));
  const g = groupBy(out, r => r._purpose || 'Uncategorized');
  const pairs = Array.from(g.entries()).map(([k, arr]) => [k, arr.reduce((s,r)=>s+Math.abs(r._signed||0), 0)]);
  const top = topNWithOther(pairs, 10);
  const ctx3 = document.getElementById('chartPurpose');
  if (chartPurpose) chartPurpose.destroy();
  chartPurpose = new Chart(ctx3, {
    type: 'doughnut',
    data: {
      labels: top.map(x => x[0]),
      datasets: [{ label: 'Outflow', data: top.map(x => x[1]) }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

async function init() {
  const { meta, rows } = await loadFundFlow();

  setText('metaDateRange', `${meta.date_min || '-'} to ${meta.date_max || '-'}`);
  setText('metaGenerated', meta.generated_at || '-');

  // Build filter dropdowns
  const purposes = uniq(rows.map(r => r._purpose)).sort((a,b)=>a.localeCompare(b));
  const banks = uniq(rows.map(r => r._bank)).sort((a,b)=>a.localeCompare(b));
  fillSelect('fPurpose', purposes);
  fillSelect('fBank', banks);

  // Default date range: last 90 days if possible
  if (meta.date_max) {
    const max = new Date(meta.date_max + "T00:00:00");
    const min = new Date(max.getTime() - 90*24*60*60*1000);
    document.getElementById('fDateFrom').value = min.toISOString().slice(0,10);
    document.getElementById('fDateTo').value = max.toISOString().slice(0,10);
  }

  const rerender = () => {
    const filters = getFiltersFromUI();
    const filtered = applyFilters(rows, filters);
    rebuildCharts(filtered);
  };

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

  rerender();
}

document.addEventListener('DOMContentLoaded', init);


(function () {
  'use strict';

  const els = {
    lastUpdated: document.getElementById('lastUpdated'),
    kpiInflow: document.getElementById('kpiInflow'),
    kpiOutflow: document.getElementById('kpiOutflow'),
    kpiNet: document.getElementById('kpiNet'),
    kpiBalance: document.getElementById('kpiBalance'),
    rangeLabel: document.getElementById('rangeLabel'),
    summaryNote: document.getElementById('summaryNote'),

    fFrom: document.getElementById('fFrom'),
    fTo: document.getElementById('fTo'),
    fPurpose: document.getElementById('fPurpose'),
    fBank: document.getElementById('fBank'),
    fRef: document.getElementById('fRef'),
    fSearch: document.getElementById('fSearch'),

    btnApply: document.getElementById('btnApply'),
    btnReset: document.getElementById('btnReset'),

    chartMonthly: document.getElementById('chartMonthly'),
    chartPurposes: document.getElementById('chartPurposes')
  };

  const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function fmtMoney(v) {
    if (v == null || !isFinite(v)) return '—';
    try { return money.format(v); } catch (_) { return num.format(v); }
  }

  function optify(select, items, label = 'All') {
    select.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = label;
    select.appendChild(o0);
    for (const it of items || []) {
      const o = document.createElement('option');
      o.value = it;
      o.textContent = it;
      select.appendChild(o);
    }
  }

  function getFilters() {
    const q = {};
    if (els.fFrom.value) q.from = els.fFrom.value;
    if (els.fTo.value) q.to = els.fTo.value;
    if (els.fPurpose.value) q.purpose = els.fPurpose.value;
    if (els.fBank.value) q.bank = els.fBank.value;
    if (els.fRef.value) q.ref = els.fRef.value;
    if (els.fSearch.value.trim()) q.search = els.fSearch.value.trim();
    return q;
  }

  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v) !== '') p.set(k, v);
    });
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function jget(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  function labelRange(totals) {
    if (!totals) return '—';
    const a = totals.firstDate || '—';
    const b = totals.lastDate || '—';
    return `${a} → ${b}`;
  }

  let chartMonthly = null;
  let chartPurposes = null;

  function destroyChart(c) {
    try { c?.destroy?.(); } catch (_) {}
  }

  function renderCharts(agg) {
    const months = agg.months || [];
    const labels = months.map(m => m.month);

    const inflow = months.map(m => m.inflow || 0);
    const outflow = months.map(m => m.outflow || 0);

    destroyChart(chartMonthly);
    chartMonthly = new Chart(els.chartMonthly, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Inflow', data: inflow, backgroundColor: 'rgba(25,135,84,.65)' },
          { label: 'Outflow', data: outflow, backgroundColor: 'rgba(220,53,69,.65)' }
        ]
      },
      options: { responsive: true }
    });

    const top = (agg.topPurposesOut || []).slice(0, 10);
    const pLabels = top.map(x => (x.purpose || '').slice(0, 28));
    const pValues = top.map(x => x.total || 0);

    destroyChart(chartPurposes);
    chartPurposes = new Chart(els.chartPurposes, {
      type: 'bar',
      data: {
        labels: pLabels,
        datasets: [
          { label: 'Outflow', data: pValues, backgroundColor: 'rgba(13,110,253,.65)' }
        ]
      },
      options: { responsive: true }
    });
  }

  function renderKPIs(agg) {
    const t = agg.totals || {};
    els.kpiInflow.textContent = fmtMoney(t.inflow);
    els.kpiOutflow.textContent = fmtMoney(t.outflow);

    const net = (t.net == null) ? null : t.net;
    const netStr = fmtMoney(net);
    els.kpiNet.textContent = netStr;
    els.kpiNet.classList.remove('text-success', 'text-danger');
    if (net != null) {
      if (net >= 0) els.kpiNet.classList.add('text-success');
      else els.kpiNet.classList.add('text-danger');
    }

    els.kpiBalance.textContent = (t.lastBalance == null) ? '—' : fmtMoney(t.lastBalance);
    els.rangeLabel.textContent = labelRange(t);

    const note = [
      `Rows in scope: ${num.format(t.rows || 0)} (Cr: ${num.format(t.inflowCount || 0)}, Dr: ${num.format(t.outflowCount || 0)})`,
      `Net = Inflow - Outflow.`,
      `Use filters to produce an investor-safe summary without showing row-level details.`
    ].join('\n');
    els.summaryNote.textContent = note;
  }

  async function refreshMeta() {
    try {
      const meta = await jget('/api/meta');
      const d = new Date(meta.parsedAtIso);
      els.lastUpdated.textContent = `Parsed: ${d.toLocaleString()} (Excel mtime: ${Math.round(meta.mtimeMs)})`;
      return meta;
    } catch (e) {
      els.lastUpdated.textContent = `Meta unavailable`;
      return null;
    }
  }

  let lastMtime = null;

  async function loadAggregate() {
    const q = getFilters();
    const agg = await jget('/api/aggregate' + qs(q));
    renderKPIs(agg);
    renderCharts(agg);
    return agg;
  }

  async function initDimensions() {
    const dims = await jget('/api/dimensions');
    optify(els.fPurpose, dims.purposes, 'All purposes');
    optify(els.fBank, dims.banks, 'All banks');
    optify(els.fRef, dims.refs, 'All refs');
  }

  function resetFilters() {
    els.fFrom.value = '';
    els.fTo.value = '';
    els.fPurpose.value = '';
    els.fBank.value = '';
    els.fRef.value = '';
    els.fSearch.value = '';
  }

  async function boot() {
    await refreshMeta();
    await initDimensions();
    await loadAggregate();

    els.btnApply.addEventListener('click', () => loadAggregate().catch(err => alert(err.message)));
    els.btnReset.addEventListener('click', () => { resetFilters(); loadAggregate().catch(err => alert(err.message)); });

    // Auto-refresh if Excel changes (poll)
    setInterval(async () => {
      const meta = await refreshMeta();
      if (!meta) return;
      if (lastMtime == null) lastMtime = meta.mtimeMs;
      if (meta.mtimeMs !== lastMtime) {
        lastMtime = meta.mtimeMs;
        loadAggregate().catch(() => {});
      }
    }, 30000);
  }

  boot().catch(err => {
    console.error(err);
    els.lastUpdated.textContent = 'Failed to load dashboard.';
  });
})();

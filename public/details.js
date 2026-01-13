
(function () {
  'use strict';

  const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  const els = {
    btnUnlock: document.getElementById('btnUnlock'),
    btnLock: document.getElementById('btnLock'),
    lockBanner: document.getElementById('lockBanner'),
    rowsMeta: document.getElementById('rowsMeta'),

    fFrom: document.getElementById('fFrom'),
    fTo: document.getElementById('fTo'),
    fPurpose: document.getElementById('fPurpose'),
    fBank: document.getElementById('fBank'),
    fRef: document.getElementById('fRef'),
    fSearch: document.getElementById('fSearch'),

    btnApply: document.getElementById('btnApply'),
    btnReset: document.getElementById('btnReset'),

    txHead: document.getElementById('txHead'),
    txBody: document.getElementById('txBody'),
    txFootnote: document.getElementById('txFootnote'),

    pwModal: document.getElementById('pwModal'),
    pwInput: document.getElementById('pwInput'),
    pwSubmit: document.getElementById('pwSubmit'),
    pwError: document.getElementById('pwError')
  };

  let modal = null;

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

  function getPw() { return sessionStorage.getItem('ff_pw') || ''; }
  function setPw(pw) { sessionStorage.setItem('ff_pw', pw); }
  function clearPw() { sessionStorage.removeItem('ff_pw'); }

  function qs(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v) !== '') p.set(k, v);
    });
    const s = p.toString();
    return s ? `?${s}` : '';
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

  async function jget(url, pw) {
    const headers = pw ? { 'x-report-password': pw } : {};
    const r = await fetch(url, { cache: 'no-store', headers });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const msg = body && body.startsWith('{') ? (JSON.parse(body).error || r.statusText) : r.statusText;
      throw new Error(`${r.status} ${msg}`);
    }
    return r.json();
  }

  function fmtCell(key, v) {
    if (v == null) return '';
    if (key === 'Funds Flow' || key === 'Balance' || key === '__funds_flow' || key === '__balance') {
      const n = Number(v);
      if (!isFinite(n)) return String(v);
      try { return money.format(n); } catch (_) { return num.format(n); }
    }
    if (key === 'Date' || key === '__date') return String(v).slice(0, 10);
    return String(v);
  }

  function renderTable(columns, rows) {
    // Header
    const trh = document.createElement('tr');
    for (const c of columns) {
      const th = document.createElement('th');
      th.textContent = c;
      th.style.whiteSpace = 'nowrap';
      trh.appendChild(th);
    }
    els.txHead.innerHTML = '';
    els.txHead.appendChild(trh);

    // Body
    els.txBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    const maxRows = 2000; // safety in browser
    const slice = rows.slice(0, maxRows);

    for (const r of slice) {
      const tr = document.createElement('tr');
      for (const c of columns) {
        const td = document.createElement('td');
        const txt = fmtCell(c, r[c]);
        td.textContent = txt;

        // Make description more readable
        if (c.toLowerCase().includes('description')) {
          td.style.maxWidth = '520px';
          td.style.whiteSpace = 'normal';
        } else {
          td.style.whiteSpace = 'nowrap';
        }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    els.txBody.appendChild(frag);

    const hidden = rows.length - slice.length;
    els.txFootnote.textContent = hidden > 0
      ? `Showing first ${num.format(slice.length)} rows (of ${num.format(rows.length)}). Use tighter filters to view the rest.`
      : `Showing ${num.format(rows.length)} rows.`;
  }

  function setLocked(isLocked) {
    els.lockBanner.classList.toggle('alert-warning', isLocked);
    els.lockBanner.classList.toggle('alert-success', !isLocked);
    els.lockBanner.innerHTML = isLocked
      ? 'Locked. Click <b>Unlock</b> to enter password and view row-level details.'
      : 'Unlocked. Filters will query row-level data from the server.';
  }

  async function initDimensions() {
    const dims = await jget('/api/dimensions');
    optify(els.fPurpose, dims.purposes, 'All purposes');
    optify(els.fBank, dims.banks, 'All banks');
    optify(els.fRef, dims.refs, 'All refs');
  }

  async function loadTransactions() {
    const pw = getPw();
    if (!pw) {
      setLocked(true);
      renderTable(['Locked'], [{ Locked: 'Unlock to load transactions.' }]);
      els.rowsMeta.textContent = '—';
      return;
    }

    setLocked(false);
    const q = getFilters();
    const data = await jget('/api/transactions' + qs(q), pw);

    els.rowsMeta.textContent = `Rows: ${num.format(data.rows.length)} • Parsed: ${new Date(data.parsedAtIso).toLocaleString()}`;

    // Prefer a stable “finance-first” ordering if present
    const preferred = ['SN','Date','Ref','Funds Flow','Balance','Bank','Purpose','Cat','Co','Instructed By','Transferred to','Description','Remarks','Term','TMA','TMP','Inv Ref'];
    const cols = (data.columns || []);
    const ordered = [
      ...preferred.filter(c => cols.includes(c)),
      ...cols.filter(c => !preferred.includes(c) && !c.startsWith('__'))
    ];

    renderTable(ordered, data.rows);
  }

  function showModal() {
    els.pwError.classList.add('d-none');
    els.pwInput.value = '';
    modal.show();
    setTimeout(() => els.pwInput.focus(), 50);
  }

  async function tryUnlock() {
    const pw = els.pwInput.value;
    if (!pw) return;
    // Validate password by calling a cheap request
    try {
      await jget('/api/transactions?from=1900-01-01&to=1900-01-01', pw); // should return 0 rows if authorized
      setPw(pw);
      modal.hide();
      await loadTransactions();
    } catch (_) {
      els.pwError.classList.remove('d-none');
    }
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
    modal = new bootstrap.Modal(els.pwModal, { backdrop: 'static' });

    await initDimensions();

    els.btnUnlock.addEventListener('click', showModal);
    els.btnLock.addEventListener('click', () => { clearPw(); loadTransactions(); });

    els.pwSubmit.addEventListener('click', tryUnlock);
    els.pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

    els.btnApply.addEventListener('click', () => loadTransactions().catch(err => alert(err.message)));
    els.btnReset.addEventListener('click', () => { resetFilters(); loadTransactions().catch(err => alert(err.message)); });

    await loadTransactions();
  }

  boot().catch(err => {
    console.error(err);
    setLocked(true);
    renderTable(['Error'], [{ Error: 'Failed to load. See console.' }]);
  });
})();


/**
 * mini-chart.js
 * Lightweight fallback for Chart.js when CDN/local vendor fails.
 * Supports: doughnut/pie, bar (grouped), line (single dataset).
 * This is intentionally minimal; if Chart.js is available, it will override this.
 */
(function () {
  if (typeof window.Chart !== 'undefined') return;

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      const s = (v || '').trim();
      return s || fallback;
    } catch (_) { return fallback; }
  }

  function getCanvasAndCtx(target) {
    if (!target) return { canvas: null, ctx: null };
    if (target.getContext) return { canvas: target, ctx: target.getContext('2d') };
    if (target.canvas && target.clearRect) return { canvas: target.canvas, ctx: target };
    return { canvas: null, ctx: null };
  }

  function parseCutout(v) {
    if (v == null) return 0.0;
    if (typeof v === 'string' && v.trim().endsWith('%')) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(0.95, n / 100)) : 0.0;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.0;
    if (n > 0 && n < 1) return Math.max(0, Math.min(0.95, n));
    return 0.0;
  }

  function fmt(n) {
    try { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
    catch (_) { return String(n); }
  }

  class MiniChart {
    constructor(target, config) {
      const { canvas, ctx } = getCanvasAndCtx(target);
      this.canvas = canvas;
      this.ctx = ctx;
      this.config = config || {};
      this._ro = null;
      this._render();
      const responsive = this.config?.options?.responsive;
      if (responsive !== false && this.canvas) this._bindResize();
    }

    _bindResize() {
      try {
        const parent = this.canvas.parentElement;
        if (!parent || typeof ResizeObserver === 'undefined') return;
        this._ro = new ResizeObserver(() => this._render());
        this._ro.observe(parent);
      } catch (_) {}
    }

    _size() {
      const c = this.canvas;
      const ctx = this.ctx;
      if (!c || !ctx) return null;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.max(1, c.clientWidth || 300);
      const h = Math.max(1, c.clientHeight || 150);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    _clear(w, h) {
      this.ctx?.clearRect(0, 0, w, h);
    }

    _drawNoData(w, h, label = 'No data') {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif';
      ctx.fillStyle = cssVar('--bs-secondary-color', '#6c757d');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2);
    }

    _renderDoughnut(type, w, h, data, ds0) {
      const ctx = this.ctx;
      const values = (ds0.data || []).map(v => Number(v) || 0);
      const colors = Array.isArray(ds0.backgroundColor) ? ds0.backgroundColor : [];
      const total = values.reduce((a, b) => a + (Number(b) || 0), 0);
      if (!total) return this._drawNoData(w, h);

      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.42;
      const cut = type === 'doughnut' ? parseCutout(this.config?.options?.cutout) : 0;
      const rInner = r * cut;

      let start = -Math.PI / 2;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const ang = (v / total) * Math.PI * 2;
        if (!ang) continue;
        const end = start + ang;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[i] || `hsl(${(i * 360) / Math.max(1, values.length)} 70% 55%)`;
        ctx.fill();
        start = end;
      }

      if (rInner > 0) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    _renderBar(w, h, labels, datasets) {
      const ctx = this.ctx;
      if (!ctx) return;
      if (!labels.length) return this._drawNoData(w, h);

      const pad = 28;
      const plotX = pad;
      const plotY = 12;
      const plotW = w - pad - 8;
      const plotH = h - 24 - pad;

      // Determine min/max from datasets
      let min = 0;
      let max = 0;
      for (const ds of datasets) {
        for (const v of (ds.data || [])) {
          const n = Number(v) || 0;
          if (n > max) max = n;
        }
      }
      if (max <= 0) return this._drawNoData(w, h);

      // Axes
      ctx.strokeStyle = 'rgba(0,0,0,.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      // Y ticks
      ctx.fillStyle = cssVar('--bs-secondary-color', '#6c757d');
      ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const t = i / ticks;
        const y = plotY + plotH - t * plotH;
        const val = t * max;
        ctx.fillText(fmt(val), plotX - 6, y);
        ctx.strokeStyle = 'rgba(0,0,0,.06)';
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
      }

      const groups = labels.length;
      const series = Math.max(1, datasets.length);
      const groupW = plotW / groups;
      const barGap = Math.min(10, groupW * 0.18);
      const barW = (groupW - barGap) / series;

      for (let i = 0; i < groups; i++) {
        for (let s = 0; s < series; s++) {
          const ds = datasets[s];
          const v = Number((ds.data || [])[i] || 0);
          const barH = (v / max) * plotH;
          const x = plotX + i * groupW + s * barW + barGap / 2;
          const y = plotY + plotH - barH;

          ctx.fillStyle = (Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : ds.backgroundColor) || `hsl(${(s * 180)} 70% 55%)`;
          ctx.fillRect(x, y, Math.max(1, barW - 2), barH);
        }
      }

      // X labels (sparse)
      ctx.fillStyle = cssVar('--bs-secondary-color', '#6c757d');
      ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const step = Math.ceil(groups / 6);
      for (let i = 0; i < groups; i += step) {
        const x = plotX + i * groupW + groupW / 2;
        ctx.fillText(labels[i], x, plotY + plotH + 6);
      }
    }

    _renderLine(w, h, labels, ds0) {
      const ctx = this.ctx;
      if (!ctx) return;
      const values = (ds0.data || []).map(v => Number(v) || 0);
      if (!labels.length || !values.length) return this._drawNoData(w, h);

      const pad = 28;
      const plotX = pad;
      const plotY = 12;
      const plotW = w - pad - 8;
      const plotH = h - 24 - pad;

      let max = Math.max(...values);
      let min = Math.min(...values);
      if (max === min) { max += 1; min -= 1; }

      // Axes
      ctx.strokeStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath();
      ctx.moveTo(plotX, plotY);
      ctx.lineTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      // Line
      const color = ds0.borderColor || 'rgba(13,110,253,.85)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const tX = values.length === 1 ? 0 : i / (values.length - 1);
        const x = plotX + tX * plotW;
        const y = plotY + (1 - (values[i] - min) / (max - min)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    _render() {
      const { canvas, ctx } = this;
      if (!canvas || !ctx) return;
      const size = this._size();
      if (!size) return;
      const { w, h } = size;
      this._clear(w, h);

      const type = String(this.config?.type || '').toLowerCase();
      const data = this.config?.data || {};
      const labels = (data.labels || []).map(x => String(x));
      const ds = (data.datasets || []);

      if (type === 'doughnut' || type === 'pie') {
        return this._renderDoughnut(type, w, h, data, ds[0] || {});
      }
      if (type === 'bar') {
        return this._renderBar(w, h, labels, ds);
      }
      if (type === 'line') {
        return this._renderLine(w, h, labels, ds[0] || {});
      }

      this._drawNoData(w, h, 'Chart');
    }

    update() { this._render(); }
    destroy() {
      try { this._ro?.disconnect(); } catch (_) {}
      this._ro = null;
      if (this.canvas && this.ctx) {
        const w = this.canvas.clientWidth || this.canvas.width;
        const h = this.canvas.clientHeight || this.canvas.height;
        try { this._clear(w, h); } catch (_) {}
      }
    }
  }

  window.Chart = MiniChart;
})();

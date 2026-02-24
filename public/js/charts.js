/* ============================================================
   charts.js — Chart.js utilities for animated, modular charts
   Follows the architecture pattern from the reference project:
   https://github.com/valfranst/engenharia-de-software-com-ia-aplicada
   ============================================================ */
const Charts = (() => {
  const COLORS = {
    primary:  '#4f46e5',
    success:  '#22c55e',
    warning:  '#f59e0b',
    danger:   '#ef4444',
    info:     '#06b6d4',
    purple:   '#a855f7',
    muted:    '#94a3b8',
  };

  const PALETTE = [
    COLORS.primary, COLORS.success, COLORS.warning,
    COLORS.danger,  COLORS.info,    COLORS.purple,
  ];

  const ANIMATION = { duration: 900, easing: 'easeInOutQuart' };

  const BASE_SCALES = {
    x: { grid: { display: false } },
    y: { grid: { color: 'rgba(0,0,0,.05)', drawBorder: false } },
  };

  /* ---- Gradient fill helper ---- */
  function _gradient(ctx, hexColor, alpha1 = 0.35, alpha2 = 0.02) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 300);
    g.addColorStop(0, hexColor + Math.round(alpha1 * 255).toString(16).padStart(2, '0'));
    g.addColorStop(1, hexColor + Math.round(alpha2 * 255).toString(16).padStart(2, '0'));
    return g;
  }

  /* ---- Animated counter helper ---- */
  function animateCounter(el, target, duration = 800, format = (v) => v) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---- Line chart ---- */
  function line(canvasEl, labels, datasets, opts = {}) {
    if (!window.Chart || !canvasEl) return null;
    const ctx = canvasEl.getContext('2d');
    const processed = datasets.map((ds, i) => {
      const color = ds.borderColor || PALETTE[i % PALETTE.length];
      return {
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        ...ds,
        borderColor: color,
        backgroundColor: ds.backgroundColor || _gradient(ctx, color),
      };
    });
    return new Chart(canvasEl, {
      type: 'line',
      data: { labels, datasets: processed },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: ANIMATION,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: { cornerRadius: 8, padding: 10 },
        },
        scales: BASE_SCALES,
        ...opts,
      },
    });
  }

  /* ---- Doughnut chart ---- */
  function doughnut(canvasEl, labels, data, colors) {
    if (!window.Chart || !canvasEl) return null;
    return new Chart(canvasEl, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors || [COLORS.success, COLORS.warning, COLORS.danger],
          borderWidth: 3,
          borderColor: '#fff',
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { ...ANIMATION, animateRotate: true, animateScale: true },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14 } },
          tooltip: { cornerRadius: 8, padding: 10 },
        },
        cutout: '68%',
      },
    });
  }

  /* ---- Horizontal bar chart ---- */
  function bar(canvasEl, labels, data, label, color) {
    if (!window.Chart || !canvasEl) return null;
    const colors = Array.isArray(color) ? color
      : (color ? Array(labels.length).fill(color) : PALETTE);
    return new Chart(canvasEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: label || '',
          data,
          backgroundColor: colors,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: ANIMATION,
        plugins: { legend: { display: !!label } },
        scales: BASE_SCALES,
      },
    });
  }

  /* ---- Destroy helper ---- */
  function destroy(chart) {
    if (chart) chart.destroy();
    return null;
  }

  return { COLORS, PALETTE, line, doughnut, bar, destroy, animateCounter };
})();

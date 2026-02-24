/* ============================================================
   charts.js — Chart.js utilities for animated, modular charts
   Follows the architecture pattern from the reference project:
   https://github.com/valfranst/engenharia-de-software-com-ia-aplicada
   ============================================================ */
const Charts = (() => {
  const COLORS = {
    primary:  '#00d4ff',
    success:  '#00ffa3',
    warning:  '#f59e0b',
    danger:   '#ef4444',
    info:     '#00d4ff',
    purple:   '#0056b3',
    pink:     '#0056b3',
    cyan:     '#00d4ff',
    blue:     '#0056b3',
    muted:    '#94a3b8',
  };

  const PALETTE = [
    COLORS.primary, COLORS.cyan, COLORS.pink,
    COLORS.success, COLORS.warning, COLORS.blue,
  ];

  const ANIMATION = { duration: 900, easing: 'easeInOutQuart' };

  const BASE_SCALES = {
    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
    y: { grid: { color: 'rgba(255,255,255,.06)', drawBorder: false }, ticks: { color: '#94a3b8' } },
  };

  /* ---- Gradient fill helper ---- */
  function _alphaHex(alpha) {
    return Math.round(alpha * 255).toString(16).padStart(2, '0');
  }

  function _gradient(ctx, hexColor, alpha1 = 0.35, alpha2 = 0.02) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 300);
    g.addColorStop(0, hexColor + _alphaHex(alpha1));
    g.addColorStop(1, hexColor + _alphaHex(alpha2));
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
    const processed = datasets.map((dataset, i) => {
      const color = dataset.borderColor || PALETTE[i % PALETTE.length];
      return {
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        ...dataset,
        borderColor: color,
        backgroundColor: dataset.backgroundColor || _gradient(ctx, color),
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
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, color: '#94a3b8' } },
          tooltip: { cornerRadius: 8, padding: 10, backgroundColor: 'rgba(20,26,38,.95)', titleColor: '#ffffff', bodyColor: '#ffffff', borderColor: '#2d3748', borderWidth: 1 },
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
          borderWidth: 2,
          borderColor: 'rgba(20,26,38,.7)',
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { ...ANIMATION, animateRotate: true, animateScale: true },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, color: '#94a3b8' } },
          tooltip: { cornerRadius: 8, padding: 10, backgroundColor: 'rgba(20,26,38,.95)', titleColor: '#ffffff', bodyColor: '#ffffff', borderColor: '#2d3748', borderWidth: 1 },
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
        plugins: { legend: { display: !!label, labels: { color: '#94a3b8' } }, tooltip: { cornerRadius: 8, padding: 10, backgroundColor: 'rgba(20,26,38,.95)', titleColor: '#ffffff', bodyColor: '#ffffff', borderColor: '#2d3748', borderWidth: 1 } },
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

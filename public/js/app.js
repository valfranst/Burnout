/* ============================================================
   app.js — Client-side helper for API calls + CSRF
   ============================================================ */
const App = (() => {
  let csrfToken = null;

  async function fetchCsrf() {
    try {
      const res = await fetch('/csrf-token', { credentials: 'same-origin' });
      const data = await res.json();
      csrfToken = data.csrfToken;
    } catch (e) {
      console.warn('CSRF token fetch failed', e);
    }
  }

  async function api(url, opts = {}) {
    if (!csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes((opts.method || '').toUpperCase())) {
      await fetchCsrf();
    }
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    const res = await fetch(url, { ...opts, headers, credentials: 'same-origin' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...json };
    return json;
  }

  function showAlert(container, msg, type = 'error') {
    let el = container.querySelector('.alert');
    if (!el) { el = document.createElement('div'); container.prepend(el); }
    el.className = `alert alert-${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideAlert(container) {
    const el = container.querySelector('.alert');
    if (el) el.classList.add('hidden');
  }

  function isLoggedIn() {
    return document.cookie.includes('connect.sid');
  }

  /** Gera URL de avatar placeholder a partir das iniciais */
  function defaultAvatar(name) {
    const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="%236366f1"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">${initials}</text></svg>`;
    return `data:image/svg+xml,${svg}`;
  }

  /** Verifica sessão no servidor e atualiza a navbar */
  async function initNavbar() {
    const navGuest = document.getElementById('nav-guest');
    const navUser = document.getElementById('nav-user');
    if (!navGuest || !navUser) return; // página sem navbar dinâmica (ex: login/register)

    try {
      const res = await fetch('/auth/me', { credentials: 'same-origin' });
      if (!res.ok) return; // não logado — mantém navbar de visitante
      const user = await res.json();
      navGuest.classList.add('hidden');
      navUser.classList.remove('hidden');

      const avatarUrl = user.picture_url || defaultAvatar(user.name || user.email);
      const avatarEl = document.getElementById('nav-user-avatar');
      const cardAvatarEl = document.getElementById('card-avatar');
      const cardNameEl = document.getElementById('card-name');
      const cardEmailEl = document.getElementById('card-email');

      if (avatarEl) avatarEl.src = avatarUrl;
      if (cardAvatarEl) cardAvatarEl.src = avatarUrl;
      if (cardNameEl) cardNameEl.textContent = user.name || 'Usuário';
      if (cardEmailEl) cardEmailEl.textContent = user.email;
    } catch (_) { /* mantém navbar de visitante */ }
  }

  /** Logout: chama API e redireciona */
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (_) { /* ignora */ }
    window.location.href = '/login.html';
  }

  return { fetchCsrf, api, showAlert, hideAlert, isLoggedIn, initNavbar, logout };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.fetchCsrf();
  App.initNavbar();

  // Bind logout em qualquer página que tenha o botão
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) btnLogout.addEventListener('click', () => App.logout());
});

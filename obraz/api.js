/* ============================================================
   api.js — слой работы с бэкендом
   ============================================================ */

const API_BASE = 'https://salon-backend-production-0742.up.railway.app';

/* tenant_id берём из URL: ?t=uuid */
let TENANT_ID = new URLSearchParams(location.search).get('t');

function getTmaAuth() {
  const initData = window.Telegram?.WebApp?.initData;
  return initData ? `TMA ${initData}` : 'TMA dev';
}

async function apiFetch(path, opts = {}) {
  const { method = 'GET', body = null, auth = false } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = getTmaAuth();

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* ── Клиентские API ──────────────────────────────────────── */
const api = {
  getConfig:    ()       => apiFetch(`/api/v1/app/${TENANT_ID}/config`),
  getServices:  ()       => apiFetch(`/api/v1/app/${TENANT_ID}/services`),
  getGallery:   (cat)    => apiFetch(`/api/v1/app/${TENANT_ID}/gallery${cat && cat !== 'Все' ? '?category=' + encodeURIComponent(cat) : ''}`),
  getSlots:     (date)   => apiFetch(`/api/v1/app/${TENANT_ID}/slots/${date}`),
  getNextSlot:  ()       => apiFetch(`/api/v1/app/${TENANT_ID}/next-slot`),
  createBooking:(data)   => apiFetch(`/api/v1/app/${TENANT_ID}/bookings`,  { method: 'POST',  body: data, auth: true }),
  getMyBookings:()       => apiFetch(`/api/v1/app/${TENANT_ID}/my-bookings`, { auth: true }),
  cancelBooking:(id)     => apiFetch(`/api/v1/app/${TENANT_ID}/bookings/${id}/cancel`, { method: 'PATCH', auth: true }),
  getReviews:   ()       => apiFetch(`/api/v1/app/${TENANT_ID}/reviews`),
  canReview:    ()       => apiFetch(`/api/v1/app/${TENANT_ID}/can-review`, { auth: true }),
  submitReview: (rating) => apiFetch(`/api/v1/app/${TENANT_ID}/reviews`, { method: 'POST', body: { rating }, auth: true }),

  /* ── Мастерские API ────────────────────────────────────── */
  getMasterProfile:  ()        => apiFetch('/api/v1/master/me', { auth: true }),
  updateMasterProfile:(data)   => apiFetch('/api/v1/master/me', { method: 'PATCH', body: data, auth: true }),
  uploadAvatar:(formData) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    return fetch(API_BASE + '/api/v1/master/avatar', {
      method: 'POST',
      headers: { 'Authorization': getTmaAuth() },
      body: formData,
      signal: ctrl.signal,
    }).then(r => {
      clearTimeout(timer);
      if (!r.ok) return r.json().then(e => { throw e; });
      return r.json();
    }).catch(e => {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Превышено время ожидания. Попробуйте фото меньшего размера.');
      throw e;
    });
  },
  getMasterServices: ()        => apiFetch('/api/v1/master/services', { auth: true }),
  createService:     (data)    => apiFetch('/api/v1/master/services', { method: 'POST', body: data, auth: true }),
  updateService:     (id, data)=> apiFetch(`/api/v1/master/services/${id}`, { method: 'PUT', body: data, auth: true }),
  deleteService:     (id)      => apiFetch(`/api/v1/master/services/${id}`, { method: 'DELETE', auth: true }),
  getMasterBookings: (params)  => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/v1/master/bookings${q}`, { auth: true });
  },
  completeBooking:   (id)      => apiFetch(`/api/v1/master/bookings/${id}/complete`, { method: 'PATCH', auth: true }),
  getMasterGallery:  ()        => apiFetch('/api/v1/master/gallery', { auth: true }),
  uploadGalleryPhoto:(formData) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    return fetch(API_BASE + '/api/v1/master/gallery', {
      method: 'POST',
      headers: { 'Authorization': getTmaAuth() },
      body: formData,
      signal: ctrl.signal,
    }).then(r => {
      clearTimeout(timer);
      if (!r.ok) return r.json().then(e => { throw e; });
      return r.json();
    }).catch(e => {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Превышено время ожидания. Попробуйте фото меньшего размера.');
      throw e;
    });
  },
  deleteGalleryPhoto:(id)      => apiFetch(`/api/v1/master/gallery/${id}`, { method: 'DELETE', auth: true }),
  getMasterClients:  ()        => apiFetch('/api/v1/master/clients', { auth: true }),
  getMasterSchedule:    ()     => apiFetch('/api/v1/master/schedule', { auth: true }),
  updateMasterSchedule: (data) => apiFetch('/api/v1/master/schedule', { method: 'PUT', body: data, auth: true }),
};

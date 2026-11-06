export const auth = {
  get: () => JSON.parse(localStorage.getItem('kh_user') || 'null'),
  set: (u, t) => { localStorage.setItem('kh_user', JSON.stringify(u)); localStorage.setItem('kh_token', t); },
  clear: () => { localStorage.removeItem('kh_user'); localStorage.removeItem('kh_token'); },
};
export async function api(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('kh_token');
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: body && JSON.stringify(body) });
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
  return d;
}

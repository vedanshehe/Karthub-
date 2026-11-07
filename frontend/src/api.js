export const auth = {
  get: () => {
    try {
      return JSON.parse(localStorage.getItem('kh_user') || 'null');
    } catch {
      return null;
    }
  },
  set: (u, t) => {
    localStorage.setItem('kh_user', JSON.stringify(u));
    localStorage.setItem('kh_token', t);
    window.dispatchEvent(new Event('kh_auth_change'));
  },
  clear: () => {
    localStorage.removeItem('kh_user');
    localStorage.removeItem('kh_token');
    window.dispatchEvent(new Event('kh_auth_change'));
  },
};

export async function api(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('kh_token');
  const r = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(t && { Authorization: 'Bearer ' + t })
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) {
      auth.clear();
    }
    throw new Error(d?.error || `Request failed (${r.status})`);
  }
  return d;
}

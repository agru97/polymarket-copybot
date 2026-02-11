const getToken = () => localStorage.getItem('bot_token') || '';
const getCsrf = () => localStorage.getItem('bot_csrf') || '';

export async function apiFetch(url: string, opts: RequestInit = {}) {
  const token = getToken();
  const csrf = getCsrf();
  return fetch(url, {
    ...opts,
    headers: {
      ...opts.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
  });
}

export async function login(password: string) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.csrfToken) localStorage.setItem('bot_csrf', data.csrfToken);
  return data;
}

export async function getStats() {
  const res = await apiFetch('/api/stats');
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

export async function getTrades(limit = 100) {
  const res = await apiFetch(`/api/trades?limit=${limit}`);
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

export async function getTraders() {
  const res = await apiFetch('/api/traders');
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

export async function getConfig() {
  const res = await apiFetch('/api/config');
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

export async function controlBot(action: 'pause' | 'resume' | 'emergency-stop') {
  const res = await apiFetch(`/api/control/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function addTrader(address: string, bucket: string, label?: string) {
  const res = await apiFetch('/api/traders', {
    method: 'POST',
    body: JSON.stringify({ address, bucket, label }),
  });
  return res.json();
}

export async function updateTrader(address: string, updates: Record<string, unknown>) {
  const res = await apiFetch(`/api/traders/${address}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function removeTrader(address: string) {
  const res = await apiFetch(`/api/traders/${address}`, { method: 'DELETE' });
  return res.json();
}

export async function saveSettings(settings: Record<string, unknown>) {
  const res = await apiFetch('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getAuditLog() {
  const res = await apiFetch('/api/audit-log');
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

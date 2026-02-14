const getToken = () => localStorage.getItem('bot_token') || '';
const getCsrf = () => localStorage.getItem('bot_csrf') || '';

export async function apiFetch(url: string, opts: RequestInit = {}) {
  const token = getToken();
  const csrf = getCsrf();
  const headers: Record<string, string> = {
    ...opts.headers as Record<string, string>,
    Authorization: `Bearer ${token}`,
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  };
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...opts, headers });
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

async function jsonOrThrow(res: Response) {
  if (res.status === 401) throw new Error('Unauthorized');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function getStats(range?: string) {
  const params = range && range !== 'all' ? `?range=${range}` : '';
  const res = await apiFetch(`/api/stats${params}`);
  return jsonOrThrow(res);
}

export async function getTrades(
  page = 1,
  pageSize = 25,
  filters: { status?: string; dateRange?: string; search?: string } = {}
) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.status) params.set('status', filters.status);
  if (filters.dateRange) params.set('dateRange', filters.dateRange);
  if (filters.search) params.set('search', filters.search);
  const res = await apiFetch(`/api/trades?${params}`);
  return jsonOrThrow(res);
}

export async function getTraders() {
  const res = await apiFetch('/api/traders');
  return jsonOrThrow(res);
}

export async function getConfig() {
  const res = await apiFetch('/api/config');
  return jsonOrThrow(res);
}

export async function controlBot(action: 'pause' | 'resume' | 'emergency-stop') {
  const res = await apiFetch(`/api/control/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return jsonOrThrow(res);
}

export async function addTrader(address: string, bucket: string, label?: string) {
  const res = await apiFetch('/api/traders', {
    method: 'POST',
    body: JSON.stringify({ address, bucket, label }),
  });
  return jsonOrThrow(res);
}

export async function updateTrader(address: string, updates: Record<string, unknown>) {
  const res = await apiFetch(`/api/traders/${address}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return jsonOrThrow(res);
}

export async function removeTrader(address: string) {
  const res = await apiFetch(`/api/traders/${address}`, { method: 'DELETE' });
  return jsonOrThrow(res);
}

export async function saveSettings(settings: Record<string, unknown>) {
  const res = await apiFetch('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  return jsonOrThrow(res);
}

export async function getAuditLog() {
  const res = await apiFetch('/api/audit-log');
  return jsonOrThrow(res);
}

export async function getNotificationStatus() {
  const res = await apiFetch('/api/notifications/status');
  return jsonOrThrow(res);
}

export async function updateNotifications(settings: Record<string, string>) {
  const res = await apiFetch('/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  return jsonOrThrow(res);
}

export async function testNotification() {
  const res = await apiFetch('/api/notifications/test', { method: 'POST', body: JSON.stringify({}) });
  return jsonOrThrow(res);
}

export async function downloadExport(type: 'trades' | 'activity' | 'performance') {
  const res = await apiFetch(`/api/exports/${type}`);
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `${type}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

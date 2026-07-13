'use client';

import { auth } from './firebase';

/**
 * Download a protected export route with the caller's Firebase ID token in
 * the Authorization header (routes reject unauthenticated requests — PRD §7.5).
 */
/** JSON API call with the caller's Firebase ID token. Throws on non-2xx. */
export async function apiFetch<T = any>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sesi berakhir — silakan login ulang.');
  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Permintaan gagal (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sesi berakhir — silakan login ulang.');
  const token = await user.getIdToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Gagal mengunduh (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

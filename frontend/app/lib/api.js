const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error(`Can't reach the backend at ${API}. Make sure it's running.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

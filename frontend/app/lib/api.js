import { getToken, clearToken } from './auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Pass { auth: false } for the login and register calls: they have no token to send,
// and a 401 from them means "wrong password", not "your session ended".
export async function api(path, { auth = true, ...options } = {}) {
  const token = auth ? getToken() : null;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(`Can't reach the backend at ${API}. Make sure it's running.`);
  }
  const data = await res.json().catch(() => null);

  // the token is missing, expired or wrong: forget it and go to the login page
  if (res.status === 401 && auth) {
    clearToken();
    window.location.assign('/login');
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

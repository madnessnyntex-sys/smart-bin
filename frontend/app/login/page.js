'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getToken, setToken } from '../lib/auth';

const field = 'mb-4 w-full rounded border border-ink/20 p-2';

// One page for both logging in and creating an account (an account needs the invite code).
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // already logged in? skip the form
  useEffect(() => {
    if (getToken()) router.replace('/');
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === 'login' ? { email, password } : { email, password, inviteCode };
      const { token } = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        auth: false,
        body: JSON.stringify(body),
      });
      setToken(token);
      router.replace('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const registering = mode === 'register';

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-1 text-3xl font-bold text-paddy">Smart Bin Rice Vendo</h1>
      <p className="mb-8 text-ink/70">{registering ? 'Create a dashboard account.' : 'Log in to see the dashboard.'}</p>

      <form onSubmit={submit} className="rounded-lg bg-white p-6">
        <label htmlFor="email" className="mb-1 block text-sm">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email}
               onChange={(e) => setEmail(e.target.value)} className={field} />

        <label htmlFor="password" className="mb-1 block text-sm">Password{registering && ' (at least 8 characters)'}</label>
        <input id="password" type="password" required minLength={registering ? 8 : 1}
               autoComplete={registering ? 'new-password' : 'current-password'} value={password}
               onChange={(e) => setPassword(e.target.value)} className={field} />

        {registering && (
          <>
            <label htmlFor="invite" className="mb-1 block text-sm">Invite code</label>
            <input id="invite" type="text" required value={inviteCode}
                   onChange={(e) => setInviteCode(e.target.value)} className={field} />
          </>
        )}

        {error && <p role="alert" className="mb-4 text-sm font-medium text-reject">{error}</p>}

        <button type="submit" disabled={busy}
                className="w-full rounded bg-paddy px-4 py-2 font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paddy">
          {busy ? 'Please wait...' : registering ? 'Create account' : 'Log in'}
        </button>
      </form>

      <button type="button" onClick={() => { setMode(registering ? 'login' : 'register'); setError(null); }}
              className="mt-4 text-sm text-paddy underline">
        {registering ? 'I already have an account' : 'I have an invite code'}
      </button>
    </main>
  );
}

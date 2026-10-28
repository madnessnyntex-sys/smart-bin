'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './lib/api';
import { getToken, clearToken } from './lib/auth';
import { usePolling } from './lib/usePolling';
import Stats from './components/Stats';
import TopItems from './components/TopItems';
import DailyChart from './components/DailyChart';
import Hoppers from './components/Hoppers';
import RecentList from './components/RecentList';
import SimulatePanel from './components/SimulatePanel';

const SHOW_SIMULATOR = process.env.NEXT_PUBLIC_ENABLE_SIMULATOR !== 'false';

// Only shows the dashboard to a logged-in user. This is for convenience: the real protection
// is in the backend, which refuses every dashboard request that has no valid token.
export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // ask the backend if the saved token still works (api() sends us to /login if it doesn't)
    api('/api/auth/me').then((me) => setEmail(me.email)).catch((e) => setProblem(e.message));
  }, [router]);

  function logout() {
    clearToken();
    router.replace('/login');
  }

  if (problem) return <p role="alert" className="mx-auto max-w-5xl p-10 text-reject">{problem}</p>;
  if (!email) return null; // checking the login, or on the way to /login
  return <DashboardContent email={email} onLogout={logout} />;
}

function DashboardContent({ email, onLogout }) {
  const [days, setDays] = useState(7);
  const { data, error, refresh } = usePolling(
    async () => {
      const [summary, recent, devices] = await Promise.all([
        api(`/api/summary?days=${days}`),
        api('/api/detections/recent'),
        api('/api/devices'),
      ]);
      return { summary, recent, devices };
    },
    [days]
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-paddy">Smart Bin Rice Vendo</h1>
          <p className="mt-1 text-ink/70">Recyclables go in, rice comes out. Here's what the bin has collected.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="range" className="mr-2 text-sm">Show</label>
            <select id="range" value={days} onChange={(e) => setDays(Number(e.target.value))}
                    className="rounded border border-ink/20 bg-white p-2 text-sm">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          <div className="text-sm">
            <span className="text-ink/60">{email}</span>
            <button type="button" onClick={onLogout} className="ml-3 text-paddy underline">Log out</button>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-6 rounded bg-reject/10 p-3 text-reject">
          {data ? `Couldn't refresh: ${error}` : error}
        </p>
      )}

      {!data ? (
        !error && <p className="text-ink/60">Loading...</p>
      ) : (
        <div className="space-y-8">
          <Stats totals={data.summary.totals} />
          <TopItems byItem={data.summary.byItem} total={data.summary.totals.total} days={data.summary.days} />
          <div className="grid gap-8 md:grid-cols-2">
            <DailyChart daily={data.summary.daily} />
            <Hoppers devices={data.devices} onDone={refresh} />
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            {SHOW_SIMULATOR && <SimulatePanel onDone={refresh} />}
            <RecentList recent={data.recent} />
          </div>
        </div>
      )}
    </main>
  );
}

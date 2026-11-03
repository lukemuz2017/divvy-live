'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/live-data';
import { NicknameForm, NicknameGate, useNickname } from './Nickname';
import { SiteHeader } from './SiteHeader';

type LeaderboardRow = {
  place: number;
  rider: string;
  total_points: number;
  trip_count: number;
  is_me: boolean;
};

type Trip = {
  id: string;
  route_name: string;
  pickup_name: string;
  dropoff_name: string;
  points: number;
  miles: number;
  created_at: string;
};

const RECENT_TRIPS = 10;

export function Profile() {
  const { isLoaded, userId } = useAuth();

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-5 md:py-8">
      <SiteHeader />
      {isLoaded && userId ? (
        <NicknameGate>
          <ProfileDetails />
        </NicknameGate>
      ) : <p role="status" className="text-muted">Loading your profile…</p>}
    </div>
  );
}

function ProfileDetails() {
  const supabase = useSupabase();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const { nickname, save } = useNickname();
  const [editingNickname, setEditingNickname] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadScores = async () => {
    const [board, recent] = await Promise.all([
      supabase.rpc('leaderboard'),
      supabase
        .from('trips')
        .select('id, route_name, pickup_name, dropoff_name, points, miles, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_TRIPS),
    ]);
    setFailed(Boolean(board.error || recent.error));
    if (!board.error) setLeaderboard(board.data as LeaderboardRow[]);
    if (!recent.error) setTrips(recent.data as Trip[]);
    setLoaded(true);
  };

  useEffect(() => {
    void loadScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const me = leaderboard.find((row) => row.is_me);

  if (!loaded) return <p role="status" className="text-muted">Loading your profile…</p>;

  return (
    <main className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{nickname ?? 'Your profile'}</h1>
        {editingNickname ? (
          <NicknameForm
            initial={nickname ?? ''}
            submitLabel="Save nickname"
            onSave={async (name) => {
              const error = await save(name);
              if (!error) {
                setEditingNickname(false);
                await loadScores();
              }
              return error;
            }}
            onCancel={() => setEditingNickname(false)}
          />
        ) : (
          <p className="text-sm text-muted">
            Your nickname on the leaderboard.{' '}
            <button onClick={() => setEditingNickname(true)} className="cursor-pointer underline hover:text-ink">
              Change
            </button>
          </p>
        )}
      </div>

      {failed && (
        <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad" role="alert">
          <h2 className="font-semibold">We couldn’t load your points</h2>
          <p className="text-sm">Reload the page to try again.</p>
        </section>
      )}

      <dl className="grid grid-cols-3 gap-3">
        <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Total points</dt>
          <dd className="font-mono text-3xl font-medium text-bike">{me?.total_points ?? 0}</dd>
        </div>
        <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Trips</dt>
          <dd className="font-mono text-3xl font-medium">{me?.trip_count ?? 0}</dd>
        </div>
        <div className="grid gap-1 rounded-lg border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Your rank</dt>
          <dd className="font-mono text-3xl font-medium">{me ? `#${me.place}` : '–'}</dd>
        </div>
      </dl>

      <section className="grid gap-3">
        <h2 className="text-xl font-bold">Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
            Nobody has points yet. Choose a trip on the Home page to take first place.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Rank</th>
                  <th scope="col" className="px-4 py-2 font-medium">Rider</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Trips</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {leaderboard.map((row) => (
                  <tr key={`${row.place}-${row.rider}`} className={`border-t border-line ${row.is_me ? 'bg-bike-soft font-semibold' : ''}`}>
                    <td className="px-4 py-2 font-mono">#{row.place}</td>
                    <td className="px-4 py-2">
                      {row.rider}
                      {row.is_me && <span className="ml-2 font-mono text-xs text-bike">You</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{row.trip_count}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-muted">
          Points are this app’s own estimate, not Bike Angels points. Trips work on the honor system, with one every 30
          minutes.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-bold">Recent trips</h2>
        {trips.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
            Your trips will appear here after you choose one on the Home page.
          </p>
        ) : (
          <ul className="grid rounded-lg border border-line bg-surface px-4">
            {trips.map((trip, index) => (
              <li key={trip.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 ${index > 0 ? 'border-t border-line' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{trip.route_name}</p>
                  <p className="text-sm text-muted">
                    {trip.pickup_name} to {trip.dropoff_name}
                  </p>
                  <p className="text-sm text-muted">
                    {new Date(trip.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}, {trip.miles} mi of walking
                  </p>
                </div>
                <span className="font-mono font-medium text-bike">+{trip.points} pts</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

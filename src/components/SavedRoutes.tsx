'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { routeEnds, useSupabase } from '@/lib/live-data';
import type { Route } from '@/lib/live-data';
import { milesBetween } from '@/lib/scoring';
import { AccountMenu } from './AccountMenu';
import { RouteForm } from './RouteForm';

const MAX_NAME_LENGTH = 40;

export function SavedRoutes() {
  const { isLoaded } = useAuth();

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-5 md:py-8">
      <header className="flex items-center justify-between gap-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Divvy Live
        </Link>
        <AccountMenu />
      </header>
      {isLoaded ? <RouteManager /> : <p role="status" className="text-muted">Loading your routes…</p>}
    </div>
  );
}

function RouteManager() {
  const supabase = useSupabase();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*').order('created_at');
    setFailed(Boolean(error));
    if (!error) setRoutes(data as Route[]);
    setLoaded(true);
  };

  useEffect(() => {
    void loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const startRename = (route: Route) => {
    setRenamingId(route.id);
    setDraftName(route.name);
    setRenameError(null);
    setConfirmingDeleteId(null);
  };

  const saveRename = async (event: React.FormEvent, routeId: string) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      setRenameError('Enter a name for this route.');
      return;
    }
    const { error } = await supabase.from('routes').update({ name, updated_at: new Date().toISOString() }).eq('id', routeId);
    if (error) {
      setRenameError(error.code === '23505' ? 'You already have a route with that name.' : 'We couldn’t rename this route. Try again.');
      return;
    }
    setRenamingId(null);
    await loadRoutes();
  };

  const deleteRoute = async (routeId: string) => {
    setConfirmingDeleteId(null);
    setDeleteError(null);
    const { error } = await supabase.from('routes').delete().eq('id', routeId);
    if (error) setDeleteError('We couldn’t delete that route. Try again.');
    await loadRoutes();
  };

  if (!loaded) return <p role="status" className="text-muted">Loading your routes…</p>;

  if (failed) {
    return (
      <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad" role="alert">
        <h1 className="font-semibold">We couldn’t load your routes</h1>
        <p className="text-sm">Reload the page to try again.</p>
      </section>
    );
  }

  return (
    <main className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Saved routes</h1>
          <p className="text-sm text-muted">We don’t store your addresses, so each route shows the distance between its ends.</p>
        </div>
        <Link href="/" className="text-sm font-semibold text-muted underline hover:text-ink">
          Back to recommendations
        </Link>
      </div>

      {deleteError && (
        <p role="alert" className="text-sm text-bad">
          {deleteError}
        </p>
      )}

      {routes.length > 0 && (
        <ul className="grid rounded-lg border border-line bg-surface px-5">
          {routes.map((route, index) => {
            const { start, end } = routeEnds(route);
            return (
              <li
                key={route.id}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 ${index > 0 ? 'border-t border-line' : ''}`}
              >
                {renamingId === route.id ? (
                  <form onSubmit={(event) => void saveRename(event, route.id)} className="grid w-full gap-2">
                    <label htmlFor={`rename-${route.id}`} className="text-sm font-semibold">
                      Route name
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id={`rename-${route.id}`}
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        maxLength={MAX_NAME_LENGTH}
                        autoFocus
                        aria-invalid={Boolean(renameError)}
                        className={`min-w-0 flex-1 rounded-md border bg-bg px-3 py-2 ${renameError ? 'border-bad' : 'border-line'}`}
                      />
                      <button type="submit" className="cursor-pointer rounded-md bg-bike px-3 py-2 text-sm font-semibold text-surface hover:opacity-90">
                        Save name
                      </button>
                      <button type="button" onClick={() => setRenamingId(null)} className="cursor-pointer text-sm text-muted underline hover:text-ink">
                        Cancel
                      </button>
                    </div>
                    {renameError && (
                      <p role="alert" className="text-sm text-bad">
                        {renameError}
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {route.name}
                        {route.is_active && <span className="ml-2 font-mono text-xs font-medium text-bike">Active</span>}
                      </p>
                      <p className="text-sm text-muted">About {milesBetween(start, end).toFixed(1)} miles apart</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {confirmingDeleteId === route.id ? (
                        <>
                          <span>Delete {route.name}?</span>
                          <button onClick={() => void deleteRoute(route.id)} className="cursor-pointer font-semibold text-bad underline">
                            Delete route
                          </button>
                          <button onClick={() => setConfirmingDeleteId(null)} className="cursor-pointer text-muted underline">
                            Keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startRename(route)} className="cursor-pointer text-muted underline hover:text-ink">
                            Rename
                          </button>
                          <button onClick={() => setConfirmingDeleteId(route.id)} className="cursor-pointer text-muted underline hover:text-ink">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding || routes.length === 0 ? (
        <RouteForm
          isFirst={routes.length === 0}
          onSaved={() => {
            setAdding(false);
            void loadRoutes();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <button
            onClick={() => setAdding(true)}
            className="cursor-pointer rounded-md bg-bike px-4 py-2 font-semibold text-surface hover:opacity-90"
          >
            Add a route
          </button>
        </div>
      )}
    </main>
  );
}

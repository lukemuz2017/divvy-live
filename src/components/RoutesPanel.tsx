import { routeEnds } from '@/lib/live-data';
import type { Route } from '@/lib/live-data';
import { milesBetween } from '@/lib/scoring';

export function RoutesPanel({
  routes,
  confirmingDeleteId,
  onUse,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onClose,
}: {
  routes: Route[];
  confirmingDeleteId: string | null;
  onUse: (routeId: string) => void;
  onAskDelete: (routeId: string) => void;
  onCancelDelete: () => void;
  onDelete: (routeId: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg font-bold">Saved routes</h2>
          <p className="text-sm text-muted">We don’t store your addresses, so each route shows the distance between its ends.</p>
        </div>
        <button onClick={onClose} className="shrink-0 cursor-pointer text-sm text-muted underline hover:text-ink">
          Close
        </button>
      </div>
      <ul className="grid">
        {routes.map((route) => {
          const { start, end } = routeEnds(route);
          return (
            <li key={route.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {route.name}
                  {route.is_active && <span className="ml-2 font-mono text-xs font-medium text-bike">Active</span>}
                </p>
                <p className="text-sm text-muted">About {milesBetween(start, end).toFixed(1)} miles apart</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {confirmingDeleteId === route.id ? (
                  <>
                    <span>Delete {route.name}?</span>
                    <button onClick={() => onDelete(route.id)} className="cursor-pointer font-semibold text-bad underline">
                      Delete route
                    </button>
                    <button onClick={onCancelDelete} className="cursor-pointer text-muted underline">
                      Keep it
                    </button>
                  </>
                ) : (
                  <>
                    {!route.is_active && (
                      <button
                        onClick={() => onUse(route.id)}
                        className="cursor-pointer rounded-md border border-line px-3 py-1 font-semibold hover:border-bike"
                      >
                        Use this route
                      </button>
                    )}
                    <button onClick={() => onAskDelete(route.id)} className="cursor-pointer text-muted underline hover:text-ink">
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

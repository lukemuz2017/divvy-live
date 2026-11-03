import { formatMiles } from '@/lib/scoring';
import type { Point, Priority, Recommendation } from '@/lib/scoring';
import { TripMap } from './TripMap';

export const VIEWS: { value: Priority; label: string; description: string }[] = [
  { value: 'balanced', label: 'Best balance', description: 'Weighs helping rebalance bikes and keeping your walk short equally.' },
  { value: 'walk', label: 'Shortest walk', description: 'The closest stations with a bike to take and a dock to return it to.' },
  { value: 'points', label: 'Most points', description: 'The stations that need the most help, within a half-mile walk of each end.' },
];

// The one trip card. The toggle switches which kind of trip it shows, and the lists below follow it.
export function TripCard({
  view,
  onViewChange,
  pickup,
  dropoff,
  start,
  end,
  choosing,
  onChoose,
}: {
  view: Priority;
  onViewChange: (view: Priority) => void;
  pickup: Recommendation | undefined;
  dropoff: Recommendation | undefined;
  start: Point;
  end: Point;
  choosing: boolean;
  onChoose: (pickup: Recommendation, dropoff: Recommendation) => void;
}) {
  const current = VIEWS.find((option) => option.value === view) ?? VIEWS[0];

  return (
    <section className="grid gap-5 rounded-lg border-2 border-bike bg-surface p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="grid content-start gap-4">
        <div className="grid gap-3">
          <h2 className="text-2xl font-bold">Recommended trip</h2>
          <div role="group" aria-label="What to recommend" className="flex w-fit flex-wrap overflow-hidden rounded-md border border-line text-sm">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                onClick={() => onViewChange(option.value)}
                aria-pressed={view === option.value}
                className={`cursor-pointer px-3 py-1.5 font-semibold ${view === option.value ? 'bg-bike text-surface' : 'bg-bg text-muted hover:text-ink'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{current.description}</p>
        </div>

        {pickup && dropoff ? (
          <>
            <dl className="flex gap-8">
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted">Points</dt>
                <dd className="font-mono text-3xl font-medium text-bike">+{pickup.points + dropoff.points}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs text-muted">Total walking</dt>
                <dd className="font-mono text-3xl font-medium">{formatMiles(pickup.miles + dropoff.miles)}</dd>
              </div>
            </dl>
            <div className="grid min-w-0 gap-1 text-lg font-semibold text-balance">
              <p>
                <span className="font-normal text-muted">From </span>
                {pickup.station.name}
              </p>
              <p>
                <span className="font-normal text-muted">to </span>
                {dropoff.station.name}
              </p>
            </div>
            <button
              onClick={() => onChoose(pickup, dropoff)}
              disabled={choosing}
              className="cursor-pointer justify-self-start rounded-md bg-bike px-4 py-2 font-semibold text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {choosing ? 'Saving…' : 'Choose this trip'}
            </button>
          </>
        ) : (
          <p className="text-muted">We can’t recommend a full trip right now. See what’s available below.</p>
        )}
      </div>
      {pickup && dropoff && (
        <TripMap
          start={start}
          pickup={pickup.station}
          dropoff={dropoff.station}
          end={end}
          pickupName={pickup.station.name.trim()}
          dropoffName={dropoff.station.name.trim()}
        />
      )}
    </section>
  );
}

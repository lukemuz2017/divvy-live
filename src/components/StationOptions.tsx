import type { Recommendation } from '@/lib/scoring';
import { DockMeter } from './DockMeter';

function countsLabel(option: Recommendation): string {
  const { bikes, ebikes, docks } = option.status;
  const bikeWord = bikes === 1 ? 'bike' : 'bikes';
  const dockWord = docks === 1 ? 'open dock' : 'open docks';
  return `${bikes} ${bikeWord} (${ebikes} electric), ${docks} ${dockWord}`;
}

export function StationOptions({
  title,
  options,
  changeCounts,
  emptyMessage,
}: {
  title: string;
  options: Recommendation[];
  changeCounts: Map<string, number>;
  emptyMessage: string;
}) {
  return (
    <section className="grid content-start gap-3">
      <h3 className="font-bold">{title}</h3>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ol className="grid gap-2">
          {options.map((option, index) => {
            const changes = changeCounts.get(option.station.station_id) ?? 0;
            return (
              <li
                // A new key replays the flash each time Realtime delivers a change for this station.
                key={`${option.station.station_id}-${changes}`}
                className={`grid gap-2 rounded-lg border border-line bg-surface p-3 ${changes > 0 ? 'station-changed' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-semibold">
                    <span className="mr-2 font-mono text-sm font-normal text-muted">{index + 1}</span>
                    {option.station.name}
                  </p>
                  <p className="shrink-0 font-mono font-medium text-bike">+{option.points} pts</p>
                </div>
                <DockMeter bikes={option.status.bikes} docks={option.status.docks} />
                <p className="text-sm text-muted">
                  {countsLabel(option)}, about {option.walkMinutes} min walk
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

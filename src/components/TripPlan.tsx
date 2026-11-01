import { formatMiles } from '@/lib/scoring';
import type { Recommendation } from '@/lib/scoring';
import { StationOptions } from './StationOptions';
import type { Measure } from './StationOptions';

export function TripPlan({
  title,
  description,
  measure,
  pickups,
  dropoffs,
  changeCounts,
  note,
  pickupEmptyMessage,
  dropoffEmptyMessage,
}: {
  title: string;
  description: string;
  measure: Measure;
  pickups: Recommendation[];
  dropoffs: Recommendation[];
  changeCounts: Map<string, number>;
  note?: string;
  pickupEmptyMessage: string;
  dropoffEmptyMessage: string;
}) {
  const pickup = pickups[0];
  const dropoff = dropoffs[0];

  const pointsStat = pickup && dropoff && (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">Points</dt>
      <dd className="font-mono text-2xl font-medium text-bike">+{pickup.points + dropoff.points}</dd>
    </div>
  );
  const walkingStat = pickup && dropoff && (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted">Total walking</dt>
      <dd className="font-mono text-2xl font-medium">{formatMiles(pickup.miles + dropoff.miles)}</dd>
    </div>
  );

  return (
    <section className="grid content-start gap-5">
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-1">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        {pickup && dropoff ? (
          <>
            <div className="grid gap-1 font-semibold text-balance">
              <p>
                <span className="font-normal text-muted">From </span>
                {pickup.station.name}
              </p>
              <p>
                <span className="font-normal text-muted">to </span>
                {dropoff.station.name}
              </p>
            </div>
            <dl className="flex gap-8">
              {measure === 'points' ? pointsStat : walkingStat}
              {measure === 'points' ? walkingStat : pointsStat}
            </dl>
            {note && <p className="text-sm text-muted">{note}</p>}
          </>
        ) : (
          <p className="text-muted">We can’t recommend a full trip right now. See what’s available below.</p>
        )}
      </div>

      <StationOptions title="Pick up" options={pickups} measure={measure} changeCounts={changeCounts} emptyMessage={pickupEmptyMessage} />
      <StationOptions title="Drop off" options={dropoffs} measure={measure} changeCounts={changeCounts} emptyMessage={dropoffEmptyMessage} />
    </section>
  );
}

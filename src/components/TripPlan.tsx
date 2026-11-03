import { formatMiles } from '@/lib/scoring';
import type { Point, Priority, Recommendation } from '@/lib/scoring';
import { StationOptions } from './StationOptions';
import { TripMap } from './TripMap';
import type { Measure } from './StationOptions';

const RECOMMENDED_DESCRIPTION: Record<Priority, string> = {
  walk: 'Favors a shorter walk over points, based on your setting for this direction.',
  balanced: 'The best balance of helping rebalance bikes and keeping your walk short, right now.',
  points: 'Favors more points over a shorter walk, based on your setting for this direction.',
};

function ChooseTripButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="cursor-pointer justify-self-start rounded-md bg-bike px-4 py-2 font-semibold text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? 'Saving…' : 'Choose this trip'}
    </button>
  );
}

export function RecommendedTrip({
  pickup,
  dropoff,
  start,
  end,
  priority,
  choosing,
  onChoose,
}: {
  pickup: Recommendation;
  dropoff: Recommendation;
  start: Point;
  end: Point;
  priority: Priority;
  choosing: boolean;
  onChoose: (pickup: Recommendation, dropoff: Recommendation) => void;
}) {
  return (
    <section className="grid gap-5 rounded-lg border-2 border-bike bg-surface p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="grid content-start gap-4">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Recommended trip</h2>
          <p className="text-sm text-muted">{RECOMMENDED_DESCRIPTION[priority]}</p>
        </div>
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
        <ChooseTripButton busy={choosing} onClick={() => onChoose(pickup, dropoff)} />
      </div>
      <TripMap
        start={start}
        pickup={pickup.station}
        dropoff={dropoff.station}
        end={end}
        pickupName={pickup.station.name.trim()}
        dropoffName={dropoff.station.name.trim()}
      />
    </section>
  );
}

export function TripPlan({
  title,
  measure,
  pickups,
  dropoffs,
  pickupsInBoth,
  dropoffsInBoth,
  changeCounts,
  note,
  pickupEmptyMessage,
  dropoffEmptyMessage,
  choosing,
  onChoose,
}: {
  title: string;
  measure: Measure;
  pickups: Recommendation[];
  dropoffs: Recommendation[];
  pickupsInBoth: Set<string>;
  dropoffsInBoth: Set<string>;
  changeCounts: Map<string, number>;
  note?: string;
  pickupEmptyMessage: string;
  dropoffEmptyMessage: string;
  choosing: boolean;
  onChoose: (pickup: Recommendation, dropoff: Recommendation) => void;
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
        <h2 className="sr-only">{title}</h2>
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
            <ChooseTripButton busy={choosing} onClick={() => onChoose(pickup, dropoff)} />
          </>
        ) : (
          <p className="text-muted">We can’t recommend a full trip right now. See what’s available below.</p>
        )}
      </div>

      <StationOptions
        title="Pick up"
        options={pickups}
        measure={measure}
        bestOfBoth={pickupsInBoth}
        changeCounts={changeCounts}
        emptyMessage={pickupEmptyMessage}
      />
      <StationOptions
        title="Drop off"
        options={dropoffs}
        measure={measure}
        bestOfBoth={dropoffsInBoth}
        changeCounts={changeCounts}
        emptyMessage={dropoffEmptyMessage}
      />
    </section>
  );
}

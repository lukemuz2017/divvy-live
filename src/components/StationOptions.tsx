'use client';

import { useId, useState } from 'react';
import { formatMiles } from '@/lib/scoring';
import type { Recommendation } from '@/lib/scoring';
import { DockMeter } from './DockMeter';

// Which number to highlight on each row. Best balance highlights neither, since it weighs both.
export type Measure = 'points' | 'miles' | 'both';

function countsLabel(option: Recommendation): string {
  const { bikes, ebikes, docks } = option.status;
  const bikeWord = bikes === 1 ? 'bike' : 'bikes';
  const dockWord = docks === 1 ? 'open dock' : 'open docks';
  return `${bikes} ${bikeWord} (${ebikes} electric), ${docks} ${dockWord}`;
}

function StationOption({
  option,
  rank,
  measure,
  changes,
}: {
  option: Recommendation;
  rank: number;
  measure: Measure;
  changes: number;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const points = `+${option.points} pts`;
  const miles = formatMiles(option.miles);

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* A new key replays the flash each time Realtime delivers a change, while the open state above it survives. */}
      <div key={changes} className={changes > 0 ? 'station-changed' : ''}>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left"
        >
          <span className="min-w-0 font-semibold">
            <span className="mr-2 font-mono text-sm font-normal text-muted">{rank}</span>
            {option.station.name}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-sm whitespace-nowrap">
              <span className={measure === 'miles' ? 'text-muted' : 'font-medium text-bike'}>{points}</span>
              <span className="text-muted"> · </span>
              <span className={measure === 'points' ? 'text-muted' : 'font-medium text-ink'}>{miles}</span>
            </span>
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            >
              <path d="m3 6 5 5 5-5" />
            </svg>
          </span>
        </button>
        <div id={detailsId} hidden={!open} className="grid gap-2 px-3 pb-3">
          <DockMeter bikes={option.status.bikes} docks={option.status.docks} />
          <p className="text-sm text-muted">{countsLabel(option)}</p>
          <p className="text-sm text-muted">
            About {option.walkMinutes} min walk
          </p>
        </div>
      </div>
    </li>
  );
}

export function StationOptions({
  title,
  options,
  measure,
  changeCounts,
  emptyMessage,
}: {
  title: string;
  options: Recommendation[];
  measure: Measure;
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
          {options.map((option, index) => (
            <StationOption
              key={option.station.station_id}
              option={option}
              rank={index + 1}
              measure={measure}
              changes={changeCounts.get(option.station.station_id) ?? 0}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

import { stationsInRange, MAX_WALK_MILES, pickupPoints, dropoffPoints } from '@/lib/scoring';
import type { Point, Recommendation, Station, StationStatus } from '@/lib/scoring';

// A simple drawn map: Chicago's street grid runs 8 blocks to the mile, counted from State and Madison,
// so lines every eighth of a mile line up roughly with real blocks. No map service is needed.
const SIZE = 300;
const MILES_ACROSS = 1.2;
const PX_PER_MILE = SIZE / MILES_ACROSS;
const MILES_PER_DEGREE_LAT = 69;
const BLOCK_MILES = 1 / 8;
const GRID_ORIGIN = { lat: 41.8819, lon: -87.6278 };

type Kind = 'pickup' | 'dropoff';

function isUsable(status: StationStatus | undefined, kind: Kind) {
  if (!status) return false;
  return kind === 'pickup' ? status.is_renting && status.bikes >= 1 : status.is_returning && status.docks >= 1;
}

export function BlockMap({
  title,
  center,
  kind,
  stations,
  statuses,
  recommended,
  numbered,
}: {
  title: string;
  center: Point;
  kind: Kind;
  stations: Station[];
  statuses: Map<string, StationStatus>;
  recommended: Recommendation | null;
  numbered: Recommendation[];
}) {
  const lonMiles = Math.cos((center.lat * Math.PI) / 180) * MILES_PER_DEGREE_LAT;
  const project = (p: Point) => ({
    x: SIZE / 2 + (p.lon - center.lon) * lonMiles * PX_PER_MILE,
    y: SIZE / 2 - (p.lat - center.lat) * MILES_PER_DEGREE_LAT * PX_PER_MILE,
  });

  // Grid lines at whole blocks from the origin, so they stay put as the map recenters.
  const eastOfOrigin = (center.lon - GRID_ORIGIN.lon) * lonMiles;
  const northOfOrigin = (center.lat - GRID_ORIGIN.lat) * MILES_PER_DEGREE_LAT;
  const lines = (offset: number) => {
    const half = MILES_ACROSS / 2;
    const first = Math.ceil((offset - half) / BLOCK_MILES);
    const last = Math.floor((offset + half) / BLOCK_MILES);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const block = first + i;
      return { position: (block * BLOCK_MILES - offset) * PX_PER_MILE, major: block % 8 === 0 };
    });
  };

  const inRange = stationsInRange(stations, center);
  const you = project(center);
  const target = recommended ? project(recommended.station) : null;
  const score = kind === 'pickup' ? pickupPoints : dropoffPoints;
  const label = `${title}: ${inRange.length} stations within half a mile${recommended ? `, recommended ${recommended.station.name}` : ''}`;

  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="block-map w-full rounded-lg border border-line bg-surface">
        {lines(eastOfOrigin).map((line) => (
          <line
            key={`v${line.position}`}
            x1={SIZE / 2 + line.position}
            x2={SIZE / 2 + line.position}
            y1={0}
            y2={SIZE}
            className={line.major ? 'stroke-dock' : 'stroke-line'}
            strokeWidth={line.major ? 2 : 1}
          />
        ))}
        {lines(northOfOrigin).map((line) => (
          <line
            key={`h${line.position}`}
            y1={SIZE / 2 - line.position}
            y2={SIZE / 2 - line.position}
            x1={0}
            x2={SIZE}
            className={line.major ? 'stroke-dock' : 'stroke-line'}
            strokeWidth={line.major ? 2 : 1}
          />
        ))}

        <circle cx={you.x} cy={you.y} r={MAX_WALK_MILES * PX_PER_MILE} className="fill-none stroke-muted" strokeWidth={1.5} strokeDasharray="5 5" />

        {target && (
          <line x1={you.x} y1={you.y} x2={target.x} y2={target.y} className="map-walk stroke-bike" strokeWidth={2.5} strokeDasharray="6 6" />
        )}

        {inRange.map((station) => {
          const status = statuses.get(station.station_id);
          const usable = isUsable(status, kind);
          const { x, y } = project(station);
          const points = status && usable ? score(status) : 0;
          return (
            <circle key={station.station_id} cx={x} cy={y} r={5} className={usable ? 'fill-bike' : 'fill-dock'} fillOpacity={usable ? 0.25 + (points / 10) * 0.75 : 0.6}>
              <title>{`${station.name.trim()}: ${status ? `${status.bikes} bikes, ${status.docks} open docks` : 'no data'}`}</title>
            </circle>
          );
        })}

        {target && (
          <g>
            <circle cx={target.x} cy={target.y} r={14} className="live-pulse fill-none stroke-bike" strokeWidth={3} />
            <circle cx={target.x} cy={target.y} r={5} className="fill-bike" />
          </g>
        )}

        {numbered.map((option, index) => {
          const { x, y } = project(option.station);
          return (
            <g key={`n${option.station.station_id}`}>
              <circle cx={x} cy={y} r={9} className="fill-surface stroke-bike" strokeWidth={2} />
              <text x={x} y={y + 4} textAnchor="middle" className="fill-ink font-mono text-[11px] font-medium">
                {index + 1}
              </text>
            </g>
          );
        })}


        <rect x={you.x - 7} y={you.y - 7} width={14} height={14} rx={2} className="fill-ink stroke-surface" strokeWidth={2} />
      </svg>
    </figure>
  );
}

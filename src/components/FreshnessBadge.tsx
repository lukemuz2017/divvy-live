import type { Freshness, WorkerRun } from '@/lib/scoring';

// Minutes only: counting seconds makes normal minute-to-minute updates look like a problem.
export function timeAgo(iso: string | number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

const STYLES: Record<Freshness, { dot: string; text: string }> = {
  loading: { dot: 'bg-dock', text: 'text-muted' },
  fresh: { dot: 'bg-good live-pulse', text: 'text-good' },
  delayed: { dot: 'bg-warn', text: 'text-warn' },
  stale: { dot: 'bg-warn', text: 'text-warn' },
  down: { dot: 'bg-bad', text: 'text-bad' },
};

export function FreshnessBadge({ freshness, run, now }: { freshness: Freshness; run: WorkerRun | null; now: number }) {
  const label = {
    loading: 'Connecting',
    fresh: 'Live',
    delayed: run ? `Delayed, last checked ${timeAgo(run.ran_at, now)}` : 'Delayed',
    stale: run ? `Out of date, last checked ${timeAgo(run.ran_at, now)}` : 'Waiting for data',
    down: 'Divvy check failed',
  }[freshness];

  return (
    <p className={`flex items-center gap-2 font-mono text-xs ${STYLES[freshness].text}`} role="status">
      <span className={`size-2 shrink-0 rounded-full ${STYLES[freshness].dot}`} aria-hidden="true" />
      {label}
    </p>
  );
}

export function FreshnessBanner({ freshness, run, now }: { freshness: Freshness; run: WorkerRun | null; now: number }) {
  if (freshness === 'stale') {
    return (
      <section className="grid gap-1 rounded-lg bg-warn-soft p-4 text-warn">
        <h2 className="font-semibold">Bike counts may be out of date</h2>
        <p className="text-sm">
          {run ? `The last check was ${timeAgo(run.ran_at, now)}. ` : 'No check has run yet. '}
          We’ve hidden recommendations so we don’t send you to an empty station. They’ll come back on their own.
        </p>
      </section>
    );
  }
  if (freshness === 'down') {
    return (
      <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad">
        <h2 className="font-semibold">We can’t get bike counts from Divvy right now</h2>
        <p className="text-sm">
          The last check failed {run ? timeAgo(run.ran_at, now) : ''}. We’ve hidden recommendations until a check
          succeeds, and we’ll keep trying every minute.
        </p>
      </section>
    );
  }
  return null;
}

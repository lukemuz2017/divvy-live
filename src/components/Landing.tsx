import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { DockMeter } from './DockMeter';

export function Landing() {
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:items-center md:py-24">
      <section className="grid gap-5">
        <p className="font-mono text-sm text-muted">Divvy Live</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl">
          Ride your commute. Move a bike where it’s needed.
        </h1>
        <p className="max-w-[55ch] text-lg text-muted">
          Save the routes you ride. We’ll show you the best stations near each end, with more points for taking a bike
          from a full station and returning it to an empty one.
        </p>
        <div className="flex flex-wrap gap-3">
          <SignUpButton mode="modal">
            <button className="cursor-pointer rounded-md bg-bike px-5 py-3 font-semibold text-surface hover:opacity-90">
              Create an account
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="cursor-pointer rounded-md border border-line bg-surface px-5 py-3 font-semibold hover:border-bike">
              Sign in
            </button>
          </SignInButton>
        </div>
      </section>

      <aside className="grid gap-5 rounded-lg border border-line bg-surface p-5" aria-label="Example recommendation">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Example</p>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">Pick up at a full station</p>
            <p className="font-mono font-medium text-bike">+9 pts</p>
          </div>
          <DockMeter bikes={13} docks={2} />
          <p className="text-sm text-muted">13 bikes, 2 open docks, 4 min walk</p>
        </div>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">Drop off at an empty station</p>
            <p className="font-mono font-medium text-bike">+8 pts</p>
          </div>
          <DockMeter bikes={3} docks={12} />
          <p className="text-sm text-muted">3 bikes, 12 open docks, 6 min walk</p>
        </div>
      </aside>

      <p className="text-sm text-muted md:col-span-2">
        A class project using Divvy’s public data. Not affiliated with Divvy or Lyft.
      </p>
    </main>
  );
}

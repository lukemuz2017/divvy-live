// Draws a station as its row of docks, filled with bikes. Big stations scale down to keep one line.
export function DockMeter({ bikes, docks }: { bikes: number; docks: number }) {
  const usable = bikes + docks;
  const bikeShare = usable === 0 ? 0 : (bikes / usable) * 100;

  return (
    <div
      role="img"
      aria-label={`${bikes} bikes and ${docks} open docks`}
      className="flex h-2.5 overflow-hidden rounded-sm bg-dock"
    >
      <div className="bg-bike transition-[width] duration-700" style={{ width: `${bikeShare}%` }} />
    </div>
  );
}

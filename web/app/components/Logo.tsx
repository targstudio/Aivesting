export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-gradient-to-br from-chart-1 to-chart-2 font-extrabold tracking-tighter text-on-primary"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-label="AI.vesting"
    >
      AI
    </span>
  );
}

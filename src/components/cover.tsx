/**
 * Cover art — every project is a book on the shelf.
 * `Cover` paints the palette gradient + a deterministic decorative pattern,
 * so each thumbnail is distinct without any image assets.
 */
import type { ReactNode } from "react";
import { CoverTheme, patternFor } from "@/lib/palettes";
import { cx } from "@/lib/utils";

export function CoverPattern({ variant }: { variant: number }) {
  const stroke = { stroke: "#FFFFFF", strokeOpacity: 0.13, strokeWidth: 1.2, fill: "none" } as const;
  let art: ReactNode = null;

  switch (variant) {
    case 0: // rings, top right
      art = [18, 38, 58, 78, 98].map((r) => <circle key={r} cx={168} cy={36} r={r} {...stroke} />);
      break;
    case 1: // dot grid
      art = Array.from({ length: 80 }, (_, i) => (
        <circle key={i} cx={14 + (i % 8) * 26} cy={16 + Math.floor(i / 8) * 26} r={1.6} fill="#FFFFFF" fillOpacity={0.16} />
      ));
      break;
    case 2: // diagonals
      art = Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={i * 26 - 80} y1={280} x2={i * 26 + 60} y2={-20} {...stroke} />
      ));
      break;
    case 3: // waves
      art = Array.from({ length: 8 }, (_, i) => {
        const y = 24 + i * 32;
        return <path key={i} d={`M -20 ${y} q 25 -14 50 0 t 50 0 t 50 0 t 50 0 t 50 0`} {...stroke} />;
      });
      break;
    case 4: // grid
      art = (
        <>
          {[20, 52, 84, 116, 148, 180].map((x) => <line key={`v${x}`} x1={x} y1={-10} x2={x} y2={270} {...stroke} />)}
          {[20, 52, 84, 116, 148, 180, 212, 244].map((y) => <line key={`h${y}`} x1={-10} y1={y} x2={210} y2={y} {...stroke} />)}
        </>
      );
      break;
    default: // arcs, bottom left
      art = [50, 90, 130, 170, 210].map((r) => <circle key={r} cx={-10} cy={270} r={r} {...stroke} />);
  }

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 200 260"
      preserveAspectRatio="xMidYMid slice"
    >
      {art}
    </svg>
  );
}

export function Cover({
  paletteId,
  seed,
  className,
  contentClassName,
  children,
}: {
  paletteId: string;
  seed: string;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  const theme = CoverTheme.for(paletteId);
  return (
    <div className={cx("relative overflow-hidden", className)} style={theme.coverStyle()}>
      <CoverPattern variant={patternFor(seed)} />
      {/* gentle book lighting */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
      <div className={cx("relative h-full", contentClassName)}>{children}</div>
    </div>
  );
}
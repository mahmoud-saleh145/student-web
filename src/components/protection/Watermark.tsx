'use client';

import * as React from 'react';

/**
 * The web counterpart of the mobile `Watermark`: a server-issued identity
 * (name / account / session tag, from the playback or document ticket) drawn
 * in two layers over protected content.
 *
 *  • a faint, static, tiled layer across the whole frame, so cropping one
 *    corner of a screenshot or a screen recording does not remove it;
 *  • a more visible mark that walks a 3×3 lattice in a shuffled order, so no
 *    single region is ever reliably free of it.
 *
 * A browser cannot block screenshots or screen recording. This does not
 * pretend to: it makes a leaked capture traceable to the account and session
 * that produced it, which is what the watermark is for on the phone too.
 */
const CELLS: { x: number; y: number }[] = [
  { x: 8, y: 10 },
  { x: 50, y: 8 },
  { x: 88, y: 12 },
  { x: 6, y: 48 },
  { x: 52, y: 50 },
  { x: 90, y: 46 },
  { x: 10, y: 84 },
  { x: 48, y: 88 },
  { x: 86, y: 82 },
];

function nextCell(current: number): number {
  let n = current;
  while (n === current) n = Math.floor(Math.random() * CELLS.length);
  return n;
}

export function Watermark({
  primary,
  secondary,
  opacity = 0.5,
  intervalMs = 12_000,
}: {
  primary: string;
  secondary?: string;
  opacity?: number;
  intervalMs?: number;
}) {
  const [cell, setCell] = React.useState(4);
  React.useEffect(() => {
    const id = setInterval(() => setCell((c) => nextCell(c)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const pos = CELLS[cell] ?? CELLS[4]!;
  const tile = secondary ? `${primary} · ${secondary}` : primary;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      <div className="absolute -inset-1/4 flex rotate-[-24deg] flex-wrap content-start gap-x-16 gap-y-14 opacity-[0.09]">
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-[13px] font-semibold text-white mix-blend-difference">
            {tile}
          </span>
        ))}
      </div>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/40 px-2 py-1 text-[11px] font-semibold leading-tight text-white transition-[left,top] duration-700"
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, opacity: Math.min(0.85, Math.max(0.35, opacity)) }}
      >
        <div>{primary}</div>
        {secondary ? <div className="text-[10px] font-normal opacity-80">{secondary}</div> : null}
      </div>
    </div>
  );
}

/**
 * Draws the identity into a rendered document page's pixels, tiled
 * diagonally. An overlay element can be removed in the inspector; text in the
 * canvas bitmap cannot, and it is in every screenshot or print of the page.
 */
export function burnWatermark(context: CanvasRenderingContext2D, width: number, height: number, text: string, scale: number): void {
  if (!text) return;
  context.save();
  context.globalAlpha = 0.1;
  context.fillStyle = '#000000';
  context.font = `600 ${Math.round(14 * scale)}px sans-serif`;
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 7);
  const stepX = Math.max(context.measureText(text).width + 80 * scale, 200 * scale);
  const stepY = 110 * scale;
  const reach = Math.hypot(width, height);
  for (let y = -reach; y < reach; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -reach; x < reach; x += stepX) context.fillText(text, x + offset, y);
  }
  context.restore();
}

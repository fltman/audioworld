import { useEffect, useRef } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { ExperienceEngine, FrameState } from '../services/experience';

interface RadarProps {
  engine: ExperienceEngine;
  frameRef: MutableRefObject<FrameState>;
}

const ACCENT = '#7c5cff';
const PADDING = 30;
const LERP = 0.18;

interface Rendered {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Heading-up spatial radar. You sit at the center; the world is rotated by
 * -heading so "up" is where you face. Each audible source is a glowing blip at
 * its relative azimuth, its distance mapped to the ring, its size/opacity to gain.
 */
export function Radar({ engine, frameRef }: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendered = useRef(new Map<string, Rendered>());

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - PADDING;
      const now = performance.now();
      const frame = frameRef.current;

      ctx.clearRect(0, 0, w, h);

      // Field wash.
      const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      wash.addColorStop(0, 'rgba(124,92,255,0.10)');
      wash.addColorStop(1, 'rgba(124,92,255,0)');
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Range rings.
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(124,92,255,${i === 3 ? 0.35 : 0.14})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cross hairs.
      ctx.strokeStyle = 'rgba(124,92,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();

      // Slow sweep.
      const sweep = (now / 4000) * Math.PI * 2;
      const ex = cx + Math.sin(sweep) * R;
      const ey = cy - Math.cos(sweep) * R;
      const sg = ctx.createLinearGradient(cx, cy, ex, ey);
      sg.addColorStop(0, 'rgba(124,92,255,0.28)');
      sg.addColorStop(1, 'rgba(124,92,255,0)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      drawNorth(ctx, cx, cy, R, frame.headingDeg);

      // Blips.
      const seen = new Set<string>();
      for (const b of frame.blips) {
        seen.add(b.id);
        const rad = (b.az * Math.PI) / 180;
        const ratio = b.audibleRadius > 0 ? clamp01(b.distance / b.audibleRadius) : 0;
        const rr = ratio * R;
        const tx = cx + Math.sin(rad) * rr;
        const ty = cy - Math.cos(rad) * rr;
        const pulse = 1 + 0.18 * Math.sin(now / 320 + b.az) * b.gain;
        const targetSize = (5 + b.gain * 11) * pulse;
        const targetAlpha = 0.45 + 0.55 * clamp01(b.gain);

        const prev = rendered.current.get(b.id);
        const r: Rendered = prev
          ? {
              x: lerp(prev.x, tx, LERP),
              y: lerp(prev.y, ty, LERP),
              size: lerp(prev.size, targetSize, LERP),
              alpha: lerp(prev.alpha, targetAlpha, LERP),
            }
          : { x: tx, y: ty, size: targetSize, alpha: targetAlpha };
        rendered.current.set(b.id, r);

        drawBlip(ctx, r, b.name, b.distance);
      }
      for (const id of rendered.current.keys()) {
        if (!seen.has(id)) rendered.current.delete(id);
      }

      // You.
      ctx.save();
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#eae6ff';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [frameRef]);

  // Drag-to-walk (simulation only).
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!engine.isSim()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    engine.nudgeScreen(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag.current) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={`radar${engine.isSim() ? ' radar--draggable' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

function drawNorth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  heading: number | null
): void {
  // In heading-up view, north sits at azimuth -heading (0 => top when unknown).
  const az = heading == null ? 0 : (-heading + 360) % 360;
  const rad = (az * Math.PI) / 180;
  const nx = cx + Math.sin(rad) * R;
  const ny = cy - Math.cos(rad) * R;

  ctx.save();
  ctx.strokeStyle = heading == null ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)';
  ctx.setLineDash(heading == null ? [4, 4] : []);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = heading == null ? 'rgba(255,255,255,0.4)' : '#ffffff';
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx + Math.sin(rad) * (R + 14), cy - Math.cos(rad) * (R + 14));
  ctx.restore();
}

function drawBlip(
  ctx: CanvasRenderingContext2D,
  r: Rendered,
  name: string,
  distance: number
): void {
  ctx.save();
  ctx.globalAlpha = r.alpha;

  const halo = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.size * 2.2);
  halo.addColorStop(0, 'rgba(124,92,255,0.55)');
  halo.addColorStop(1, 'rgba(124,92,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(r.x, r.y, r.size * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#c9bcff';
  ctx.beginPath();
  ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = Math.min(1, r.alpha + 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(name, r.x, r.y - r.size - 4);
  ctx.fillStyle = 'rgba(201,188,255,0.85)';
  ctx.font = '500 10px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(distance)} m`, r.x, r.y + r.size + 3);

  ctx.restore();
}

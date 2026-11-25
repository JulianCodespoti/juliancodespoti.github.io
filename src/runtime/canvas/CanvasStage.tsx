import { useEffect, useRef, type PointerEvent } from "react";
import { useThemePalette, type ThemePalette } from "../theme";
import { useVisibility } from "../visibility";

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dt: number;
  elapsed: number;
  theme: ThemePalette;
  reducedMotion: boolean;
}

export interface CanvasPointer {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CanvasStage({
  height,
  label,
  running = true,
  cursor,
  touchAction = "manipulation",
  framed = true,
  onFrame,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  height: number;
  label: string;
  running?: boolean;
  cursor?: string;
  touchAction?: "manipulation" | "none";
  framed?: boolean;
  onFrame: (frame: CanvasFrame) => void;
  onPointerDown?: (p: CanvasPointer) => void;
  onPointerMove?: (p: CanvasPointer) => void;
  onPointerUp?: (p: CanvasPointer) => void;
  onPointerLeave?: () => void;
}) {
  const { ref: wrapRef, visible, reducedMotion } = useVisibility();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 640, height });
  const theme = useThemePalette();

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(240, Math.round(rect.width));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: w, height };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        onFrameRef.current({
          ctx,
          width: w,
          height,
          dt: 0,
          elapsed: 0,
          theme: themeRef.current,
          reducedMotion: reducedRef.current,
        });
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height, wrapRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      elapsed += dt;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onFrameRef.current({
        ctx,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        dt: reducedRef.current ? 0 : dt,
        elapsed,
        theme: themeRef.current,
        reducedMotion: reducedRef.current,
      });

      if (visible && running) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    // Always render at least once on state/theme change
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [visible, running, theme]);

  // Immediately redraw reactive (running={false}) canvases whenever parent state updates onFrame
  useEffect(() => {
    if (running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onFrameRef.current({
      ctx,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      dt: 0,
      elapsed: 0,
      theme: themeRef.current,
      reducedMotion: reducedRef.current,
    });
  }, [running, onFrame, theme]);

  const toPointer = (e: PointerEvent<HTMLCanvasElement>): CanvasPointer => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
    };
  };

  return (
    <div
      ref={wrapRef}
      className={framed ? "canvas-stage canvas-stage--framed" : "canvas-stage"}
      style={{ height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ display: "block", cursor: cursor ?? "default", touchAction }}
        onPointerDown={
          onPointerDown
            ? (e) => {
                if (touchAction === "none" || onPointerUp) {
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                }
                onPointerDown(toPointer(e));
              }
            : undefined
        }
        onPointerMove={onPointerMove ? (e) => onPointerMove(toPointer(e)) : undefined}
        onPointerUp={
          onPointerUp
            ? (e) => {
                try {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch {}
                onPointerUp(toPointer(e));
              }
            : undefined
        }
        onPointerCancel={onPointerUp ? (e) => onPointerUp(toPointer(e)) : undefined}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}

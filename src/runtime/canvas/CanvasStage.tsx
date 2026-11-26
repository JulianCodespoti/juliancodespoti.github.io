import { useEffect, useRef, useState, type PointerEvent } from "react";
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
  pointerType: string;
}

export type CanvasHeight = number | ((width: number) => number);

function resolveHeight(height: CanvasHeight, width: number): number {
  return typeof height === "function" ? Math.round(height(width)) : height;
}

export function CanvasStage({
  height,
  label,
  running = true,
  cursor,
  touchAction = "manipulation",
  framed = true,
  onVisibleChange,
  onFrame,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  height: CanvasHeight;
  label: string;
  running?: boolean;
  cursor?: string;
  touchAction?: "manipulation" | "none" | "pan-y";
  framed?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  onFrame: (frame: CanvasFrame) => void;
  onPointerDown?: (p: CanvasPointer) => void;
  onPointerMove?: (p: CanvasPointer) => void;
  onPointerUp?: (p: CanvasPointer) => void;
  onPointerLeave?: () => void;
}) {
  const { ref: wrapRef, visible, reducedMotion } = useVisibility();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialH = resolveHeight(height, 640);
  const [boxHeight, setBoxHeight] = useState(initialH);
  const sizeRef = useRef({ width: 640, height: initialH });
  const elapsedRef = useRef(0);
  const theme = useThemePalette();

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const heightRef = useRef(height);
  heightRef.current = height;

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const onVisibleRef = useRef(onVisibleChange);
  onVisibleRef.current = onVisibleChange;

  useEffect(() => {
    onVisibleRef.current?.(visible);
  }, [visible]);

  const drawSingleFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onFrameRef.current({
      ctx,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      dt: 0,
      elapsed: elapsedRef.current,
      theme: themeRef.current,
      reducedMotion: reducedRef.current,
    });
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(140, Math.round(rect.width));
      const h = resolveHeight(heightRef.current, w);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { width: w, height: h };
      setBoxHeight((prev) => (prev === h ? prev : h));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      drawSingleFrame();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Re-render crisply once webfonts (IBM Plex Sans / Mono) finish loading
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) drawSingleFrame();
      });
    }

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [wrapRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!reducedRef.current) {
        elapsedRef.current += dt;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onFrameRef.current({
        ctx,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        dt: reducedRef.current ? 0 : dt,
        elapsed: elapsedRef.current,
        theme: themeRef.current,
        reducedMotion: reducedRef.current,
      });

      if (visible && running) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [visible, running, theme]);

  // Immediately redraw reactive (running={false}) canvases whenever parent state updates onFrame
  useEffect(() => {
    if (running) return;
    drawSingleFrame();
  }, [running, onFrame, theme]);

  const toPointer = (e: PointerEvent<HTMLCanvasElement>): CanvasPointer => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      pointerType: e.pointerType || "mouse",
    };
  };

  return (
    <div
      ref={wrapRef}
      className={framed ? "canvas-stage canvas-stage--framed" : "canvas-stage"}
      style={{ height: `${boxHeight}px` }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ display: "block", cursor: cursor ?? "default", touchAction }}
        onContextMenu={(e) => {
          if (touchAction === "none") e.preventDefault();
        }}
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

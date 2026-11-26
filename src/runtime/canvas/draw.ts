export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 1,
) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    color: string;
    font: string;
    size?: number;
    weight?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  },
) {
  const size = opts.size ?? 12;
  const weight = opts.weight ?? 500;
  ctx.font = `${weight} ${size}px ${opts.font}`;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "middle";
  ctx.fillText(text, x, y);
}

export function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.56);
  ctx.lineTo(-size * 0.72, 0);
  ctx.lineTo(-size, size * 0.56);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function drawPillBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  opts: {
    bg: string;
    stroke: string;
    color: string;
    font: string;
    size?: number;
    weight?: number;
    padX?: number;
    height?: number;
  },
) {
  const size = opts.size ?? 11;
  const weight = opts.weight ?? 600;
  const padX = opts.padX ?? 8;
  const h = opts.height ?? size + 9;
  ctx.font = `${weight} ${size}px ${opts.font}`;
  const w = ctx.measureText(text).width + padX * 2;
  fillRoundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2, opts.bg, opts.stroke, 1.1);
  drawLabel(ctx, text, cx, cy + 0.5, {
    color: opts.color,
    font: opts.font,
    size,
    weight,
    align: "center",
  });
}

export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
  maxVal: number,
  strokeColor: string,
  fillColor?: string,
) {
  if (values.length < 2) return;
  const stepX = w / (values.length - 1);
  ctx.beginPath();
  values.forEach((val, i) => {
    const px = x + i * stepX;
    const norm = Math.max(0, Math.min(1, val / Math.max(1, maxVal)));
    const py = y + h - norm * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = "round";
  ctx.stroke();

  if (fillColor) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

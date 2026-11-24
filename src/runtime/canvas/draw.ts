export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
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

/**
 * Procedurally drawn livery decal (racing stripes, roundel with race number,
 * sponsor text) so the decal system can be exercised without any assets.
 */
export function makeLiveryDecal(number = "42", accent = "#ff3b1f"): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Twin racing stripes
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.12);
  ctx.fillStyle = accent;
  ctx.fillRect(-size, -150, size * 2, 90);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-size, -40, size * 2, 26);
  ctx.restore();

  // Roundel
  const cx = size / 2;
  const cy = size / 2 + 110;
  ctx.beginPath();
  ctx.arc(cx, cy, 220, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 26;
  ctx.strokeStyle = "#111111";
  ctx.stroke();

  ctx.fillStyle = "#111111";
  ctx.font = "bold 280px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number, cx, cy + 12);

  // Sponsor-ish text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.fillText("LACQUER RACING", cx, size - 120);

  return canvas;
}

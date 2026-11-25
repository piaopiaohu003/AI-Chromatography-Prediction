/* Canvas chromatogram renderer — no external dependencies. */

const COLORS = {
  grid: "rgba(120, 160, 180, 0.10)",
  axis: "rgba(140, 172, 190, 0.35)",
  text: "#7f97a8",
  curve: "#2dd4bf",
  curveSoft: "rgba(45, 212, 191, 0.20)",
  gradient: "rgba(167, 139, 250, 0.75)",
  peak: "#bdf6ee",
  crosshair: "rgba(226, 246, 255, 0.35)",
};

const FONT = '"Inter", "Noto Sans SC", "PingFang SC", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

function niceStep(range, target) {
  const raw = range / Math.max(target, 1);
  const power = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / power;
  let step = 10;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  return step * power;
}

function ceilNice(value) {
  if (!isFinite(value) || value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / power;
  let nice = 10;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  return nice * power;
}

export class ChromatogramChart {
  constructor(canvas, wrap, tooltip) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.result = null;
    this.hoverX = null;
    this.plot = null;
    this.raf = null;

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      this.hoverX = event.clientX - rect.left;
      if (!this.raf) {
        this.raf = requestAnimationFrame(() => {
          this.raf = null;
          this.draw();
        });
      }
    });
    canvas.addEventListener("mouseleave", () => {
      this.hoverX = null;
      this.tooltip.classList.add("hidden");
      this.draw();
    });

    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(wrap);
  }

  setResult(result) {
    this.result = result;
    this.draw();
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  }

  clear() {
    this.result = null;
    this.draw();
  }

  draw() {
    const { ctx } = this;
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = this.wrap.clientWidth || 600;
    const height = this.wrap.clientHeight || 340;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const result = this.result;
    const hasGradient = !!result && Array.isArray(result.composition)
      && Math.max(...result.composition) - Math.min(...result.composition) > 0.5;

    const pad = { top: 26, right: hasGradient ? 52 : 20, bottom: 38, left: 58 };
    const plot = {
      x: pad.left,
      y: pad.top,
      w: Math.max(10, width - pad.left - pad.right),
      h: Math.max(10, height - pad.top - pad.bottom),
    };
    plot.right = plot.x + plot.w;
    plot.bottom = plot.y + plot.h;
    this.plot = plot;

    if (!result || !result.time || result.time.length === 0) {
      this.drawFrame(ctx, plot, 0, 10, 0, 1, hasGradient);
      ctx.fillStyle = COLORS.text;
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("暂无可绘制的数据", plot.x + plot.w / 2, plot.y + plot.h / 2);
      return;
    }

    const times = result.time;
    const signals = result.signal;
    const xMax = times[times.length - 1] || 1;
    let yMaxRaw = 0;
    let yMinRaw = 0;
    for (let i = 0; i < signals.length; i += 1) {
      if (signals[i] > yMaxRaw) yMaxRaw = signals[i];
      if (signals[i] < yMinRaw) yMinRaw = signals[i];
    }
    const yMax = ceilNice(Math.max(yMaxRaw * 1.12, 1));
    const yMin = yMinRaw < -1 ? -ceilNice(-yMinRaw * 1.2) : 0;

    const mapX = (t) => plot.x + (t / xMax) * plot.w;
    const mapY = (v) => plot.bottom - ((v - yMin) / (yMax - yMin)) * plot.h;

    // grid + axes
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const yStep = niceStep(yMax - yMin, 4);
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
      const y = Math.round(mapY(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.fillText(formatNumber(v), plot.x - 9, y);
    }

    const xStep = niceStep(xMax, 6);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = 0; t <= xMax + 1e-9; t += xStep) {
      const x = Math.round(mapX(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.bottom);
      ctx.strokeStyle = "rgba(120, 160, 180, 0.055)";
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatNumber(t), x, plot.bottom + 9);
    }

    // axis lines
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.bottom);
    ctx.lineTo(plot.right, plot.bottom);
    ctx.stroke();

    // axis titles
    ctx.fillStyle = COLORS.text;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("时间 (min)", plot.x + plot.w / 2, plot.bottom + 24);
    ctx.save();
    ctx.translate(14, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("mAU", 0, 0);
    ctx.restore();

    // gradient overlay
    if (hasGradient && Array.isArray(result.composition)) {
      const comp = result.composition;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x, plot.y, plot.w, plot.h);
      ctx.clip();
      ctx.strokeStyle = COLORS.gradient;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < comp.length; i += 1) {
        const px = mapX(times[i]);
        const py = plot.bottom - (comp[i] / 100) * plot.h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.font = `9.5px ${MONO}`;
      ctx.fillStyle = "rgba(167, 139, 250, 0.8)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      [0, 25, 50, 75, 100].forEach((pct) => {
        const py = plot.bottom - (pct / 100) * plot.h;
        ctx.fillText(`${pct}%`, plot.right + 8, py);
      });
      ctx.textBaseline = "top";
      ctx.fillText("%B", plot.right + 8, plot.y - 14);
    }

    // signal curve
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y - 4, plot.w, plot.h + 4);
    ctx.clip();

    const fill = ctx.createLinearGradient(0, plot.y, 0, plot.bottom);
    fill.addColorStop(0, "rgba(45, 212, 191, 0.30)");
    fill.addColorStop(0.55, "rgba(45, 212, 191, 0.10)");
    fill.addColorStop(1, "rgba(45, 212, 191, 0.01)");
    ctx.beginPath();
    ctx.moveTo(mapX(times[0]), mapY(Math.max(yMin, 0)));
    for (let i = 0; i < times.length; i += 1) {
      ctx.lineTo(mapX(times[i]), mapY(signals[i]));
    }
    ctx.lineTo(mapX(times[times.length - 1]), mapY(Math.max(yMin, 0)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < times.length; i += 1) {
      const px = mapX(times[i]);
      const py = mapY(signals[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = COLORS.curve;
    ctx.lineWidth = 1.7;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(45, 212, 191, 0.55)";
    ctx.shadowBlur = 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // peak labels
    if (Array.isArray(result.peaks)) {
      let lastLabelX = -1e9;
      let row = 0;
      const visible = result.peaks.filter((p) => p.visible && p.tr_min != null)
        .sort((a, b) => a.tr_min - b.tr_min);
      ctx.font = `10.5px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      visible.forEach((peak) => {
        const px = mapX(peak.tr_min);
        if (px < plot.x - 2 || px > plot.right + 2) return;
        let apex = -Infinity;
        const center = Math.round((peak.tr_min / xMax) * (times.length - 1));
        for (let i = Math.max(0, center - 3); i <= Math.min(times.length - 1, center + 3); i += 1) {
          apex = Math.max(apex, signals[i]);
        }
        const py = mapY(apex);
        ctx.beginPath();
        ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.peak;
        ctx.fill();
        ctx.strokeStyle = "rgba(8, 14, 19, 0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();

        if (px - lastLabelX < 58) {
          row = (row + 1) % 3;
        } else {
          row = 0;
        }
        lastLabelX = px;
        const label = peak.name.length > 8 ? `${peak.name.slice(0, 8)}…` : peak.name;
        const ly = Math.max(plot.y + 10, py - 9 - row * 13);
        ctx.fillStyle = "rgba(8, 14, 19, 0.72)";
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(px - textWidth / 2 - 4, ly - 10, textWidth + 8, 13);
        ctx.fillStyle = "#d8f6f2";
        ctx.fillText(label, px, ly);
      });
    }

    // crosshair
    if (this.hoverX != null && this.hoverX >= plot.x && this.hoverX <= plot.right) {
      const t = ((this.hoverX - plot.x) / plot.w) * xMax;
      const idx = Math.min(times.length - 1, Math.max(0, Math.round((t / xMax) * (times.length - 1))));
      const px = mapX(times[idx]);
      ctx.strokeStyle = COLORS.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, plot.y);
      ctx.lineTo(px, plot.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      const py = mapY(signals[idx]);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.curve;
      ctx.fill();

      if (this.tooltip) {
        let label = `t ${times[idx].toFixed(2)} min · ${signals[idx].toFixed(1)} mAU`;
        if (hasGradient && result.composition) {
          label += `<br><span>${result.composition[idx].toFixed(0)}% B</span>`;
        }
        if (Array.isArray(result.peaks)) {
          let nearest = null;
          result.peaks.forEach((p) => {
            if (p.visible && p.tr_min != null && Math.abs(p.tr_min - times[idx]) < xMax * 0.012) {
              if (!nearest || Math.abs(p.tr_min - times[idx]) < Math.abs(nearest.tr_min - times[idx])) nearest = p;
            }
          });
          if (nearest) label += `<br><br>${escapeHtml(nearest.name)} · t<sub>R</sub> ${nearest.tr_min.toFixed(2)}`;
        }
        this.tooltip.innerHTML = label;
        this.tooltip.classList.remove("hidden");
        const wrapWidth = this.wrap.clientWidth;
        const left = Math.min(Math.max(px, 70), wrapWidth - 70);
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${Math.max(py - 8, 26)}px`;
      }
    } else if (this.tooltip) {
      this.tooltip.classList.add("hidden");
    }
  }

  drawFrame(ctx, plot, xMin, xMax, yMin, yMax, hasGradient) {
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w, plot.h);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.bottom);
    ctx.lineTo(plot.right, plot.bottom);
    ctx.stroke();
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function formatNumber(value) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  if (Math.abs(value) >= 1) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

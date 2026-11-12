(() => {
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const clock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const calendar = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function create(canvas, { volume = false, averages = false, onInterval }) {
    const panel = canvas.closest(".panel");
    const toolbar = panel.querySelector("[data-chart-toolbar]");
    const summary = panel.querySelector("[data-candle-summary]");
    const buttons = [...toolbar.querySelectorAll("[data-interval]")];
    const zoomIn = toolbar.querySelector('[data-zoom="in"]');
    const zoomOut = toolbar.querySelector('[data-zoom="out"]');
    const zoomReset = toolbar.querySelector('[data-zoom="reset"]');
    let selected = buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0];
    let ms = Number(selected.dataset.ms);
    let candles = [];
    let span = 60;
    let offset = 0;
    let drag = null;
    let hoveredAt = null;

    function limits() {
      const last = candles.at(-1)?._id || 0;
      const first = candles[0]?._id || last;
      const full = Math.max(8, Math.round((last - first) / ms) + 1);
      return { last, full, visible: Math.min(span, full) };
    }

    function showSummary(row) {
      summary.textContent = row
        ? `${ms >= 3600000 ? calendar.format(new Date(row._id)) : clock.format(new Date(row._id))} · 시 ${number.format(row.open)}  고 ${number.format(row.high)}  저 ${number.format(row.low)}  종 ${number.format(row.close)}${volume ? `  거래량 ${number.format(row.volume)}` : ""}`
        : "시가 · 고가 · 저가 · 종가";
    }

    function draw() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.font = "11px system-ui";
      const left = 13, right = width - 52, top = 16, bottom = height - (volume ? 53 : 28);
      const { last, full, visible } = limits();
      offset = clamp(offset, 0, full - visible);
      const end = last + ms - offset * ms;
      const start = end - visible * ms;
      const rows = candles.filter((row) => row._id + ms / 2 >= start && row._id + ms / 2 < end);
      const prices = rows.flatMap((row) => [row.low, row.high]);
      const min = prices.length ? Math.max(0, Math.min(...prices) - 8) : 0;
      const max = prices.length ? Math.min(1000, Math.max(...prices) + 8) : 1000;
      const x = (value) => left + (right - left) * (value - start) / (end - start);
      const y = (value) => bottom - (bottom - top) * (value - min) / (max - min);
      const spacing = (right - left) / visible;
      const bodyWidth = clamp(spacing * .62, 1, 23);
      const maxVolume = Math.max(1, ...rows.map((row) => row.volume || 0));
      ctx.fillStyle = "#a5afbf";
      ctx.strokeStyle = "#282f3d";
      for (let i = 0; i <= 5; i += 1) {
        const value = min + (max - min) * i / 5;
        ctx.beginPath();
        ctx.moveTo(left, y(value));
        ctx.lineTo(right, y(value));
        ctx.stroke();
        ctx.fillText(number.format(value), right + 6, y(value) + 4);
      }
      for (let i = 0; i <= 5; i += 1) {
        const at = start + (end - start) * i / 5;
        ctx.beginPath();
        ctx.moveTo(x(at), top);
        ctx.lineTo(x(at), bottom + (volume ? 30 : 0));
        ctx.stroke();
        if (candles.length && i < 5 && (width > 520 || i % 2 === 0)) {
          ctx.fillText(ms >= 3600000 ? calendar.format(new Date(at)) : clock.format(new Date(at)), x(at), height - 5);
        }
      }
      for (const row of rows) {
        const at = x(row._id + ms / 2);
        ctx.strokeStyle = row.close >= row.open ? "#4cd2ac" : "#f580a0";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(at, y(row.high));
        ctx.lineTo(at, y(row.low));
        ctx.stroke();
        ctx.fillRect(at - bodyWidth / 2, Math.min(y(row.open), y(row.close)), bodyWidth, Math.max(1.5, Math.abs(y(row.open) - y(row.close))));
        if (volume) {
          const h = (row.volume || 0) / maxVolume * 25;
          ctx.globalAlpha = .32;
          ctx.fillRect(at - bodyWidth / 2, bottom + 29 - h, bodyWidth, h);
          ctx.globalAlpha = 1;
        }
      }
      if (averages && rows.length) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();
        for (const [size, color] of [[5, "#f6c557"], [10, "#c08ff6"]]) {
          ctx.beginPath();
          ctx.strokeStyle = color;
          candles.slice(size - 1).forEach((row, index) => {
            const average = candles.slice(index, index + size).reduce((sum, point) => sum + point.close, 0) / size;
            const at = x(row._id + ms / 2);
            if (index) ctx.lineTo(at, y(average));
            else ctx.moveTo(at, y(average));
          });
          ctx.stroke();
        }
        ctx.restore();
      }
      const hovered = hoveredAt == null || drag ? null : rows.reduce((nearest, row) => (
        !nearest || Math.abs(x(row._id + ms / 2) - hoveredAt) < Math.abs(x(nearest._id + ms / 2) - hoveredAt)
          ? row : nearest
      ), null);
      if (hovered) {
        const at = x(hovered._id + ms / 2);
        ctx.strokeStyle = "#77849b";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(at, top);
        ctx.lineTo(at, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      showSummary(hovered || rows.at(-1) || candles.at(-1));
      zoomIn.disabled = !candles.length || visible <= 3;
      zoomOut.disabled = !candles.length || visible >= full;
      zoomReset.disabled = !candles.length || (span === 60 && offset === 0);
    }

    function zoom(factor, anchor) {
      if (!candles.length) return;
      const { full, visible } = limits();
      const next = clamp(Math.round(visible * factor), 3, full);
      offset += (visible - next) * (1 - anchor);
      span = next;
      draw();
    }

    function reset() {
      span = 60;
      offset = 0;
      hoveredAt = null;
      draw();
    }

    for (const button of buttons) button.addEventListener("click", () => {
      if (button !== selected) {
        selected = button;
        ms = Number(button.dataset.ms);
        candles = [];
        for (const item of buttons) item.setAttribute("aria-pressed", String(item === button));
        toolbar.querySelector("[data-interval-menu]").textContent = button.closest("details") ? `더 보기 · ${button.textContent}` : "더 보기";
        reset();
        onInterval?.(button.dataset.interval);
      }
      const details = button.closest("details");
      if (details) details.open = false;
    });
    zoomIn.addEventListener("click", () => zoom(.72, .6));
    zoomOut.addEventListener("click", () => zoom(1.42, .6));
    zoomReset.addEventListener("click", reset);
    canvas.addEventListener("wheel", (event) => {
      if (!candles.length || !event.deltaY) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? .85 : 1.18, clamp(event.offsetX / canvas.clientWidth, 0, 1));
    }, { passive: false });
    canvas.addEventListener("pointerdown", (event) => {
      if (!candles.length || event.button !== 0) return;
      drag = { x: event.clientX, offset };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      hoveredAt = event.offsetX;
      if (drag) offset = drag.offset + (event.clientX - drag.x) * limits().visible / Math.max(1, canvas.clientWidth - 65);
      draw();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
      canvas.addEventListener(type, () => {
        drag = null;
        hoveredAt = null;
        draw();
      });
    }
    new ResizeObserver(draw).observe(canvas);

    return {
      get interval() { return selected.dataset.interval; },
      reset,
      update(rows) {
        if (offset > 0 && candles.length && rows.length) {
          offset += (rows.at(-1)._id - candles.at(-1)._id) / ms;
        }
        candles = rows;
        draw();
      },
    };
  }

  window.MatthsExchangeChart = { create };
})();

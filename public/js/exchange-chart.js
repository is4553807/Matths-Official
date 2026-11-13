(() => {
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const clock = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const calendar = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const left = 13;
  const rightGutter = 58;
  const maxHistory = 5000;
  const rightPad = (span) => Math.min(6, span * .11);

  function create(canvas, { volume = false, averages = false, onInterval, onHistory }) {
    const panel = canvas.closest(".panel");
    const toolbar = panel.querySelector("[data-chart-toolbar]");
    const summary = panel.querySelector("[data-candle-summary]");
    const buttons = [...toolbar.querySelectorAll("[data-interval]")];
    const zoomIn = toolbar.querySelector('[data-zoom="in"]');
    const zoomOut = toolbar.querySelector('[data-zoom="out"]');
    const zoomReset = toolbar.querySelector('[data-zoom="reset"]');
    const scaleAuto = toolbar.querySelector('[data-zoom="auto"]');
    let selected = buttons.find((button) => button.getAttribute("aria-pressed") === "true") || buttons[0];
    let ms = Number(selected.dataset.ms);
    let candles = [];
    let references = [];
    let span = 60;
    let offset = 0;
    let drag = null;
    let hover = null;
    let priceRange = null;
    let renderedRange = [0, 1000];
    let seriesKey;
    let generation = 0;
    let loading = false;
    let historyEnd = false;
    let retainedHistory = false;
    const pointers = new Map();

    function limits() {
      const lastReference = references.at(-1)?.at;
      const referenceBucket = lastReference ? Math.floor(lastReference / ms) * ms : 0;
      const last = Math.max(candles.at(-1)?._id || 0, referenceBucket);
      const first = Math.min(candles[0]?._id ?? last, references[0]?.at ?? last);
      const full = Math.max(8, Math.round((last - first) / ms) + 1);
      const visible = Math.min(span, full);
      const pad = rightPad(visible);
      return { last, full, visible, pad, maxOffset: full - visible + pad };
    }

    function plotWidth() {
      return Math.max(1, canvas.clientWidth - left - rightGutter);
    }

    function pointer(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function anchorAt(x) {
      return clamp((x - left) / plotWidth(), 0, 1);
    }

    function fetchHistory(force = false) {
      const { maxOffset } = limits();
      if (!onHistory || loading || historyEnd || !candles.length || candles.length >= maxHistory ||
          (!force && offset < maxOffset - 3)) return;
      const ticket = generation;
      const before = candles[0]._id;
      loading = true;
      Promise.resolve(onHistory({ before, interval: selected.dataset.interval, seriesKey })).then((rows) => {
        if (ticket !== generation || !Array.isArray(rows)) return;
        const older = rows.filter((row) => row._id < before);
        if (!older.length) historyEnd = true;
        else {
          candles = older.concat(candles);
          retainedHistory = true;
        }
      }).catch(() => {}).finally(() => {
        if (ticket !== generation) return;
        loading = false;
        draw();
      });
    }

    function clearSeries() {
      generation += 1;
      loading = false;
      historyEnd = false;
      retainedHistory = false;
      pointers.clear();
      drag = null;
      candles = [];
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
      const palette = getComputedStyle(canvas);
      const color = (name) => palette.getPropertyValue(name).trim();
      ctx.scale(ratio, ratio);
      ctx.font = "11px system-ui";
      const right = width - rightGutter, top = 16, bottom = height - (volume ? 53 : 28);
      const { last, full, visible, pad, maxOffset } = limits();
      offset = clamp(offset, 0, maxOffset);
      const end = last + (1 + pad - offset) * ms;
      const start = end - visible * ms;
      const rows = candles.filter((row) => row._id + ms / 2 >= start && row._id + ms / 2 < end);
      const previousReference = references.findLast((row) => row.at < start);
      const mid = previousReference ? [{ at: start, price: previousReference.price }] : [];
      mid.push(...references.filter((row) => row.at >= start && row.at < end));
      const prices = rows.flatMap((row) => [row.low, row.high]).concat(mid.flatMap((row) => row.price == null ? [] : [row.price]));
      renderedRange = priceRange || (prices.length
        ? [Math.max(0, Math.min(...prices) - 8), Math.min(1000, Math.max(...prices) + 8)]
        : [0, 1000]);
      const [min, max] = renderedRange;
      const x = (value) => left + (right - left) * (value - start) / (end - start);
      const y = (value) => bottom - (bottom - top) * (value - min) / (max - min);
      const spacing = (right - left) / visible;
      const bodyWidth = clamp(spacing * .62, 1, 23);
      const maxVolume = Math.max(1, ...rows.map((row) => row.volume || 0));
      ctx.fillStyle = color("--muted");
      ctx.strokeStyle = color("--border");
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
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top + (volume ? 30 : 0));
      ctx.clip();
      for (const row of rows) {
        const at = x(row._id + ms / 2);
        ctx.strokeStyle = row.close >= row.open ? color("--bid") : color("--ask");
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
      ctx.strokeStyle = color("--accent");
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      let previous = null;
      for (const point of mid) {
        if (previous !== null) ctx.lineTo(x(point.at), y(previous));
        if (point.price !== null) {
          if (previous === null) ctx.moveTo(x(point.at), y(point.price));
          else ctx.lineTo(x(point.at), y(point.price));
          ctx.fillRect(x(point.at) - 1, y(point.price) - 1, 2, 2);
        }
        previous = point.price;
      }
      ctx.stroke();
      ctx.restore();
      if (averages && rows.length) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();
        for (const [size, lineColor] of [[5, color("--accent")], [10, color("--chart-ma")]]) {
          ctx.beginPath();
          ctx.strokeStyle = lineColor;
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
      const hoverInPlot = hover && !drag && hover.x >= left && hover.x <= right && hover.y >= top && hover.y <= bottom;
      const nearest = hoverInPlot ? rows.reduce((nearest, row) => (
        !nearest || Math.abs(x(row._id + ms / 2) - hover.x) < Math.abs(x(nearest._id + ms / 2) - hover.x)
          ? row : nearest
      ), null) : null;
      const hovered = nearest && (!volume || Math.abs(x(nearest._id + ms / 2) - hover.x) < spacing / 2)
        ? nearest : null;
      if (hovered) {
        const at = x(hovered._id + ms / 2);
        ctx.strokeStyle = color("--chart-crosshair");
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(at, top);
        ctx.lineTo(at, bottom);
        ctx.moveTo(left, hover.y);
        ctx.lineTo(right, hover.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const price = max - (max - min) * (hover.y - top) / (bottom - top);
        ctx.fillStyle = color("--chart-label");
        ctx.fillRect(right + 1, hover.y - 9, rightGutter - 1, 18);
        ctx.fillStyle = color("--chart-label-text");
        ctx.fillText(number.format(price), right + 6, hover.y + 4);
      }
      if (volume && hoverInPlot && !hovered) summary.textContent = "이 구간에는 체결이 없습니다.";
      else showSummary(hovered || rows.at(-1) || candles.at(-1));
      const hasData = candles.length || references.some((row) => row.price !== null);
      zoomIn.disabled = !hasData || visible <= 3;
      zoomOut.disabled = !hasData || (visible >= full && (!onHistory || historyEnd));
      zoomReset.disabled = !hasData || (span === 60 && offset === 0 && !priceRange);
      scaleAuto.setAttribute("aria-pressed", String(!priceRange));
      scaleAuto.disabled = !hasData || !priceRange;
    }

    function zoom(factor, anchor) {
      if (!candles.length && !references.length) return;
      const { full, visible, pad } = limits();
      const requested = visible * factor;
      const next = clamp(requested, 3, full);
      offset += rightPad(next) - pad + (visible - next) * (1 - anchor);
      span = next;
      draw();
      fetchHistory(requested > full);
    }

    function reset() {
      span = 60;
      offset = 0;
      hover = null;
      priceRange = null;
      draw();
    }

    function beginDrag() {
      const points = [...pointers.values()];
      const { visible, pad } = limits();
      if (points.length === 2) {
        const [a, b] = points;
        drag = { mode: "pinch", gap: Math.hypot(a.x - b.x, a.y - b.y), anchor: anchorAt((a.x + b.x) / 2),
          visible, pad, offset };
      } else if (points.length === 1) {
        const [point] = points;
        drag = { mode: point.x >= left + plotWidth() ? "price" : "pan", point, visible, offset, range: renderedRange };
      } else drag = null;
    }

    for (const button of buttons) button.addEventListener("click", () => {
      if (button !== selected) {
        selected = button;
        ms = Number(button.dataset.ms);
        clearSeries();
        for (const item of buttons) item.setAttribute("aria-pressed", String(item === button));
        toolbar.querySelector("[data-interval-menu]").textContent = button.closest("details") ? `더 보기 · ${button.textContent}` : "더 보기";
        reset();
        onInterval?.(button.dataset.interval);
      }
      const details = button.closest("details");
      if (details) details.open = false;
    });
    zoomIn.addEventListener("click", () => zoom(.75, .5));
    zoomOut.addEventListener("click", () => zoom(1.33, .5));
    zoomReset.addEventListener("click", reset);
    scaleAuto.addEventListener("click", () => { priceRange = null; draw(); });
    canvas.addEventListener("dblclick", (event) => {
      if (pointer(event).x < left + plotWidth()) return;
      priceRange = null;
      draw();
    });
    canvas.addEventListener("wheel", (event) => {
      if (!candles.length || (!event.deltaX && !event.deltaY)) return;
      const point = pointer(event);
      if (point.x >= left + plotWidth()) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        offset -= event.deltaX * unit * limits().visible / plotWidth();
        draw();
        fetchHistory();
      } else {
        zoom(Math.exp(clamp(event.deltaY * unit, -320, 320) * .0017), anchorAt(point.x));
      }
    }, { passive: false });
    canvas.addEventListener("pointerdown", (event) => {
      if (!candles.length || (event.pointerType !== "touch" && event.button !== 0) || pointers.size >= 2) return;
      pointers.set(event.pointerId, pointer(event));
      canvas.setPointerCapture(event.pointerId);
      beginDrag();
    });
    canvas.addEventListener("pointermove", (event) => {
      const point = pointer(event);
      hover = point;
      canvas.style.cursor = drag ? (drag.mode === "price" ? "ns-resize" : "grabbing")
        : point.x >= left + plotWidth() ? "ns-resize" : "crosshair";
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, point);
        if (drag?.mode === "pinch") {
          const [a, b] = [...pointers.values()];
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          const full = limits().full;
          const requested = drag.visible * drag.gap / Math.max(10, gap);
          const next = clamp(requested, 3, full);
          if (requested > full) fetchHistory(true);
          offset = drag.offset - drag.pad + rightPad(next) + drag.visible * (1 - drag.anchor)
            - next * (1 - anchorAt((a.x + b.x) / 2));
          span = next;
        } else if (drag?.mode === "price") {
          const height = Math.max(80, canvas.clientHeight - (volume ? 69 : 44));
          const [min, max] = drag.range;
          const at = clamp((drag.point.y - 16) / height, 0, 1);
          const anchor = max - (max - min) * at;
          const size = clamp((max - min) * Math.exp((point.y - drag.point.y) / height), 2, 2000);
          priceRange = [anchor - size * (1 - at), anchor + size * at];
        } else if (drag?.mode === "pan") {
          offset = drag.offset + (point.x - drag.point.x) * drag.visible / plotWidth();
          const dy = point.y - drag.point.y;
          if (drag.vertical || Math.abs(dy) >= 3) {
            drag.vertical = true;
            const [min, max] = drag.range;
            const height = Math.max(80, canvas.clientHeight - (volume ? 69 : 44));
            const shift = clamp(dy * (max - min) / height, -max + 1, 999 - min);
            priceRange = [min + shift, max + shift];
          }
        }
      }
      draw();
      if (drag?.mode === "pan" || drag?.mode === "pinch") fetchHistory();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(type, (event) => {
        if (pointers.delete(event.pointerId)) beginDrag();
        hover = null;
        draw();
      });
    }
    canvas.addEventListener("pointerleave", () => { hover = null; draw(); });
    new ResizeObserver(draw).observe(canvas);
    document.addEventListener("exchange-theme-change", draw);

    return {
      get interval() { return selected.dataset.interval; },
      reset,
      update(rows, key = "", referenceRows = []) {
        references = referenceRows.map((row) => ({ at: Date.parse(row.at), price: row.price }));
        if (key !== seriesKey) {
          seriesKey = key;
          clearSeries();
          reset();
        }
        if (offset > 0 && candles.length && rows.length) {
          const advanced = (rows.at(-1)._id - candles.at(-1)._id) / ms;
          offset += advanced;
          if (drag) drag.offset += advanced;
        }
        if (retainedHistory || offset > 0) {
          const unique = new Map(candles.concat(rows).map((row) => [row._id, row]));
          candles = [...unique.values()].sort((a, b) => a._id - b._id).slice(-maxHistory);
        } else candles = rows;
        draw();
      },
    };
  }

  window.MatthsExchangeChart = { create };
})();

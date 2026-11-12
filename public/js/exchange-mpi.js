(() => {
  const root = document.getElementById("exchange-mpi");
  if (!root) return;
  const get = (id) => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };
  const select = get("mpi-select");
  const canvas = get("mpi-chart");
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  let state = JSON.parse(root.dataset.state);
  let selected = state.market?.id;
  let demo = new URLSearchParams(location.search).get("demo") === "1";
  let request = 0;
  let polling = false;

  function draw() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.font = "11px system-ui";

    const ticks = state.ticks.filter((tick) => Number.isFinite(tick.mpi));
    const values = ticks.map((tick) => tick.mpi);
    const left = 15, right = width - 60, top = 18, bottom = height - 29;
    const min = values.length ? Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10) : 0;
    const max = values.length ? Math.min(1000, Math.ceil((Math.max(...values) + 5) / 10) * 10) : 1000;
    ctx.fillStyle = "#a5afbf";
    ctx.strokeStyle = "#282f3d";
    const y = (value) => top + (bottom - top) * (max - value) / (max - min);

    for (let index = 0; index <= 5; index += 1) {
      const value = max - (max - min) * index / 5;
      ctx.beginPath();
      ctx.moveTo(left, y(value));
      ctx.lineTo(right, y(value));
      ctx.stroke();
      ctx.fillText(number.format(value), right + 7, y(value) + 4);
    }
    if (!ticks.length) return;
    const start = Date.parse(ticks[0].sampledAt);
    const end = Math.max(start + 1000, Date.parse(ticks.at(-1).sampledAt));
    const x = (at) => left + (right - left) * (at - start) / (end - start);

    for (let index = 0; index <= 3; index += 1) {
      const at = start + (end - start) * index / 3;
      ctx.fillText(time.format(new Date(at)), Math.min(x(at), right - 29), height - 6);
    }
    ctx.strokeStyle = state.source === "demo" ? "#f6c557" : "#80a9ff";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ticks.forEach((tick, index) => {
      const point = [x(Date.parse(tick.sampledAt)), y(tick.mpi)];
      if (index) ctx.lineTo(...point);
      else ctx.moveTo(...point);
    });
    ctx.stroke();
    const last = ticks.at(-1);
    ctx.beginPath();
    ctx.arc(x(Date.parse(last.sampledAt)), y(last.mpi), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    const latest = state.ticks.at(-1);
    const isDemo = state.source === "demo";
    const hasValue = Number.isFinite(latest?.mpi);
    const marketKey = state.markets.map((market) => market.id + market.title).join("|");
    if (marketKey !== select.dataset.options) {
      const placeholder = new Option("회차 선택", "");
      placeholder.disabled = true;
      select.replaceChildren(placeholder, ...state.markets.map((market) => new Option(market.title, market.id)));
      select.dataset.options = marketKey;
    }
    select.value = state.market?.id || "";
    get("mpi-select-wrap").hidden = !state.markets.length;
    get("mpi-source-controls").hidden = !state.demoAvailable;
    for (const button of root.querySelectorAll("[data-mpi-source]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mpiSource === state.source));
    }
    text("mpi-market-name", state.market?.title || "맵쓰 주간 모의고사");
    text("mpi-source", isDemo ? "더미 점수 시연" : "30분 지연 · 공식 표본");
    text("mpi-note", isDemo ? "시연용 더미 계정의 점수로 계산한 지수입니다." : "유효 응시자의 평균 원점수를 0–1,000 범위로 표시합니다.");
    text("mpi-value", hasValue ? number.format(latest.mpi) : "—");
    text("mpi-score", hasValue ? `${number.format(latest.mpi / 10)}점` : "—");
    text("mpi-count", latest ? `${latest.populationCount}명 / ${latest.sampleCount}명` : "—");
    text("mpi-time", latest ? time.format(new Date(latest.sampledAt)) : "—");
    get("mpi-empty").hidden = state.ticks.some((tick) => Number.isFinite(tick.mpi));
    draw();
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams();
    if (selected) query.set("market", selected);
    if (demo) query.set("demo", "1");
    try {
      const response = await fetch(`/api/exchange/mpi?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("MPI unavailable");
      const result = await response.json();
      if (version !== request) return;
      state = result;
      text("mpi-connection", "");
      render();
    } catch {
      if (version === request) text("mpi-connection", "연결을 다시 시도하는 중");
    }
  }

  select.addEventListener("change", () => {
    selected = select.value;
    demo = false;
    void refresh();
  });
  for (const button of root.querySelectorAll("[data-mpi-source]")) {
    button.addEventListener("click", () => {
      demo = button.dataset.mpiSource === "demo";
      void refresh();
    });
  }
  new ResizeObserver(draw).observe(canvas);
  render();
  setInterval(() => {
    if (document.hidden || polling) return;
    polling = true;
    void refresh().finally(() => { polling = false; });
  }, 1000);
})();

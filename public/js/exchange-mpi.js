(() => {
  const root = document.getElementById("exchange-mpi");
  if (!root) return;
  const get = (id) => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };
  const select = get("mpi-select");
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  let state = JSON.parse(root.dataset.state);
  let selected = state.market?.id;
  let request = 0;
  let polling = false;

  function seriesFor(data, source) {
    if (data.source === source) return data;
    return source === "demo" ? data.demo : null;
  }

  async function readState(query) {
    const response = await fetch(`/api/exchange/mpi?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("MPI unavailable");
    return response.json();
  }

  function createChart(id, source) {
    return window.MatthsExchangeChart.create(get(id), {
      onInterval: () => { void refresh(); },
      async onHistory({ before, interval, seriesKey }) {
        const [market] = seriesKey.split(":");
        if (!market) return null;
        const query = new URLSearchParams({
          market, before: String(before),
          interval: source === "official" ? interval : officialChart.interval,
          demoInterval: source === "demo" ? interval : demoChart.interval,
        });
        const result = await readState(query);
        if (source === "official" && result.minimumMpiAttempts !== state.minimumMpiAttempts) return null;
        return seriesFor(result, source)?.candles ?? null;
      },
    });
  }

  const officialChart = createChart("mpi-chart", "official");
  const demoChart = createChart("mpi-demo-chart", "demo");

  function sampleCount(latest) {
    return latest ? `${number.format(latest.populationCount)}명 / ${number.format(latest.sampleCount)}명` : "—";
  }

  function render() {
    const official = seriesFor(state, "official");
    const demo = seriesFor(state, "demo");
    const latest = official?.latest;
    const marketKey = state.markets.map((market) => market.id + market.title).join("|");
    if (marketKey !== select.dataset.options) {
      const placeholder = new Option("회차 선택", "");
      placeholder.disabled = true;
      select.replaceChildren(placeholder, ...state.markets.map((market) => new Option(market.title, market.id)));
      select.dataset.options = marketKey;
    }
    select.value = state.market?.id || "";
    get("mpi-select-wrap").hidden = !state.markets.length;
    text("mpi-market-name", state.market?.title || "맵쓰 주간 모의고사");
    text("mpi-value", latest ? number.format(latest.mpi) : "—");
    text("mpi-score", latest ? `${number.format(latest.mpi / 10)}점` : "—");
    text("mpi-count", sampleCount(latest));
    text("mpi-time", latest ? time.format(new Date(latest.sampledAt)) : "—");
    text("mpi-cutoff", latest?.dataCutoffAt ? time.format(new Date(latest.dataCutoffAt)) : "—");
    text("mpi-waiting", state.market
      ? `유효 응시 ${number.format(state.minimumMpiAttempts)}명부터 표시됩니다.`
      : "주간 모의고사 회차가 공개되면 집계가 시작됩니다.");
    get("mpi-empty").hidden = Boolean(official?.candles.length);

    get("mpi-demo-panel").hidden = !demo;
    get("mpi-demo-link").hidden = !demo;
    text("mpi-demo-value", demo?.latest ? number.format(demo.latest.mpi) : "—");
    text("mpi-demo-count", sampleCount(demo?.latest));
    officialChart.update(official?.candles ?? [], latest ? `${state.market.id}:${state.minimumMpiAttempts}` : "");
    demoChart.update(demo?.candles ?? [], demo ? `${state.market.id}:${demo.startedAt}` : "");
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams({ interval: officialChart.interval, demoInterval: demoChart.interval });
    if (selected) query.set("market", selected);
    try {
      const result = await readState(query);
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
    officialChart.reset();
    demoChart.reset();
    void refresh();
  });
  render();
  setInterval(() => {
    if (document.hidden || polling) return;
    polling = true;
    void refresh().finally(() => { polling = false; });
  }, 1000);
})();

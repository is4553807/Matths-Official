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
  const chart = window.MatthsExchangeChart.create(canvas, {
    onInterval: () => { void refresh(); },
    async onHistory({ before, interval, seriesKey }) {
      const [market, source] = seriesKey.split(":");
      if (!market) return null;
      const query = new URLSearchParams({ market, before: String(before), interval });
      const response = await fetch(`/api/exchange/mpi?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("MPI history unavailable");
      const result = await response.json();
      return result.source === source ? result.candles : null;
    },
  });
  let request = 0;
  let polling = false;

  function render() {
    const latest = state.latest;
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
    text("mpi-market-name", state.market?.title || "맵쓰 주간 모의고사");
    text("mpi-source", isDemo ? "시연 데이터" : "30분 지연 · 공식 표본");
    text("mpi-note", isDemo ? "시연용 더미 계정의 점수로 계산한 지수입니다." : "유효 응시자의 평균 원점수를 0–1,000 범위로 표시합니다.");
    text("mpi-value", hasValue ? number.format(latest.mpi) : "—");
    text("mpi-score", hasValue ? `${number.format(latest.mpi / 10)}점` : "—");
    text("mpi-count", latest ? `${latest.populationCount}명 / ${latest.sampleCount}명` : "—");
    text("mpi-time", latest ? time.format(new Date(latest.sampledAt)) : "—");
    get("mpi-empty").hidden = Boolean(state.candles.length);
    chart.update(state.candles, state.market ? `${state.market.id}:${state.source}` : "");
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams({ interval: chart.interval });
    if (selected) query.set("market", selected);
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
    chart.reset();
    void refresh();
  });
  render();
  setInterval(() => {
    if (document.hidden || polling) return;
    polling = true;
    void refresh().finally(() => { polling = false; });
  }, 1000);
})();

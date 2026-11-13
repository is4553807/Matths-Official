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

  async function readState(query) {
    const response = await fetch(`/api/exchange/mpi?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("MPI unavailable");
    return response.json();
  }

  function seriesKey(data) {
    return data.market ? [data.market.id, data.source, data.minimumMpiAttempts, data.startedAt].join("|") : "";
  }

  const chart = window.MatthsExchangeChart.create(get("mpi-chart"), {
    onInterval: () => { void refresh(); },
    async onHistory({ before, interval, seriesKey: current }) {
      const [market] = current.split("|");
      if (!market) return null;
      const result = await readState(new URLSearchParams({ market, before: String(before), interval }));
      return seriesKey(result) === current ? result.candles : null;
    },
  });

  function render() {
    window.MatthsExchangeScenario?.select(state.market);
    const latest = state.latest;
    const marketKey = JSON.stringify(state.markets.map(({ id, title }) => [id, title]));
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
    const botCount = latest?.botPopulationCount ?? 0;
    get("mpi-bot-policy").hidden = !state.market?.botParticipation;
    text("mpi-count", latest ? `${number.format(latest.populationCount)}명${state.market?.botParticipation
      ? ` (학생 ${number.format(latest.populationCount - botCount)} · 봇 ${number.format(botCount)})` : ""}` : "—");
    text("mpi-time", latest ? time.format(new Date(latest.sampledAt)) : "—");
    text("mpi-cutoff", latest?.dataCutoffAt ? time.format(new Date(latest.dataCutoffAt)) : "—");
    text("mpi-waiting", state.market
      ? `${state.market.botParticipation ? "학생과 운영 봇 합계" : "유효 응시"} ${number.format(state.minimumMpiAttempts)}명부터 집계하며, 집계 30분 뒤 공개됩니다.`
      : "주간 모의고사 회차가 공개되면 집계가 시작됩니다.");
    get("mpi-empty").hidden = Boolean(state.candles.length);
    chart.update(state.candles, latest ? seriesKey(state) : "");
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams({ interval: chart.interval });
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

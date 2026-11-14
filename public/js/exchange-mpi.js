(() => {
  const root = document.getElementById("exchange-mpi");
  if (!root) return;
  const get = (id) => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };
  const select = get("mpi-select");
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

  let state = JSON.parse(root.dataset.state);
  let selected = state.market?.id;
  let intervalChosen = new URLSearchParams(location.search).has("interval");
  let request = 0;
  let polling = false;

  async function readState(query) {
    const response = await fetch(`/api/exchange/mpi?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("MPI unavailable");
    return response.json();
  }

  function seriesKey(data) {
    return data.market ? [data.market.id, data.minimumMpiAttempts, data.market.historicalBootstrap === true].join("|") : "";
  }

  const chart = window.MatthsExchangeChart.create(get("mpi-chart"), {
    sourceLabels: { REPLAY: "복원 MPI" },
    onInterval(_code, changed) {
      const wasAutomatic = !intervalChosen;
      intervalChosen = true;
      if (changed || wasAutomatic) void refresh();
    },
    async onHistory({ before, interval, seriesKey: current }) {
      const [market] = current.split("|");
      if (!market) return null;
      const result = await readState(new URLSearchParams({ market, before: String(before), interval }));
      return seriesKey(result) === current ? result.candles : null;
    },
  });

  function render() {
    const latest = state.latest;
    const candles = state.candles || [];
    const historical = state.market?.historicalBootstrap === true;
    const explainBots = state.market?.botParticipation && !historical;
    get("mpi-replay-key").hidden = historical || !(state.market?.replayMpiCount || candles.some((row) => row.source === "REPLAY"));
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
    text("mpi-value", latest?.mpi != null ? number.format(latest.mpi) : "—");
    text("mpi-score", latest?.mpi != null ? `${number.format(latest.mpi / 10)}점` : "—");
    const botCount = latest?.botWeight === 0 ? 0 : latest?.botPopulationCount ?? 0;
    get("mpi-bot-policy").hidden = !explainBots;
    text("mpi-value-label", state.market?.bootstrap && !historical ? "잠정 MPI" : "공개 MPI");
    text("mpi-bot-policy", state.market?.bootstrap
      ? latest?.botWeight == null
        ? "잠정 MPI에는 Exam Bot 점수가 포함될 수 있습니다. 최종 정산은 유효한 학생 성적으로 계산합니다."
        : `Exam Bot 점수 가중치 ${number.format(latest.botWeight * 100)}% · 최종 정산은 유효한 학생 성적 기준`
      : "학생 성적과 운영 봇의 생성 점수를 같은 비중으로 반영합니다.");
    if (explainBots && botCount && latest?.reconstructedBotPopulationCount) {
      get("mpi-bot-policy").textContent += ` · 과거 봇 점수 ${number.format(latest.reconstructedBotPopulationCount)}건 포함`;
    }
    const humanCount = latest?.humanPopulationCount ?? ((latest?.populationCount ?? 0) - botCount);
    text("mpi-count", !latest ? "—" : explainBots && botCount
      ? `학생 ${number.format(humanCount)}명 · 봇 ${number.format(botCount)}명` : `${number.format(latest.populationCount)}명`);
    text("mpi-waiting", latest?.unavailable ? "현재 공개 요건을 충족한 성적이 없습니다." : state.market
      ? `${explainBots && latest?.botWeight !== 0 ? "학생과 운영 봇 합계" : "유효 응시"} ${number.format(state.minimumMpiAttempts)}명부터 집계합니다.`
      : "주간 모의고사 회차가 공개되면 집계가 시작됩니다.");
    get("mpi-empty").hidden = Boolean(candles.length);
    chart.update(candles, seriesKey(state), [], {
      showSources: !historical,
      opensAt: historical ? state.market.opensAt : null,
      throughAt: historical ? Date.parse(state.dataThroughAt) : null,
    });
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams();
    if (intervalChosen) query.set("interval", chart.interval);
    if (selected) query.set("market", selected);
    try {
      const result = await readState(query);
      if (version !== request) return;
      state = result;
      if (!intervalChosen) chart.setInterval(state.interval);
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

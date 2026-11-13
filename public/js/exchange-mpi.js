(() => {
  const root = document.getElementById("exchange-mpi");
  if (!root) return;
  const get = (id) => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };
  const select = get("mpi-select");
  const series = get("mpi-series");
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
      const kind = current.split("|")[1];
      const result = await readState(new URLSearchParams({ market, before: String(before), interval,
        ...(kind === "bot_replay" ? { series: "replay" } : {}) }));
      return seriesKey(result) === current ? result.candles : null;
    },
  });

  function render() {
    const latest = state.latest;
    const replay = state.source === "bot_replay";
    series.hidden = !state.market?.replayMpiCount;
    if (series.hidden) series.value = "official";
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
    const botCount = latest?.botPopulationCount ?? (replay ? latest?.populationCount : 0) ?? 0;
    get("mpi-bot-policy").hidden = !state.market?.botParticipation;
    text("mpi-value-label", replay ? "과거 봇 MPI 재생" : state.market?.bootstrap ? "잠정 MPI · 30분 지연" : "공개 MPI · 30분 지연");
    text("mpi-bot-policy", replay
      ? `과거 봇 점수로 재생한 지수 · 복원 ${state.market?.replayRecordedAt ? time.format(new Date(state.market.replayRecordedAt)) + " KST" : "—"}`
      : state.market?.bootstrap
      ? `공개 표본의 Exam Bot 가중치 ${latest?.botWeight == null ? "—" : number.format(latest.botWeight * 100) + "%"} · 최종 정산은 실제 유효 학생 성적 기준`
      : "학생 성적과 운영 봇의 생성 점수를 같은 비중으로 반영합니다.");
    if (!replay && latest?.reconstructedBotPopulationCount) {
      get("mpi-bot-policy").textContent += ` · 과거 봇 점수 ${number.format(latest.reconstructedBotPopulationCount)}건 포함`;
    }
    const humanCount = latest?.humanPopulationCount ?? ((latest?.populationCount ?? 0) - botCount);
    text("mpi-count", !latest ? "—" : state.market?.botParticipation
      ? `학생 ${number.format(humanCount)}명 · 봇 ${number.format(botCount)}명` : `${number.format(latest.populationCount)}명`);
    text("mpi-time", latest ? time.format(new Date(latest.sampledAt)) : "—");
    text("mpi-cutoff", latest?.dataCutoffAt ? time.format(new Date(latest.dataCutoffAt)) : "—");
    text("mpi-waiting", latest?.unavailable ? "현재 공개 요건을 충족한 성적이 없습니다." : state.market
      ? `${state.market.botParticipation ? "학생과 운영 봇 합계" : "유효 응시"} ${number.format(state.minimumMpiAttempts)}명부터 집계하며, 집계 30분 뒤 공개됩니다.`
      : "주간 모의고사 회차가 공개되면 집계가 시작됩니다.");
    get("mpi-empty").hidden = Boolean(state.candles.length);
    chart.update(state.candles, latest?.mpi != null ? seriesKey(state) : "");
  }

  async function refresh() {
    const version = ++request;
    const query = new URLSearchParams({ interval: chart.interval });
    if (selected) query.set("market", selected);
    if (series.value === "replay") query.set("series", "replay");
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

  series.addEventListener("change", () => {
    chart.reset();
    void refresh();
  });
  select.addEventListener("change", () => {
    series.value = "official";
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

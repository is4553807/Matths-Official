(() => {
  const panel = document.getElementById("exchange-scenario");
  if (!panel) return;
  const kind = panel.dataset.scenarioChart;
  const futures = kind === "futures";
  const link = document.querySelector("[data-scenario-link]");
  const value = panel.querySelector("[data-scenario-value]");
  const count = panel.querySelector("[data-scenario-count]");
  const lastAt = panel.querySelector("[data-scenario-at]");
  const empty = panel.querySelector("[data-scenario-empty]");
  const trades = panel.querySelector("[data-scenario-trades]");
  const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const seoul = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });

  let state = JSON.parse(panel.dataset.scenarioState);
  let marketId = state?.marketId;
  let request = 0;
  let loading = false;
  let nextRefresh = 0;

  async function read(market, interval, before) {
    const query = new URLSearchParams({ chart: kind, interval });
    if (before) query.set("before", String(before));
    const result = await fetch(`/api/exchange/markets/${market}/scenario?${query}`, { cache: "no-store" });
    if (!result.ok) throw new Error("Scenario unavailable");
    return result.json();
  }

  const chart = window.MatthsExchangeChart.create(panel.querySelector("canvas"), {
    volume: futures,
    onInterval: () => { void refresh(true); },
    async onHistory({ before, interval, seriesKey }) {
      if (!seriesKey) return null;
      const older = await read(seriesKey, interval, before);
      return older?.candles ?? [];
    },
  });

  function render() {
    panel.hidden = !state;
    if (link) link.hidden = panel.hidden;
    if (!state) {
      chart.update([], "");
      return;
    }
    const latest = futures ? state.latestTrade : state.latestMpi;
    value.textContent = latest ? number.format(futures ? latest.price : latest.mpi) : "—";
    count.textContent = futures ? `${number.format(state.volume)}계약` : `${number.format(latest?.populationCount ?? 0)}명`;
    lastAt.textContent = latest ? seoul.format(new Date(latest.at)) : "—";
    empty.hidden = Boolean(state.candles.length);
    if (trades) {
      trades.hidden = !state.trades.length;
      trades.replaceChildren(...state.trades.map((trade) => {
        const item = document.createElement("li");
        item.textContent = `${seoul.format(new Date(trade.at))} · ${trade.direction} · ${number.format(trade.price)} · ${trade.quantity}계약`;
        return item;
      }));
    }
    chart.update(state.candles, state.marketId);
  }

  async function refresh(force = false) {
    if (!marketId || (!force && (loading || Date.now() < nextRefresh))) return;
    const version = ++request;
    loading = true;
    nextRefresh = Date.now() + 15_000;
    try {
      const data = await read(marketId, chart.interval);
      if (version !== request) return;
      state = data;
      render();
    } catch {
      // Keep the last visible data and retry on the next poll.
    } finally {
      if (version === request) loading = false;
    }
  }

  function select(market) {
    const selected = market?.type === "weekly" ? market.id : undefined;
    if (selected === marketId) {
      void refresh();
      return;
    }
    marketId = selected;
    request += 1;
    loading = false;
    state = null;
    render();
    void refresh(true);
  }

  window.MatthsExchangeScenario = { select };
  render();
})();

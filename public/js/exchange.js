(() => {
  const root = document.getElementById("exchange");
  if (!root) return;
  const get = (id) => document.getElementById(id);
  const canvas = get("exchange-chart");
  const select = get("market-select");
  const form = get("order-form");
  const wallet = root.dataset.wallet;
  const walletQuery = wallet ? "?wallet=exchange" : "";
  const price = get("order-price");
  const quantity = get("order-quantity");
  const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  const seoul = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const labels = { weekly: "맵쓰 주간 모의고사", mock: "실제 모의고사", csat: "수능" };
  const activityEmpty = {
    positions: "표시할 포지션이 없습니다.", working: "미체결 주문이 없습니다.", history: "주문 내역이 없습니다.",
    trades: "체결 내역이 없습니다.", ranking: "공개에 동의한 정산 기록이 없습니다.",
  };

  let state = JSON.parse(root.dataset.state);
  let filter = state.market?.type || "weekly";
  let marketId = state.market?.id;
  const chart = window.MatthsExchangeChart.create(canvas, {
    volume: true, averages: true, onInterval: () => { void refresh(); },
    async onHistory({ before, interval, seriesKey }) {
      if (!seriesKey) return null;
      const query = new URLSearchParams({ before: String(before), interval });
      const data = await fetchJson(`/api/exchange/markets/${seriesKey}/candles?${query}`);
      return data.candles;
    },
  });
  let action = "open";
  let activity = root.dataset.activityStart;
  let ranking = [];
  let offset = Date.parse(state.serverNow) - Date.now();
  let request = 0;
  let sending = false;
  let pendingOrder;
  let message = "";
  let noticeUntil = 0;
  let polling = false;

  const text = (id, value) => { get(id).textContent = value; };
  const number = (value) => value === null || value === undefined ? "—" : format.format(value);
  const when = (value) => value ? seoul.format(new Date(value)) : "—";
  const el = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const selectedMarket = () => state.market?.id === marketId && state.market?.type === filter ? state.market : null;

  function selectOptions() {
    const choices = state.markets.filter((market) => market.type === filter);
    const optionKey = choices.map((market) => `${market.id}:${market.status}:${market.title}`).join("|");
    if (select.dataset.options !== optionKey) {
      select.replaceChildren(...choices.map((market) => {
        const label = market.type === "mock" ? `${market.year}년 ${market.title}` : market.title;
        const option = el("option", `${label} · ${market.statusLabel}`);
        option.value = market.id;
        return option;
      }));
      select.dataset.options = optionKey;
    }
    select.value = marketId || "";
    get("market-select-wrap").hidden = !choices.length;
  }

  function renderBook(id, entries, empty) {
    let total = 0;
    const sum = entries.reduce((acc, row) => acc + row.quantity, 0);
    const nodes = entries.map((row) => {
      total += row.quantity;
      const button = el("button", undefined, "book-row");
      button.type = "button";
      button.dataset.price = row.price;
      button.style.setProperty("--depth", `${total / sum * 100}%`);
      button.append(el("span", row.operatorQuantity ? number(row.price) + " · MM" : number(row.price)), el("span", number(row.quantity)), el("span", number(total)));
      return button;
    });
    if (id === "asks") nodes.reverse();
    get(id).replaceChildren(...(nodes.length ? nodes : [el("p", empty)]));
  }

  function table(headers, rows) {
    const tableNode = el("table");
    const head = tableNode.createTHead().insertRow();
    for (const header of headers) head.append(el("th", header));
    const body = tableNode.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      for (const value of row) {
        const cell = tr.insertCell();
        if (value instanceof Node) cell.append(value);
        else cell.textContent = value;
      }
    }
    return tableNode;
  }

  function renderActivity() {
    const market = selectedMarket();
    const own = market ? state.own : null;
    let headers;
    let rows;
    get("ranking-controls").hidden = activity !== "ranking";
    if (activity === "ranking") {
      headers = ["순위", "닉네임", "거래 손익 (TP)"];
      rows = ranking.map((row, index) => [index + 1, row.name, number(row.profit)]);
    } else if (activity === "positions") {
      headers = ["방향", "진입가", "보유 수량", "거래 손익 (TP)"];
      rows = (own?.positions || []).map((row) => [row.direction.toUpperCase(), number(row.price), row.remaining, number(row.realized)]);
    } else if (activity === "trades") {
      headers = ["체결 시각 (KST)", "체결가", "수량", "운영자 참여"];
      rows = (market ? state.trades || [] : []).map((row) => [time.format(new Date(row.tradedAt)), number(row.price), row.quantity, row.liquidityProvider === "matths" ? "MM" : "—"]);
    } else {
      headers = ["접수 시각 (KST)", "방향", "지정가", "주문 수량", "미체결", "지불 수수료 (TP)", "상태"];
      rows = (own?.orders || []).filter((row) => activity !== "working" || row.status === "working").map((row) => {
        const cancel = el("button", "취소");
        cancel.type = "button";
        cancel.dataset.cancel = row.id;
        const status = row.status === "working" ? cancel : row.status === "filled" ? "체결 완료" : "취소됨";
        return [time.format(new Date(row.acceptedAt)), `${row.direction.toUpperCase()} ${row.action === "close" ? "청산" : "신규"}`,
          number(row.price), row.quantity, row.status === "working" ? row.remaining : 0, number(row.feesPaid ?? 0), status];
      });
    }
    const destination = get("activity-content");
    const rendered = rows.length ? table(headers, rows) : el("p", activityEmpty[activity]);
    if (destination.firstElementChild?.outerHTML !== rendered.outerHTML) destination.replaceChildren(rendered);
  }

  function countdown() {
    const market = selectedMarket();
    if (!market) return text("market-countdown", "KST · 개장 대기");
    const open = market.status === "scheduled";
    const seconds = Math.max(0, Math.ceil((Date.parse(open ? market.opensAt : market.closeAt) - Date.now() - offset) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    text("market-countdown", seconds ? `${open ? "개장까지" : "마감까지"} ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : market.statusLabel);
  }

  function updateOrder() {
    const market = selectedMarket();
    const own = market ? state.own : null;
    const enabled = own?.eligible && !sending;
    const value = Number(price.value);
    const qty = Number(quantity.value);
    const valid = price.value !== "" && Number.isInteger(value) && value >= 0 && value <= 1000
      && Number.isInteger(qty) && qty >= 1 && qty <= 5;
    for (const button of form.querySelectorAll('[type="submit"]')) {
      button.disabled = !enabled;
      button.textContent = `${button.value.toUpperCase()}${action === "close" ? " 청산" : ""}`;
    }
    text("available-tp", number(own?.available));
    get("fee-balance").hidden = Boolean(wallet) || own?.feeAvailable == null || own.feeAvailable === own.available;
    text("available-fee-tp", number(own?.feeAvailable));
    const rates = own?.feeRates || (wallet ? { maker: 0, taker: 0 } : { maker: 2, taker: 5 });
    const estimate = (rate) => number(Math.round(value * rate / 100) * qty / 100);
    text("order-fee-rates", `메이커 ${number(rates.maker / 100)}% / 테이커 ${number(rates.taker / 100)}%`);
    text("order-fee", valid ? `${estimate(rates.maker)} / ${estimate(rates.taker)} TP` : "—");
    text("order-margin", action === "open" && valid ? `${number(value * qty)} / ${number((1000 - value) * qty)} TP` : "—");
    text("order-status", Date.now() < noticeUntil ? message : own?.reason || (enabled ? "" : "개장 후 주문할 수 있습니다."));
  }

  function calculate() {
    const counts = selectedMarket()?.questionCounts;
    const inputs = [...root.querySelectorAll("[data-answer-count]")];
    get("calculator-fields").hidden = !counts?.length;
    get("calculator-status").hidden = Boolean(counts?.length);
    if (!counts?.length) return;
    let score = 0;
    inputs.forEach((input, index) => {
      input.max = counts[index];
      const value = Math.max(0, Math.min(counts[index], Number(input.value) || 0));
      if (Number(input.value) !== value) input.value = value;
      root.querySelectorAll("[data-question-count]")[index].textContent = counts[index];
      score += value * (index + 2);
    });
    text("calculator-result", `예상 평균 ${number(score)}점 · MPI ${number(score * 10)}`);
  }

  function render() {
    const market = selectedMarket();
    const references = market?.type === "weekly" ? state.references || [] : [];
    const hasChart = market && (state.candles?.length || references.some((row) => row.price !== null));
    get("mid-legend").hidden = market?.type !== "weekly";
    selectOptions();
    for (const button of document.querySelectorAll("[data-filter]")) button.setAttribute("aria-pressed", button.dataset.filter === filter);
    text("market-title", market?.title || labels[filter]);
    text("market-status", market?.statusLabel || "시장 미개설");
    get("market-status").dataset.status = market?.status || "empty";
    text("market-price", number(market?.lastPrice));
    text("book-price", number(market?.type === "weekly" ? state.reference?.price : market?.lastPrice));
    const source = { operator: "운영자 호가", mixed: "학생·운영자 호가", students: "학생 호가" }[state.reference?.source];
    text("book-price-label", market?.type === "weekly" ? (source || "호가 중간값") : "최근 체결");
    text("market-volume", market ? number(market.volume) : "—");
    text("settlement-price", number(market?.settlement));
    const resultLink = get("result-link");
    resultLink.hidden = !market?.resultUrl;
    if (market?.resultUrl) {
      resultLink.href = market.resultUrl;
      resultLink.title = market.settlementSource || "성적 출처";
    }
    text("market-close", when(market?.closeAt));
    const latestTrade = market ? state.trades?.[0] : null;
    text("quote-time", latestTrade ? `최근 체결 ${time.format(new Date(latestTrade.tradedAt))} KST` : "체결 없음");
    get("chart-empty").hidden = Boolean(hasChart);
    text("chart-empty-title", market ? (market.status === "open" ? "체결을 기다리는 중" : market.statusLabel)
      : filter === "weekly" ? "이번 주 시장이 아직 열리지 않았습니다" : "등록된 시장이 없습니다");
    text("chart-empty-copy", market ? (market.status === "scheduled" ? `${when(market.opensAt)} KST 개장`
      : market.status === "open" ? "첫 체결이 발생하면 캔들이 표시됩니다." : "현재 표시할 체결 데이터가 없습니다.")
      : filter === "weekly" ? "정규 주간 모의고사가 공개되면 시장이 자동으로 열립니다." : "시험 일정이 등록되면 개장 시간을 표시합니다.");
    const exam = get("exam-link");
    exam.hidden = filter !== "weekly";
    exam.href = market?.examHref || "/private-mock-exams";
    const orderExam = get("order-exam-link");
    orderExam.hidden = !market?.examHref || (!hasChart && !get("chart-empty").hidden);
    if (market?.examHref) orderExam.href = market.examHref;
    renderBook("asks", market ? state.asks || [] : [], "매도 호가 없음");
    renderBook("bids", market ? state.bids || [] : [], "매수 호가 없음");
    renderActivity();
    countdown();
    updateOrder();
    calculate();
    chart.update(market ? state.candles || [] : [], market?.id || "", references);
  }

  async function fetchJson(url, body) {
    const result = await fetch(url, body === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (result.redirected) throw new Error("로그인 후 다시 시도해 주세요.");
    const data = await result.json();
    if (!result.ok) throw Object.assign(new Error(data.message || "요청을 처리할 수 없습니다."), { status: result.status });
    return data;
  }

  async function refresh() {
    const sequence = ++request;
    try {
      const params = new URLSearchParams({ interval: chart.interval });
      if (marketId) params.set("market", marketId);
      if (wallet) params.set("wallet", wallet);
      const updated = await fetchJson(`/api/exchange/markets?${params}`);
      if (sequence !== request) return;
      state = updated;
      offset = Date.parse(state.serverNow) - Date.now();
      if (!marketId) {
        const next = state.markets.find((row) => row.type === filter && row.status === "open")
          || state.markets.find((row) => row.type === filter && ["scheduled", "waiting", "paused"].includes(row.status));
        if (next && state.market?.id !== next.id) {
          marketId = next.id;
          return refresh();
        }
        marketId = next?.id;
      }
      render();
    } catch {
      if (sequence === request) text("quote-time", "연결을 다시 시도하는 중");
    }
  }

  function report(value) {
    message = value;
    noticeUntil = Date.now() + 6500;
    updateOrder();
  }

  for (const button of document.querySelectorAll("[data-filter]")) button.addEventListener("click", () => {
    filter = button.dataset.filter;
    chart.reset();
    marketId = state.markets.find((row) => row.type === filter && row.status === "open")?.id
      || state.markets.find((row) => row.type === filter)?.id;
    noticeUntil = 0;
    render();
    void refresh();
  });
  select.addEventListener("change", () => { marketId = select.value; chart.reset(); noticeUntil = 0; void refresh(); });
  for (const button of form.querySelectorAll("[data-action]")) button.addEventListener("click", () => {
    action = button.dataset.action;
    for (const item of form.querySelectorAll("[data-action]")) item.setAttribute("aria-pressed", item === button);
    updateOrder();
  });
  form.addEventListener("input", updateOrder);
  get("calculator-fields").addEventListener("input", calculate);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.submitter || sending || !selectedMarket() || !state.own?.eligible) return;
    sending = true;
    updateOrder();
    const direction = event.submitter.value;
    const key = [marketId, action, direction, price.value, quantity.value].join(":");
    if (pendingOrder?.key !== key) pendingOrder = { key, commandId: crypto.randomUUID() };
    try {
      const result = await fetchJson(`/api/exchange/markets/${marketId}/orders${walletQuery}`, {
        action, direction, price: price.value, quantity: quantity.value, commandId: pendingOrder.commandId,
      });
      pendingOrder = undefined;
      report(result.status === "filled" ? "주문이 체결되었습니다." : "주문이 접수되었습니다.");
      await refresh();
    } catch (cause) {
      if (cause.status >= 400 && cause.status < 500) pendingOrder = undefined;
      report(cause.message);
    }
    finally { sending = false; updateOrder(); }
  });
  for (const id of ["asks", "bids"]) get(id).addEventListener("click", (event) => {
    const button = event.target.closest("[data-price]");
    if (button) { price.value = button.dataset.price; updateOrder(); }
  });
  for (const button of root.querySelectorAll("[data-activity]")) button.addEventListener("click", async () => {
    activity = button.dataset.activity;
    for (const item of root.querySelectorAll("[data-activity]")) item.setAttribute("aria-pressed", item === button);
    renderActivity();
    if (activity === "ranking") {
      try { ranking = await fetchJson("/api/exchange/rankings"); renderActivity(); }
      catch (cause) { report(cause.message); }
    }
  });
  get("activity-content").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try { await fetchJson(`/api/exchange/orders/${button.dataset.cancel}/cancel${walletQuery}`, {}); await refresh(); }
    catch (cause) { report(cause.message); button.disabled = false; }
  });
  get("ranking-visible")?.addEventListener("change", async (event) => {
    const box = event.currentTarget;
    box.disabled = true;
    try {
      await fetchJson("/api/exchange/rankings/visibility", { visible: box.checked });
      ranking = await fetchJson("/api/exchange/rankings");
      renderActivity();
    } catch (cause) { box.checked = !box.checked; report(cause.message); }
    finally { box.disabled = false; }
  });
  render();
  if (activity === "ranking") root.querySelector('[data-activity="ranking"]').click();
  setInterval(() => {
    countdown();
    if (!polling && !document.hidden && (selectedMarket() || Date.now() % 5000 < 1000)) {
      polling = true;
      void refresh().finally(() => { polling = false; });
    }
  }, 1000);
})();

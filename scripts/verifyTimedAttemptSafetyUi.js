const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  emit(type, event = {}) {
    const payload = {
      type,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...event,
    };
    for (const listener of this.listeners.get(type) || []) {
      listener(payload);
    }
    return payload;
  }
}

class FakeElement extends FakeTarget {
  constructor({ dataset = {}, value = "" } = {}) {
    super();
    this.dataset = { ...dataset };
    this.value = value;
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.attributes = new Map();
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
    this.selectorMap = new Map();
    this.selectorAllMap = new Map();
  }

  querySelector(selector) {
    return this.selectorMap.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.selectorAllMap.get(selector) || [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  focus() {}

  setSelectionRange() {}
}

const response = (payload = {}, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => payload,
});

const settle = async (turns = 4) => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const createTimers = () => {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = [];
  return {
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    runLatestTimeout() {
      const entry = [...timeouts.entries()].at(-1);
      assert.ok(entry, "a timeout should be queued");
      timeouts.delete(entry[0]);
      return entry[1].callback();
    },
    get pendingTimeoutCount() {
      return timeouts.size;
    },
    intervals,
  };
};

const createPrivateMockHarness = ({
  deadlineOffsetMs = 5 * 60 * 1000,
  fetchImpl,
}) => {
  const timers = createTimers();
  const now = Date.now();
  const input = new FakeElement({
    dataset: { privateMockAnswer: "0" },
  });
  input.selectionStart = 0;
  input.selectionEnd = 0;
  const timer = new FakeElement();
  const form = new FakeElement();
  const answered = new FakeElement();
  const saveState = new FakeElement();
  const errorBox = new FakeElement();
  const submitButton = new FakeElement();
  const networkCalls = [];
  const rootElement = new FakeElement({
    dataset: {
      examId: "exam-1",
      serverNow: new Date(now).toISOString(),
      deadline: new Date(now + deadlineOffsetMs).toISOString(),
    },
  });
  rootElement.selectorMap.set("[data-private-mock-timer]", timer);
  rootElement.selectorMap.set("[data-private-mock-form]", form);
  rootElement.selectorMap.set("[data-private-mock-answered]", answered);
  rootElement.selectorMap.set("[data-private-mock-save-state]", saveState);
  rootElement.selectorMap.set("[data-private-mock-error]", errorBox);
  rootElement.selectorMap.set("[data-private-mock-submit]", submitButton);
  rootElement.selectorAllMap.set("[data-private-mock-answer]", [input]);

  const document = new FakeTarget();
  document.hidden = false;
  document.visibilityState = "visible";
  document.querySelector = (selector) => {
    if (selector === "[data-private-mock-exam]") return rootElement;
    return null;
  };

  const window = new FakeTarget();
  let reloadCount = 0;
  window.setTimeout = timers.setTimeout;
  window.clearTimeout = timers.clearTimeout;
  window.setInterval = timers.setInterval;
  window.location = {
    reload() {
      reloadCount += 1;
    },
  };
  window.confirm = () => true;
  window.MatthsTimedAttemptNetwork = {
    create(configuration) {
      networkCalls.push(configuration);
      return {
        showOffline() {},
        showRetryable() {},
        markSaved() {},
      };
    },
  };

  const navigator = {
    onLine: true,
    sendBeacon: () => true,
  };
  const context = {
    Blob,
    Date,
    Event: class Event {
      constructor(type, options = {}) {
        this.type = type;
        Object.assign(this, options);
      }
    },
    JSON,
    Math,
    Promise,
    console,
    document,
    fetch: fetchImpl,
    navigator,
    queueMicrotask,
    window,
  };

  vm.runInNewContext(read("public/js/private-mock-exam.js"), context, {
    filename: "private-mock-exam.js",
  });

  return {
    answered,
    errorBox,
    form,
    input,
    networkCalls,
    rootElement,
    saveState,
    submitButton,
    timer,
    timers,
    window,
    get reloadCount() {
      return reloadCount;
    },
  };
};

const verifyPrivateSaveRace = async () => {
  const requests = [];
  const completions = [];
  const harness = createPrivateMockHarness({
    fetchImpl(url, options) {
      requests.push({ url, options });
      return new Promise((resolve) => completions.push(resolve));
    },
  });

  harness.input.value = "first";
  harness.input.emit("input");
  harness.timers.runLatestTimeout();
  await settle();
  assert.equal(requests.length, 1);

  harness.input.value = "second";
  harness.input.emit("input");
  completions[0](response({ ok: true }));
  await settle(8);

  assert.equal(
    requests.length,
    2,
    "an edit made during an in-flight save must schedule a second save",
  );
  const firstBody = JSON.parse(requests[0].options.body);
  const secondBody = JSON.parse(requests[1].options.body);
  assert.deepEqual(firstBody.answers, ["first"]);
  assert.deepEqual(secondBody.answers, ["second"]);
  assert.equal(firstBody.telemetryEvents.length, 1);
  assert.equal(secondBody.telemetryEvents.length, 1);
  completions[1](response({ ok: true }));
  await settle();

  harness.input.value = "third";
  harness.input.emit("input");
  const unload = harness.window.emit("beforeunload");
  assert.equal(unload.defaultPrevented, true);
  assert.equal(unload.returnValue, true);
};

const verifyPrivateAutomaticSubmitRecovery = async ({
  firstFailure,
  secondResponse = response({ submitted: true }),
}) => {
  const submitBodies = [];
  const submitHeaders = [];
  const harness = createPrivateMockHarness({
    deadlineOffsetMs: 4500,
    fetchImpl: async (url, options) => {
      if (!url.endsWith("/submit")) return response({ ok: true });
      submitBodies.push(options.body);
      submitHeaders.push(options.headers);
      if (submitBodies.length === 1) {
        if (firstFailure instanceof Error) throw firstFailure;
        return firstFailure;
      }
      return secondResponse;
    },
  });
  await settle();
  assert.equal(submitBodies.length, 1);
  assert.equal(harness.submitButton.disabled, true);
  assert.equal(harness.input.disabled, true);
  assert.match(
    harness.saveState.textContent,
    /마감 5초 전.*전송 보호/,
  );
  harness.timers.runLatestTimeout();
  await settle();
  assert.equal(submitBodies.length, 2);
  assert.equal(
    submitBodies[1],
    submitBodies[0],
    "a timeout submit retry must reuse the exact receipt, capture, answer, and telemetry snapshot",
  );
  const submission = JSON.parse(submitBodies[0]);
  assert.match(
    submission.requestId,
    /^private-mock-submit-[A-Za-z0-9-]+$/,
  );
  assert.equal(
    submitHeaders[0]["Idempotency-Key"],
    submission.requestId,
  );
  assert.equal(
    submitHeaders[1]["Idempotency-Key"],
    submission.requestId,
  );
  assert.ok(
    Date.parse(submission.capturedAt) <=
      Date.parse(harness.rootElement.dataset.deadline),
    "the automatic submission must capture its immutable latest-answer snapshot before the server deadline",
  );
  assert.ok(
    Date.parse(harness.rootElement.dataset.deadline) -
      Date.parse(submission.capturedAt) >=
      3500,
    "the automatic submission must reserve at least 3.5 seconds of its 5-second transport-safety lead in the runtime harness",
  );
  assert.equal(harness.reloadCount, 1);
  assert.equal(harness.submitButton.disabled, true);
};

const verifyPrivateAutomaticSubmitStopsAtBound = async () => {
  let submitCount = 0;
  const submitBodies = [];
  const harness = createPrivateMockHarness({
    deadlineOffsetMs: -1000,
    fetchImpl: async (url, options) => {
      if (!url.endsWith("/submit")) return response({ ok: true });
      submitCount += 1;
      submitBodies.push(options.body);
      if (submitCount > 3) {
        return response({ message: "attempt already closed" }, false, 409);
      }
      return response({ message: "temporary failure" }, false, 503);
    },
  });
  await settle();
  harness.timers.runLatestTimeout();
  await settle();
  harness.timers.runLatestTimeout();
  await settle();
  assert.equal(submitCount, 3);
  assert.equal(harness.timers.pendingTimeoutCount, 0);

  for (const interval of harness.timers.intervals.filter(
    ({ delay }) => delay === 250,
  )) {
    for (let index = 0; index < 8; index += 1) interval.callback();
  }
  await settle();
  assert.equal(
    submitCount,
    3,
    "an expired private mock must retry transient failures only within its bound",
  );
  assert.equal(harness.submitButton.disabled, false);
  assert.equal(harness.submitButton.textContent, "자동 제출 다시 시도");
  assert.match(harness.errorBox.textContent, /3회 시도했습니다/);

  harness.form.emit("submit");
  await settle();
  assert.equal(submitCount, 4);
  assert.equal(
    submitBodies[3],
    submitBodies[2],
    "the explicit status retry must preserve the submitted answer snapshot",
  );
  assert.equal(harness.reloadCount, 1);
};

const createArenaHarness = ({
  fetchImpl,
  deadlineOffsetMs = 5 * 60 * 1000,
  inputValue = "17",
}) => {
  const timers = createTimers();
  const now = Date.now();
  let clockNow = now;
  class HarnessDate extends Date {
    constructor(value) {
      super(value === undefined ? clockNow : value);
    }

    static now() {
      return clockNow;
    }
  }
  const input = new FakeElement({
    dataset: { arenaAnswer: "question-1" },
    value: inputValue,
  });
  const timer = new FakeElement();
  const saveState = new FakeElement();
  const answered = new FakeElement();
  const submitButton = new FakeElement();
  submitButton.textContent = "다음 문제";
  const errorBox = new FakeElement();
  const rootElement = new FakeElement({
    dataset: {
      matchId: "match-1",
      serverNow: new Date(now).toISOString(),
      deadline: new Date(now + deadlineOffsetMs).toISOString(),
      timeoutOperationId:
        `QUESTION_TIME_LIMIT:attempt-1:${now + deadlineOffsetMs}`,
      finalQuestion: "false",
      questionNumber: "1",
      questionTimeLimitMs: String(10 * 60 * 1000),
    },
  });
  rootElement.selectorMap.set("[data-arena-match-timer]", timer);
  rootElement.selectorMap.set("[data-arena-match-save-state]", saveState);
  rootElement.selectorMap.set("[data-arena-match-answered]", answered);
  rootElement.selectorMap.set("[data-arena-match-submit]", submitButton);
  rootElement.selectorMap.set("[data-arena-match-error]", errorBox);
  rootElement.selectorAllMap.set("[data-arena-answer]", [input]);

  const document = new FakeTarget();
  document.hidden = false;
  document.querySelector = (selector) =>
    selector === "[data-arena-match-attempt]" ? rootElement : null;

  const networkConfigurations = [];
  const assignments = [];
  let uuid = 0;
  const window = new FakeTarget();
  window.setTimeout = timers.setTimeout;
  window.clearTimeout = timers.clearTimeout;
  window.setInterval = timers.setInterval;
  window.confirm = () => true;
  window.crypto = { randomUUID: () => `operation-${(uuid += 1)}` };
  window.location = {
    href: "https://example.test/goat-arena/matches/match-1",
    assign(value) {
      assignments.push(value);
    },
    reload() {},
  };
  window.history = {
    state: {},
    replaceState() {},
    pushState() {},
    back() {},
    forward() {},
  };
  window.MatthsMath = { render() {} };
  window.MatthsTimedAttemptNetwork = {
    create(configuration) {
      networkConfigurations.push(configuration);
      return {
        showOffline() {},
        showRetryable() {},
        markSaved() {},
      };
    },
  };
  const navigator = { onLine: true };

  vm.runInNewContext(
    read("public/js/goat-arena-match.js"),
    {
      Date: HarnessDate,
      JSON,
      Math,
      Promise,
      URL,
      console,
      document,
      fetch: fetchImpl,
      navigator,
      window,
    },
    {
      filename: "goat-arena-match.js",
    },
  );

  return {
    advanceClock(milliseconds) {
      clockNow += milliseconds;
    },
    assignments,
    errorBox,
    input,
    networkConfigurations,
    saveState,
    submitButton,
    timers,
    timeoutOperationId:
      rootElement.dataset
        .timeoutOperationId,
  };
};

const verifyArenaAdvanceRetryIdempotency = async () => {
  const advanceBodies = [];
  let advanceAttempt = 0;
  const harness = createArenaHarness({
    fetchImpl: async (url, options) => {
      if (!url.endsWith("/advance")) return response({ ok: true });
      advanceBodies.push(JSON.parse(options.body));
      advanceAttempt += 1;
      if (advanceAttempt === 1) throw new Error("response lost");
      if (advanceAttempt === 2) {
        return response({ message: "temporary server failure" }, false, 503);
      }
      return response({
        finalQuestion: false,
        currentQuestionIndex: 1,
      });
    },
  });

  harness.submitButton.emit("click");
  await settle();
  assert.equal(harness.input.disabled, true);
  assert.match(harness.errorBox.textContent, /같은 제출 번호/);

  harness.submitButton.emit("click");
  await settle();
  assert.equal(advanceBodies.length, 2);
  harness.submitButton.emit("click");
  await settle();
  assert.equal(advanceBodies.length, 3);
  for (const retryBody of advanceBodies.slice(1)) {
    assert.deepEqual(
      retryBody,
      advanceBodies[0],
      "transport and 5xx Arena advance retries must reuse the exact requestId and body",
    );
  }
  assert.equal(harness.assignments.length, 1);
};

const verifyArenaAdvanceValidationRecovery = async () => {
  const advanceBodies = [];
  const harness = createArenaHarness({
    fetchImpl: async (url, options) => {
      if (!url.endsWith("/advance")) return response({ ok: true });
      advanceBodies.push(JSON.parse(options.body));
      if (advanceBodies.length === 1) {
        return response(
          { message: "답안은 1 이상 999 이하의 자연수여야 합니다." },
          false,
          400,
        );
      }
      return response({
        finalQuestion: false,
        currentQuestionIndex: 1,
      });
    },
  });

  harness.submitButton.emit("click");
  await settle();
  assert.equal(harness.input.disabled, false);
  assert.equal(harness.submitButton.disabled, false);
  assert.equal(harness.submitButton.textContent, "다음 문제");
  assert.match(harness.errorBox.textContent, /답안을 확인한 뒤 다시 제출/);

  harness.input.value = "18";
  harness.submitButton.emit("click");
  await settle();
  assert.equal(advanceBodies.length, 2);
  assert.notEqual(
    advanceBodies[1].requestId,
    advanceBodies[0].requestId,
    "a confirmed 4xx validation failure must discard its operationId",
  );
  assert.equal(advanceBodies[1].value, "18");
  assert.equal(harness.assignments.length, 1);
};

const verifyArenaTimeoutFlushesBeforeAdvance = async () => {
  const answerBodies = [];
  const advanceBodies = [];
  const requestOrder = [];
  const harness = createArenaHarness({
    deadlineOffsetMs: 1000,
    inputValue: "23",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/answers")) {
        const body = JSON.parse(options.body);
        answerBodies.push(body);
        requestOrder.push(`save:${body.requestId}`);
        if (answerBodies.length === 1) {
          throw new Error("save response lost");
        }
        return response({ ok: true });
      }
      if (url.endsWith("/advance")) {
        const body = JSON.parse(options.body);
        advanceBodies.push(body);
        requestOrder.push(`advance:${body.requestId}`);
        return response({
          finalQuestion: false,
          currentQuestionIndex: 1,
        });
      }
      return response({ ok: true });
    },
  });

  harness.input.emit("input");
  harness.advanceClock(1500);
  const timerTick = harness.timers.intervals.find(
    ({ delay }) => delay === 1000,
  );
  assert.ok(timerTick, "the Arena deadline timer must be installed");
  timerTick.callback();
  await settle(8);
  assert.equal(answerBodies.length, 1);
  assert.equal(
    advanceBodies.length,
    0,
    "TIME_LIMIT must not advance while the latest answer save is unresolved",
  );
  assert.equal(harness.input.disabled, true);

  await harness.networkConfigurations[0].onRetry();
  await settle(8);
  assert.equal(answerBodies.length, 2);
  assert.deepEqual(
    answerBodies[1],
    answerBodies[0],
    "TIME_LIMIT save recovery must preserve the logical requestId and exact body",
  );
  assert.equal(answerBodies[1].changes.at(-1).value, "23");
  assert.equal(advanceBodies.length, 1);
  assert.equal(
    advanceBodies[0].requestId,
    harness.timeoutOperationId,
    "TIME_LIMIT must use the server-issued operation shared with the scheduler",
  );
  assert.match(requestOrder.at(-1), /^advance:/);
  assert.equal(harness.assignments.length, 1);
};

const verifyArenaTimeoutUsesAtomicAnswerAfterExpiredSave = async () => {
  const requestOrder = [];
  const advanceBodies = [];
  const harness = createArenaHarness({
    deadlineOffsetMs: 1000,
    inputValue: "31",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/answers")) {
        requestOrder.push("save:expired");
        return response(
          { message: "제한 시간이 끝나 답안을 더 변경할 수 없습니다." },
          false,
          410,
        );
      }
      if (url.endsWith("/advance")) {
        const body = JSON.parse(options.body);
        requestOrder.push(`advance:${body.requestId}`);
        advanceBodies.push(body);
        return response({
          finalQuestion: false,
          currentQuestionIndex: 1,
        });
      }
      return response({ ok: true });
    },
  });

  harness.input.emit("input");
  harness.advanceClock(1500);
  const timerTick = harness.timers.intervals.find(
    ({ delay }) => delay === 1000,
  );
  timerTick.callback();
  await settle(8);

  assert.deepEqual(
    requestOrder.map((entry) => entry.split(":")[0]),
    ["save", "advance"],
  );
  assert.equal(advanceBodies.length, 1);
  assert.equal(
    advanceBodies[0].value,
    "31",
    "TIME_LIMIT advance must atomically carry the latest value after a known expired save",
  );
  assert.equal(advanceBodies[0].submissionMode, "TIME_LIMIT");
  assert.equal(
    advanceBodies[0].requestId,
    harness.timeoutOperationId,
  );
  assert.equal(harness.assignments.length, 1);
};

const verifyArenaTimeoutReconcilesAfterSchedulerSaveRace = async () => {
  const requestOrder = [];
  const advanceBodies = [];
  const harness = createArenaHarness({
    deadlineOffsetMs: 1000,
    inputValue: "37",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/answers")) {
        requestOrder.push("save:stale-question");
        return response(
          { message: "저장할 문항 정보를 확인해주세요." },
          false,
          400,
        );
      }
      if (url.endsWith("/advance")) {
        const body = JSON.parse(options.body);
        requestOrder.push(`advance:${body.requestId}`);
        advanceBodies.push(body);
        return response({
          finalQuestion: false,
          currentQuestionIndex: 1,
          replayed: true,
          latestValueReconciled: true,
        });
      }
      return response({ ok: true });
    },
  });

  harness.input.emit("input");
  harness.advanceClock(1500);
  const timerTick = harness.timers.intervals.find(
    ({ delay }) => delay === 1000,
  );
  timerTick.callback();
  await settle(8);

  assert.deepEqual(
    requestOrder.map((entry) => entry.split(":")[0]),
    ["save", "advance"],
    "a scheduler-first stale save rejection must still reach the shared timeout advance",
  );
  assert.equal(advanceBodies[0].requestId, harness.timeoutOperationId);
  assert.equal(advanceBodies[0].value, "37");
  assert.equal(harness.assignments.length, 1);
};

const verifyArenaAnswerRetryIdempotency = async () => {
  const answerBodies = [];
  let answerAttempt = 0;
  const harness = createArenaHarness({
    fetchImpl: async (url, options) => {
      if (!url.endsWith("/answers")) return response({ ok: true });
      answerBodies.push(JSON.parse(options.body));
      answerAttempt += 1;
      if (answerAttempt === 1) throw new Error("save response lost");
      return response({ ok: true });
    },
  });

  harness.input.value = "17";
  harness.input.emit("input");
  harness.timers.runLatestTimeout();
  await settle();

  harness.input.value = "18";
  harness.input.emit("input");
  await harness.networkConfigurations[0].onRetry();
  await settle();

  assert.equal(answerBodies.length, 3);
  assert.deepEqual(
    answerBodies[1],
    answerBodies[0],
    "an ambiguous Arena answer save retry must reuse its exact requestId and batch",
  );
  assert.notEqual(answerBodies[2].requestId, answerBodies[0].requestId);
  assert.equal(answerBodies[2].changes.at(-1).value, "18");
};

const verifyNetworkStateHelper = async () => {
  const region = new FakeElement();
  region.hidden = true;
  const title = new FakeElement();
  const message = new FakeElement();
  const button = new FakeElement();
  region.selectorMap.set("[data-timed-attempt-network-title]", title);
  region.selectorMap.set("[data-timed-attempt-network-message]", message);
  region.selectorMap.set("[data-timed-attempt-network-retry]", button);
  const componentRoot = new FakeElement();
  componentRoot.selectorMap.set("[data-timed-attempt-network-state]", region);
  const window = new FakeTarget();
  const navigator = { onLine: true };
  let pending = false;
  let retryAllowed = true;
  let retries = 0;
  const context = { console, navigator, window };
  vm.runInNewContext(read("public/js/timed-attempt-network.js"), context, {
    filename: "timed-attempt-network.js",
  });
  const controller = window.MatthsTimedAttemptNetwork.create({
    root: componentRoot,
    hasPending: () => pending,
    canRetry: () => retryAllowed,
    onRetry: async () => {
      retries += 1;
      pending = false;
      return true;
    },
  });

  navigator.onLine = false;
  window.emit("offline");
  assert.equal(region.hidden, false);
  assert.equal(region.dataset.connectionState, "offline");
  assert.equal(button.disabled, true);

  pending = true;
  navigator.onLine = true;
  window.emit("online");
  await settle();
  assert.equal(retries, 1);
  assert.equal(region.hidden, true);

  pending = true;
  controller.showRetryable("still pending");
  assert.equal(region.hidden, false);
  assert.equal(region.dataset.connectionState, "retryable");
  assert.equal(button.disabled, false);

  navigator.onLine = false;
  window.emit("offline");
  retryAllowed = false;
  navigator.onLine = true;
  window.emit("online");
  assert.equal(
    region.hidden,
    false,
    "a non-retryable pending failure must remain visible after reconnecting",
  );
  assert.equal(region.dataset.connectionState, "retryable");
  assert.equal(button.disabled, true);
  controller.dispose();
};

const verifyContracts = () => {
  const privateView = read("views/private-mock-exam.ejs");
  const arenaView = read("views/goat-arena-match.ejs");
  const partial = read("views/partials/timed-attempt-network-state.ejs");
  const privateCss = read("public/css/private-mock-exams.css");
  const arenaCss = read("public/css/goat-arena.css");
  const privateJs = read("public/js/private-mock-exam.js");
  const arenaJs = read("public/js/goat-arena-match.js");

  assert.match(partial, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(partial, /data-timed-attempt-network-retry/);
  assert.match(partial, /\shidden(?:\s|>)/);
  for (const view of [privateView, arenaView]) {
    assert.match(view, /include\("partials\/timed-attempt-network-state"\)/);
    assert.match(view, /src="\/js\/timed-attempt-network\.js"/);
    assert.match(view, /role="status"[\s\S]{0,100}aria-live="polite"/);
    assert.match(view, /role="alert"[\s\S]{0,100}aria-live="assertive"/);
  }

  assert.match(
    privateCss,
    /\.private-mock-answer-item[\s\S]*?> input\[type="text"\][\s\S]*?min-height:\s*48px;[\s\S]*?font-size:\s*16px;/,
  );
  assert.match(
    privateCss,
    /\.private-mock-omr button,[\s\S]*?\.private-mock-keyboard button[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
  );
  assert.match(
    privateCss,
    /\.private-mock-keyboard\s*\{[\s\S]*?repeat\(4,\s*minmax\(44px,\s*1fr\)\)/,
  );
  assert.match(
    privateCss,
    /\.private-mock-submit-note\s*\{[\s\S]*?font-size:\s*13px;/,
  );
  assert.match(
    privateCss,
    /\.private-mock-answer-panel header p\s*\{[\s\S]*?font-size:\s*13px;/,
  );
  assert.doesNotMatch(
    privateCss,
    /font-size:\s*(?:10|11)px;/,
    "private mock text must never render below 12px",
  );
  assert.match(
    privateCss,
    /\.private-mock-start-link\s*\{[\s\S]*?font-size:\s*12px;/,
  );
  assert.match(
    privateCss,
    /button\[data-private-mock-start\]\s*\{[\s\S]*?font-size:\s*12px;/,
  );
  assert.match(
    privateCss,
    /\.private-mock-exam-header \.brand\s*\{[\s\S]*?min-height:\s*44px;/,
  );
  assert.match(
    privateCss,
    /\[data-private-mock-submit\]\s*\{[\s\S]*?background:\s*var\(--matths-action-primary\);/,
  );
  assert.match(
    privateCss,
    /@media \(max-width:\s*430px\)[\s\S]*?\.private-mock-exam-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?\.private-mock-exam-header h1,[\s\S]*?overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    privateCss,
    /@media \(max-width:\s*430px\)[\s\S]*?\.private-mock-exam-header h1\s*\{[\s\S]*?white-space:\s*normal;/,
  );
  assert.match(
    privateCss,
    /@media \(max-width:\s*430px\)[\s\S]*?\.private-mock-answer-panel\s*> header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    arenaCss,
    /\.arena-match-timer-bar small\s*\{[\s\S]*?font-size:\s*13px;/,
  );
  assert.match(
    arenaCss,
    /\.arena-match-workspace\s*>\s*\.timed-attempt-network-state\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/,
    "the Arena hidden network status must compute to display:none even beside its grid rule",
  );
  assert.doesNotMatch(
    arenaCss,
    /font-size:\s*(?:10|11)px|font-size:\s*(?:0?\.68|0?\.69|0?\.70|0?\.7)rem/,
    "Arena informational text must not render below 12px",
  );
  assert.match(
    arenaCss,
    /\.arena-match-question-prompt\s+mjx-container\[display="true"\][\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/,
  );

  assert.match(privateJs, /const revisionAtStart\s*=\s*answerRevision/);
  assert.match(privateJs, /const eventBatch\s*=\s*telemetryEvents\.slice\(\)/);
  assert.match(privateJs, /answerRevision\s*!==\s*revisionAtStart/);
  assert.match(privateJs, /"beforeunload"/);
  assert.match(
    privateJs,
    /const automaticSubmitRetryDelays\s*=\s*\[[\s\S]*?180,[\s\S]*?360,?[\s\S]*?\]/,
  );
  assert.match(privateJs, /body:\s*submissionBody/);
  assert.equal(
    (privateJs.match(/automaticSubmitRequested\s*=\s*false/g) || []).length,
    1,
    "private automatic submit latch must never reset after the deadline",
  );

  assert.match(arenaJs, /let pendingAdvance\s*=\s*null/);
  assert.match(
    arenaJs,
    /requestId:\s*operationId\(\)[\s\S]*?submissionMode:\s*effectiveMode/,
  );
  assert.match(arenaJs, /\/advance`,\s*pendingAdvance/);
  assert.match(arenaJs, /pendingAnswerSave\s*=\s*saveOperation/);
  assert.match(
    arenaJs,
    /effectiveMode\s*===\s*"TIME_LIMIT"[\s\S]*?await flushChanges\(\)[\s\S]*?\/advance`/,
    "TIME_LIMIT must durably flush the latest answer before advance",
  );
  assert.match(arenaJs, /const isAmbiguousAdvanceError/);
  assert.match(arenaJs, /"beforeunload"/);
  assert.equal(
    (arenaJs.match(/automaticSubmitRequested\s*=\s*false/g) || []).length,
    1,
    "Arena automatic advance latch must never reset after the deadline",
  );
};

async function run() {
  verifyContracts();
  await verifyNetworkStateHelper();
  await verifyPrivateSaveRace();
  await verifyPrivateAutomaticSubmitRecovery({
    firstFailure: response({ message: "temporary failure" }, false, 503),
  });
  await verifyPrivateAutomaticSubmitRecovery({
    firstFailure: new Error("network unavailable"),
  });
  await verifyPrivateAutomaticSubmitRecovery({
    firstFailure: new Error("response lost"),
    secondResponse: response({ message: "attempt already closed" }, false, 409),
  });
  await verifyPrivateAutomaticSubmitStopsAtBound();
  await verifyArenaAnswerRetryIdempotency();
  await verifyArenaAdvanceRetryIdempotency();
  await verifyArenaAdvanceValidationRecovery();
  await verifyArenaTimeoutFlushesBeforeAdvance();
  await verifyArenaTimeoutUsesAtomicAnswerAfterExpiredSave();
  await verifyArenaTimeoutReconcilesAfterSchedulerSaveRace();
  console.log(
    "Timed attempt safety UI verified: hidden network state, 44/48px controls, private save race, 5-second transport lead, bounded timeout-submit recovery, Arena timeout flush, retry classification, validation recovery, and MathJax overflow.",
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

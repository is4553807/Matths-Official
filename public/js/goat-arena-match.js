(() => {
  const root = document.querySelector(
    "[data-arena-match-attempt]"
  );
  if (!root) return;

  // 원격 MathJax 초기화가 느린 환경에서도 현재 문제지의 TeX를 다시
  // 조판한다. 문자열을 HTML로 실행하지 않고 MathJax가 텍스트 노드만
  // 읽도록 문제지 루트로 범위를 제한한다.
  const typesetProblemMath = () => {
    if (!window.MathJax?.typesetPromise) return;
    window.MathJax.typesetClear?.([root]);
    window.MathJax.typesetPromise([root]).catch(() => {});
  };
  if (window.MathJax?.startup?.promise) {
    window.MathJax.startup.promise.then(typesetProblemMath).catch(() => {});
  } else {
    window.addEventListener("load", typesetProblemMath, { once: true });
  }

  const matchId = root.dataset.matchId;
  const serverNow = new Date(
    root.dataset.serverNow
  ).getTime();
  const deadline = new Date(
    root.dataset.deadline
  ).getTime();
  const finalQuestion =
    root.dataset.finalQuestion === "true";
  const questionNumber = Math.max(
    1,
    Number(
      root.dataset.questionNumber
    ) || 1
  );
  const questionTimeLimitMs =
    Math.max(
      1000,
      Number(
        root.dataset
          .questionTimeLimitMs
      ) || 10 * 60 * 1000
    );
  const clockOffset = serverNow - Date.now();
  const timer = root.querySelector(
    "[data-arena-match-timer]"
  );
  const saveState = root.querySelector(
    "[data-arena-match-save-state]"
  );
  const answered = root.querySelector(
    "[data-arena-match-answered]"
  );
  const submitButton = root.querySelector(
    "[data-arena-match-submit]"
  );
  const errorBox = root.querySelector(
    "[data-arena-match-error]"
  );
  const inputs = [
    ...root.querySelectorAll(
      "[data-arena-answer]"
    ),
  ];
  let pendingChanges = [];
  let pendingSignals = [];
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let submitting = false;
  let automaticSubmitRequested = false;
  let lastFocusSignalType = "";
  let lastFocusSignalAt = 0;

  const operationId = () =>
    window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}-arena-operation`;

  const clientAt = () =>
    new Date().toISOString();

  const request = async (
    path,
    body,
    { keepalive = false } = {}
  ) => {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive,
    });
    const payload = await response
      .json()
      .catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        payload.message ||
          "경기 요청을 처리하지 못했습니다."
      );
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const showError = (message) => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const refreshAnswered = () => {
    if (!answered) return;
  };

  const enqueueChange = (input) => {
    pendingChanges.push({
      questionKey:
        input.dataset.arenaAnswer,
      value: input.value,
      clientAt: clientAt(),
    });
    if (pendingChanges.length > 200) {
      pendingChanges =
        pendingChanges.slice(-200);
    }
  };

  const flushChanges = ({
    keepalive = false,
  } = {}) => {
    window.clearTimeout(saveTimer);
    saveChain = saveChain
      .catch(() => {})
      .then(
      async () => {
        if (!pendingChanges.length) return;
        const batch = pendingChanges.splice(
          0,
          pendingChanges.length
        );
        saveState.textContent = "저장 중";
        try {
          await request(
            `/api/goat-arena/matches/${matchId}/answers`,
            {
              requestId: operationId(),
              changes: batch,
            },
            { keepalive }
          );
          saveState.textContent =
            "자동 저장 완료";
        } catch (error) {
          pendingChanges = [
            ...batch,
            ...pendingChanges,
          ].slice(-200);
          saveState.textContent = "저장 실패";
          if (!keepalive) {
            showError(error.message);
          }
          if (error.status === 423) {
            window.location.reload();
          }
          throw error;
        }
      }
    );
    return saveChain;
  };

  const enqueueSignal = (
    type,
    questionKey = ""
  ) => {
    pendingSignals.push({
      type,
      questionKey,
      clientAt: clientAt(),
    });
    if (pendingSignals.length > 200) {
      pendingSignals =
        pendingSignals.slice(-200);
    }
  };

  const enqueueFocusSignal = (type) => {
    const now = Date.now();
    // 한 번의 탭 전환에서 visibilitychange와 blur/focus가 연달아
    // 발생하므로 같은 상태 신호를 중복 집계하지 않는다.
    if (
      type === lastFocusSignalType &&
      now - lastFocusSignalAt < 750
    ) {
      return;
    }
    lastFocusSignalType = type;
    lastFocusSignalAt = now;
    enqueueSignal(type);
  };

  const flushSignals = async ({
    keepalive = false,
  } = {}) => {
    if (!pendingSignals.length || submitting) {
      return;
    }
    const batch = pendingSignals.splice(
      0,
      pendingSignals.length
    );
    try {
      await request(
        `/api/goat-arena/matches/${matchId}/activity`,
        {
          requestId: operationId(),
          signals: batch,
        },
        { keepalive }
      );
    } catch (error) {
      pendingSignals = [
        ...batch,
        ...pendingSignals,
      ].slice(-200);
    }
  };

  const setInputsDisabled = (disabled) => {
    inputs.forEach((input) => {
      input.disabled = disabled;
    });
  };

  const submit = async (
    submissionMode = "MANUAL"
  ) => {
    if (submitting) return;
    if (
      submissionMode === "MANUAL" &&
      finalQuestion &&
      !window.confirm(
        "5번 답안을 확정하고 풀이 증거 제출 단계로 이동할까요? 이후에는 문제를 다시 볼 수 없습니다."
      )
    ) {
      return;
    }
    submitting = true;
    setInputsDisabled(true);
    submitButton.disabled = true;
    submitButton.textContent =
      submissionMode === "TIME_LIMIT"
        ? `${questionNumber}번 시간 종료 · 다음 문항 준비 중`
        : finalQuestion
          ? "풀이 완료 처리 중"
          : "다음 문제 준비 중";
    errorBox.hidden = true;

    try {
      window.clearTimeout(saveTimer);
      if (submissionMode !== "TIME_LIMIT") {
        pendingChanges = [];
        await saveChain.catch(() => {});
      }
      const result = await request(
        `/api/goat-arena/matches/${matchId}/advance`,
        {
          requestId: operationId(),
          value:
            submissionMode ===
            "TIME_LIMIT"
              ? ""
              : inputs[0]?.value || "",
          submissionMode,
        }
      );
      if (result.finalQuestion) {
        window.location.assign(
          `/goat-arena/matches/${matchId}`
        );
      } else {
        const nextQuestion =
          Number(
            result.currentQuestionIndex
          ) + 1;
        window.location.assign(
          `/goat-arena/matches/${matchId}?question=${nextQuestion}`
        );
      }
    } catch (error) {
      if (
        error.status === 410 ||
        error.status === 423
      ) {
        window.location.reload();
        return;
      }
      submitting = false;
      if (submissionMode === "TIME_LIMIT") {
        automaticSubmitRequested = false;
      }
      setInputsDisabled(false);
      submitButton.disabled = false;
      submitButton.textContent =
        finalQuestion ? "풀이 완료" : "다음 문제";
      showError(error.message);
    }
  };

  inputs.forEach((input) => {
    input.addEventListener("focus", () => {
      enqueueSignal(
        "QUESTION_FOCUSED",
        input.dataset.arenaAnswer
      );
    });
    input.addEventListener("input", () => {
      enqueueChange(input);
      refreshAnswered();
      saveState.textContent =
        "변경 사항 있음";
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(
        () =>
          flushChanges().catch(() => {}),
        800
      );
    });
  });

  submitButton?.addEventListener(
    "click",
    () => submit("MANUAL")
  );

  const refreshTimer = () => {
    const remaining = Math.min(
      questionTimeLimitMs,
      Math.max(
        0,
        deadline -
          (Date.now() + clockOffset)
      )
    );
    const seconds = Math.ceil(
      remaining / 1000
    );
    const minutes = Math.floor(
      seconds / 60
    );
    timer.textContent = `${String(
      minutes
    ).padStart(2, "0")}:${String(
      seconds % 60
    ).padStart(2, "0")}`;
    root.classList.toggle(
      "arena-time-warning",
      remaining > 0 &&
        remaining <= 60 * 1000
    );
    if (
      remaining <= 0 &&
      !automaticSubmitRequested
    ) {
      automaticSubmitRequested = true;
      submit("TIME_LIMIT");
    }
  };

  document.addEventListener(
    "visibilitychange",
    () => {
      // 브라우저는 새 탭 생성 자체를 공개하지 않지만, 응시 탭을 떠나
      // 새 탭·다른 창·다른 앱으로 이동하면 visibility/blur 신호가 난다.
      // 서버에는 구체적인 이동 대상이 아니라 응시 화면 이탈 사실만 보낸다.
      enqueueFocusSignal(
        document.hidden
          ? "FOCUS_LOST"
          : "FOCUS_GAINED"
      );
      flushSignals({ keepalive: true }).catch(() => {});
    }
  );
  window.addEventListener("focus", () => {
    enqueueFocusSignal("FOCUS_GAINED");
  });
  window.addEventListener("blur", () => {
    enqueueFocusSignal("FOCUS_LOST");
  });
  window.addEventListener(
    "beforeunload",
    () => {
      flushChanges({
        keepalive: true,
      }).catch(() => {});
      flushSignals({
        keepalive: true,
      }).catch(() => {});
    }
  );
  window.addEventListener(
    "pagehide",
    () => {
      enqueueFocusSignal("FOCUS_LOST");
      flushChanges({ keepalive: true }).catch(() => {});
      flushSignals({ keepalive: true }).catch(() => {});
    }
  );

  enqueueFocusSignal("FOCUS_GAINED");
  const currentUrl = new URL(
    window.location.href
  );
  if (
    currentUrl.searchParams.has(
      "started"
    ) ||
    currentUrl.searchParams.has(
      "question"
    )
  ) {
    currentUrl.searchParams.delete(
      "started"
    );
    currentUrl.searchParams.delete(
      "question"
    );
    window.history.replaceState(
      {},
      "",
      `${currentUrl.pathname}${
        currentUrl.search
      }${currentUrl.hash}`
    );
  }
  refreshAnswered();
  refreshTimer();
  window.setInterval(refreshTimer, 1000);
  window.setInterval(() => {
    enqueueSignal("HEARTBEAT");
    flushSignals().catch(() => {});
  }, 15 * 1000);
})();

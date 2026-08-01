(() => {
  const root = document.querySelector(
    "[data-arena-match-attempt]"
  );
  if (!root) return;

  const matchId = root.dataset.matchId;
  const serverNow = new Date(
    root.dataset.serverNow
  ).getTime();
  const deadline = new Date(
    root.dataset.deadline
  ).getTime();
  const finalQuestion =
    root.dataset.finalQuestion === "true";
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
        ? "시간 종료 · 제출 중"
        : finalQuestion
          ? "풀이 완료 처리 중"
          : "다음 문제 준비 중";
    errorBox.hidden = true;

    try {
      if (submissionMode === "TIME_LIMIT") {
        await flushChanges();
        const finalChanges = pendingChanges.splice(0, pendingChanges.length);
        await request(
          `/api/goat-arena/matches/${matchId}/submit`,
          {
            requestId: operationId(),
            changes: finalChanges,
            submissionMode,
          }
        );
      } else {
        window.clearTimeout(saveTimer);
        pendingChanges = [];
        await saveChain.catch(() => {});
        await request(
          `/api/goat-arena/matches/${matchId}/advance`,
          {
            requestId: operationId(),
            value: inputs[0]?.value || "",
          }
        );
      }
      window.location.reload();
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
    const remaining = Math.max(
      0,
      deadline -
        (Date.now() + clockOffset)
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
      enqueueSignal(
        document.hidden
          ? "FOCUS_LOST"
          : "FOCUS_GAINED"
      );
      flushSignals().catch(() => {});
    }
  );
  window.addEventListener("focus", () => {
    enqueueSignal("FOCUS_GAINED");
  });
  window.addEventListener("blur", () => {
    enqueueSignal("FOCUS_LOST");
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

  enqueueSignal("FOCUS_GAINED");
  refreshAnswered();
  refreshTimer();
  window.setInterval(refreshTimer, 1000);
  window.setInterval(() => {
    enqueueSignal("HEARTBEAT");
    flushSignals().catch(() => {});
  }, 15 * 1000);
})();

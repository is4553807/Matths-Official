(() => {
  const root = document.querySelector(
    "[data-arena-match-attempt]",
  );
  if (!root) return;

  // 원격 MathJax 초기화가 느린 환경에서도 공통 대기열이 준비 완료 후
  // 현재 문제지의 TeX만 안전하게 다시 조판한다.
  window.MatthsMath?.render(root);

  const matchId = root.dataset.matchId;
  const serverNow = new Date(
    root.dataset.serverNow,
  ).getTime();
  const deadline = new Date(
    root.dataset.deadline,
  ).getTime();
  const timeoutOperationId = String(
    root.dataset.timeoutOperationId ||
      "",
  ).trim();
  const finalQuestion =
    root.dataset.finalQuestion ===
    "true";
  const questionNumber = Math.max(
    1,
    Number(
      root.dataset.questionNumber,
    ) || 1,
  );
  const questionTimeLimitMs = Math.max(
    1000,
    Number(
      root.dataset.questionTimeLimitMs,
    ) || 10 * 60 * 1000,
  );
  const clockOffset =
    serverNow - Date.now();
  const timer = root.querySelector(
    "[data-arena-match-timer]",
  );
  const saveState = root.querySelector(
    "[data-arena-match-save-state]",
  );
  const answered = root.querySelector(
    "[data-arena-match-answered]",
  );
  const submitButton =
    root.querySelector(
      "[data-arena-match-submit]",
    );
  const defaultSubmitLabel =
    submitButton?.textContent ||
    (finalQuestion
      ? "5번 완료 · 증거 제출로"
      : "다음 문제");
  const errorBox = root.querySelector(
    "[data-arena-match-error]",
  );
  const inputs = [
    ...root.querySelectorAll(
      "[data-arena-answer]",
    ),
  ];
  let pendingChanges = [];
  let pendingAnswerSave = null;
  let pendingSignals = [];
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let answerSaveRetryAllowed = true;
  let submitting = false;
  let automaticSubmitRequested = false;
  let pendingAdvance = null;
  let advanceRetryAllowed = true;
  let networkController = null;
  let lastFocusSignalType = "";
  let lastFocusSignalAt = 0;
  let navigationGuardEnabled = true;
  let restoringGuardHistory = false;
  let pageExitSignalQueued = false;

  const exitWarningMessage =
    "1대1 매치가 진행 중입니다. 지금 나가도 제한 시간은 계속 흐르며, 저장되지 않은 답안은 사라질 수 있습니다. 경기 화면에서 나가시겠습니까?";

  const releaseNavigationGuard = () => {
    navigationGuardEnabled = false;
  };

  const confirmMatchExit = () => {
    if (!navigationGuardEnabled)
      return true;
    if (
      !window.confirm(
        exitWarningMessage,
      )
    ) {
      return false;
    }
    releaseNavigationGuard();
    return true;
  };

  const operationId = () =>
    window.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}-arena-operation`;

  const clientAt = () =>
    new Date().toISOString();

  const hasPendingNetworkWork = () =>
    pendingChanges.length > 0 ||
    Boolean(pendingAnswerSave) ||
    Boolean(pendingAdvance);

  const canRetryNetworkWork = () =>
    !submitting &&
    (pendingAnswerSave ||
    pendingChanges.length
      ? answerSaveRetryAllowed
      : pendingAdvance
        ? advanceRetryAllowed
        : false);

  const isRetryableRequestError = (
    error,
  ) => {
    const status =
      Number(error?.status) || 0;
    return (
      !status ||
      status === 408 ||
      status === 409 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  };

  // advance 응답을 받았다면 서버가 요청을 해석했다는 뜻이다. 새 답안으로
  // 다시 제출할 수 있게 요청을 폐기하고, 응답 자체가 사라졌거나 서버가
  // 완료 여부를 확정하지 못한 5xx에서만 같은 operationId를 재사용한다.
  const isAmbiguousAdvanceError = (
    error,
  ) => {
    const status =
      Number(error?.status) || 0;
    return !status || status >= 500;
  };

  const request = async (
    path,
    body,
    { keepalive = false } = {},
  ) => {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
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
          "경기 요청을 처리하지 못했습니다.",
      );
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const showError = (
    message,
    kind = "request",
  ) => {
    if (!errorBox) return;
    errorBox.dataset.errorKind = kind;
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const clearError = (kind) => {
    if (
      !errorBox ||
      errorBox.dataset.errorKind !==
        kind
    ) {
      return;
    }
    errorBox.dataset.errorKind = "";
    errorBox.textContent = "";
    errorBox.hidden = true;
  };

  const refreshAnswered = () => {
    if (!answered) return;
  };

  const enqueueChange = (input) => {
    if (!pendingAnswerSave) {
      answerSaveRetryAllowed = true;
    }
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
      .then(async () => {
        if (
          !pendingAnswerSave &&
          !pendingChanges.length
        ) {
          return true;
        }
        if (
          navigator.onLine === false
        ) {
          saveState.textContent =
            "연결 대기 · 미저장";
          networkController?.showOffline();
          return false;
        }
        while (
          pendingAnswerSave ||
          pendingChanges.length
        ) {
          const saveOperation =
            pendingAnswerSave || {
              requestId: operationId(),
              changes:
                pendingChanges.splice(
                  0,
                  pendingChanges.length,
                ),
            };
          // 응답이 유실돼도 같은 본문·requestId를 다시 보내야 서버의
          // ARENA_SAVE 멱등 영수증이 중복 이벤트와 revision 증가를 막는다.
          pendingAnswerSave =
            saveOperation;
          saveState.textContent =
            "저장 중";
          try {
            await request(
              `/api/goat-arena/matches/${matchId}/answers`,
              saveOperation,
              { keepalive },
            );
            pendingAnswerSave = null;
            answerSaveRetryAllowed = true;
          } catch (error) {
            pendingAnswerSave =
              saveOperation;
            answerSaveRetryAllowed =
              isRetryableRequestError(
                error,
              );
            saveState.textContent =
              "저장 실패";
            if (!keepalive) {
              showError(
                answerSaveRetryAllowed
                  ? `${error.message} 답안은 이 화면에 남아 있습니다.`
                  : error.message,
                "save",
              );
              networkController?.showRetryable(
                answerSaveRetryAllowed
                  ? "답안은 이 화면에 남아 있습니다. 저장 다시 시도를 눌러 서버에 반영해 주세요."
                  : "현재 경기 상태에서는 다시 저장할 수 없습니다. 페이지를 새로고침해 상태를 확인해 주세요.",
              );
            }
            if (error.status === 423) {
              window.location.reload();
            }
            throw error;
          }
        }
        saveState.textContent =
          "자동 저장 완료";
        clearError("save");
        if (!hasPendingNetworkWork()) {
          networkController?.markSaved();
        }
        return true;
      });
    return saveChain;
  };

  const enqueueSignal = (
    type,
    questionKey = "",
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

  const enqueuePageExitSignal = () => {
    if (
      submitting ||
      pageExitSignalQueued
    ) {
      return;
    }
    pageExitSignalQueued = true;
    enqueueSignal(
      "PAGE_EXITED",
      inputs[0]?.dataset.arenaAnswer ||
        "",
    );
  };

  const flushSignals = async ({
    keepalive = false,
  } = {}) => {
    if (
      !pendingSignals.length ||
      submitting
    ) {
      return;
    }
    const batch = pendingSignals.splice(
      0,
      pendingSignals.length,
    );
    try {
      await request(
        `/api/goat-arena/matches/${matchId}/activity`,
        {
          requestId: operationId(),
          signals: batch,
        },
        { keepalive },
      );
    } catch (error) {
      pendingSignals = [
        ...batch,
        ...pendingSignals,
      ].slice(-200);
    }
  };

  const setInputsDisabled = (
    disabled,
  ) => {
    inputs.forEach((input) => {
      input.disabled = disabled;
    });
  };

  const submit = async (
    submissionMode = "MANUAL",
  ) => {
    if (submitting) return false;
    const isExistingAdvance = Boolean(
      pendingAdvance,
    );
    const effectiveMode =
      pendingAdvance?.submissionMode ||
      submissionMode;
    if (
      !isExistingAdvance &&
      effectiveMode === "MANUAL" &&
      finalQuestion &&
      !window.confirm(
        "5번 답안을 확정하고 풀이 증거 제출 단계로 이동할까요? 이후에는 문제를 다시 볼 수 없습니다.",
      )
    ) {
      return false;
    }

    if (!pendingAdvance) {
      pendingAdvance = {
        requestId:
          effectiveMode ===
            "TIME_LIMIT" &&
          timeoutOperationId
            ? timeoutOperationId
            : operationId(),
        // TIME_LIMIT도 잠긴 순간의 최신 답을 같은 advance 본문에 보관한다.
        // 재전송은 이 값과 operationId를 함께 재사용한다.
        value: inputs[0]?.value || "",
        submissionMode: effectiveMode,
      };
      advanceRetryAllowed = true;
    }

    submitting = true;
    setInputsDisabled(true);
    submitButton.disabled = true;
    submitButton.textContent =
      effectiveMode === "TIME_LIMIT"
        ? `${questionNumber}번 시간 종료 · 다음 문항 준비 중`
        : isExistingAdvance
          ? "제출 상태 확인 중"
          : finalQuestion
            ? "풀이 완료 처리 중"
            : "다음 문제 준비 중";
    errorBox.hidden = true;

    if (navigator.onLine === false) {
      submitting = false;
      saveState.textContent =
        "연결 대기 · 제출 미확인";
      submitButton.textContent =
        "연결 복구 대기";
      networkController?.showOffline();
      return false;
    }

    let requestPhase = "prepare";
    try {
      window.clearTimeout(saveTimer);
      if (
        effectiveMode === "TIME_LIMIT"
      ) {
        requestPhase = "save";
        let saved = false;
        try {
          saved = await flushChanges();
        } catch (error) {
          const status =
            Number(error.status) || 0;
          const confirmedSaveRejection =
            status >= 400 &&
            status < 500 &&
            ![
              408,
              423,
              425,
              429,
            ].includes(status);
          if (!confirmedSaveRejection)
            throw error;
          // 만료 뒤 scheduler가 먼저 문항을 넘기면 기존 문항 debounce save는
          // 400/409/410으로 확정 거절될 수 있다. pending advance가 같은 timeout
          // operation에서 최신 값을 원자 보완하므로 확정 4xx만 폐기한다.
          // 전송 여부가 모호한 408/425/429/5xx는 같은 save id로 계속 확인한다.
          pendingAnswerSave = null;
          pendingChanges = [];
          answerSaveRetryAllowed = true;
          saveChain = Promise.resolve();
          clearError("save");
          saved = true;
        }
        if (
          !saved ||
          pendingAnswerSave ||
          pendingChanges.length
        ) {
          submitting = false;
          return false;
        }
      } else if (!isExistingAdvance) {
        pendingChanges = [];
        await saveChain.catch(() => {});
        // 진행 중이던 저장 실패가 이전 답안을 다시 큐에 넣어도,
        // advance 본문이 보유한 현재 값이 이 논리 제출의 정본이다.
        pendingChanges = [];
        pendingAnswerSave = null;
      }
      requestPhase = "advance";
      const result = await request(
        `/api/goat-arena/matches/${matchId}/advance`,
        pendingAdvance,
      );
      pendingAdvance = null;
      pendingAnswerSave = null;
      pendingChanges = [];
      advanceRetryAllowed = true;
      saveState.textContent =
        "제출 확인 완료";
      if (result.finalQuestion) {
        releaseNavigationGuard();
        window.location.assign(
          `/goat-arena/matches/${matchId}`,
        );
      } else {
        const nextQuestion =
          Number(
            result.currentQuestionIndex,
          ) + 1;
        releaseNavigationGuard();
        window.location.assign(
          `/goat-arena/matches/${matchId}?question=${nextQuestion}`,
        );
      }
    } catch (error) {
      if (
        error.status === 410 ||
        error.status === 423
      ) {
        releaseNavigationGuard();
        window.location.reload();
        return;
      }
      submitting = false;
      if (requestPhase === "save") {
        // pendingAnswerSave가 원래 operationId와 본문을 계속 소유한다.
        // 다음 네트워크 재시도는 저장을 먼저 끝낸 뒤에만 advance한다.
        advanceRetryAllowed = true;
        setInputsDisabled(true);
        submitButton.disabled =
          !answerSaveRetryAllowed;
        submitButton.textContent =
          answerSaveRetryAllowed
            ? "답안 저장 후 제출 다시 확인"
            : "새로고침해 상태 확인";
        saveState.textContent =
          "답안 저장 확인 필요";
        return false;
      }

      advanceRetryAllowed =
        isAmbiguousAdvanceError(error);
      if (advanceRetryAllowed) {
        // 전송 중 연결이 끊겼거나 5xx가 돌아오면 완료 여부가 모호하다.
        // 입력을 잠그고 같은 본문·operationId로만 상태를 확인한다.
        setInputsDisabled(true);
        submitButton.disabled = false;
        submitButton.textContent =
          "제출 상태 다시 확인";
        saveState.textContent =
          "제출 상태 확인 필요";
        showError(
          `${error.message} 같은 제출 번호로 상태를 다시 확인해 주세요.`,
          "submit",
        );
        networkController?.showRetryable(
          "제출 결과를 받지 못했습니다. 같은 제출 번호로 다시 확인하므로 문항이 중복 진행되지 않습니다.",
        );
        return false;
      }

      // 4xx validation 응답은 advance가 적용되지 않았다는 확정 응답이다.
      // 실패한 operationId를 버려 수정한 답을 새 제출로 보낼 수 있게 한다.
      pendingAdvance = null;
      advanceRetryAllowed = true;
      if (effectiveMode === "MANUAL") {
        setInputsDisabled(false);
        submitButton.disabled = false;
        submitButton.textContent =
          defaultSubmitLabel;
        saveState.textContent =
          "답안을 확인해 주세요";
        showError(
          `${error.message} 답안을 확인한 뒤 다시 제출해 주세요.`,
          "submit",
        );
        networkController?.markSaved();
        return false;
      }

      setInputsDisabled(true);
      submitButton.disabled = true;
      submitButton.textContent =
        "새로고침해 상태 확인";
      saveState.textContent =
        "제출 상태 확인 필요";
      showError(
        `${error.message} 페이지를 새로고침해 경기 상태를 확인해 주세요.`,
        "submit",
      );
      return false;
    }
  };

  const retryPendingNetworkWork =
    () => {
      if (pendingAdvance) {
        return submit(
          pendingAdvance.submissionMode,
        );
      }
      return flushChanges();
    };

  networkController =
    window.MatthsTimedAttemptNetwork?.create(
      {
        root,
        onRetry:
          retryPendingNetworkWork,
        hasPending:
          hasPendingNetworkWork,
        canRetry: canRetryNetworkWork,
      },
    ) || null;

  inputs.forEach((input) => {
    input.addEventListener(
      "focus",
      () => {
        enqueueSignal(
          "QUESTION_FOCUSED",
          input.dataset.arenaAnswer,
        );
      },
    );
    input.addEventListener(
      "input",
      () => {
        enqueueChange(input);
        refreshAnswered();
        saveState.textContent =
          "변경 사항 있음";
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(
          () =>
            flushChanges().catch(
              () => {},
            ),
          800,
        );
      },
    );
  });

  submitButton?.addEventListener(
    "click",
    () => submit("MANUAL"),
  );

  const refreshTimer = () => {
    const remaining = Math.min(
      questionTimeLimitMs,
      Math.max(
        0,
        deadline -
          (Date.now() + clockOffset),
      ),
    );
    const seconds = Math.ceil(
      remaining / 1000,
    );
    const minutes = Math.floor(
      seconds / 60,
    );
    timer.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds % 60,
    ).padStart(2, "0")}`;
    root.classList.toggle(
      "arena-time-warning",
      remaining > 0 &&
        remaining <= 60 * 1000,
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
          : "FOCUS_GAINED",
      );
      flushSignals({
        keepalive: true,
      }).catch(() => {});
    },
  );
  window.addEventListener(
    "focus",
    () => {
      enqueueFocusSignal(
        "FOCUS_GAINED",
      );
    },
  );
  window.addEventListener(
    "blur",
    () => {
      enqueueFocusSignal("FOCUS_LOST");
    },
  );

  document.addEventListener(
    "click",
    (event) => {
      const link =
        event.target.closest?.(
          "a[href]",
        );
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(
        link.href,
        window.location.href,
      );
      const current = new URL(
        window.location.href,
      );
      const isSameDocumentAnchor =
        destination.origin ===
          current.origin &&
        destination.pathname ===
          current.pathname &&
        destination.search ===
          current.search &&
        destination.hash;
      if (isSameDocumentAnchor) return;

      if (!confirmMatchExit()) {
        event.preventDefault();
      }
    },
    true,
  );

  window.addEventListener(
    "beforeunload",
    (event) => {
      flushChanges({
        keepalive: true,
      }).catch(() => {});
      flushSignals({
        keepalive: true,
      }).catch(() => {});
      if (navigationGuardEnabled) {
        event.preventDefault();
        // Chrome·Safari의 legacy 경로까지 포함해 새로고침·탭 닫기
        // 경고가 빠지지 않도록 truthy returnValue를 함께 설정한다.
        event.returnValue = true;
        return true;
      }
    },
  );
  window.addEventListener(
    "pagehide",
    () => {
      // 정상적인 다음 문항·최종 제출 이동은 submitting=true이므로 제외한다.
      // 브라우저 뒤로가기, 링크 이탈, 새로고침, 탭 닫기처럼 실제 문제
      // 문서가 종료된 경우에만 현재 문항과 함께 감사 이벤트를 남긴다.
      enqueuePageExitSignal();
      enqueueFocusSignal("FOCUS_LOST");
      flushChanges({
        keepalive: true,
      }).catch(() => {});
      flushSignals({
        keepalive: true,
      }).catch(() => {});
    },
  );

  enqueueFocusSignal("FOCUS_GAINED");
  const currentUrl = new URL(
    window.location.href,
  );
  if (
    currentUrl.searchParams.has(
      "started",
    ) ||
    currentUrl.searchParams.has(
      "question",
    )
  ) {
    currentUrl.searchParams.delete(
      "started",
    );
    currentUrl.searchParams.delete(
      "question",
    );
    window.history.replaceState(
      {},
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }

  const currentHistoryState =
    window.history.state || {};
  const historyGuardAlreadyInstalled =
    currentHistoryState.arenaMatchGuard ===
    matchId;
  if (!historyGuardAlreadyInstalled) {
    window.history.replaceState(
      {
        ...currentHistoryState,
        arenaMatchGuardBase: matchId,
      },
      "",
      window.location.href,
    );
    window.history.pushState(
      {
        ...currentHistoryState,
        arenaMatchGuard: matchId,
      },
      "",
      window.location.href,
    );
  }
  window.addEventListener(
    "popstate",
    () => {
      if (!navigationGuardEnabled)
        return;
      if (restoringGuardHistory) {
        restoringGuardHistory = false;
        return;
      }

      if (confirmMatchExit()) {
        window.history.back();
        return;
      }

      restoringGuardHistory = true;
      window.history.forward();
    },
  );
  window.addEventListener(
    "pageshow",
    (event) => {
      if (!event.persisted) return;
      // 명시적으로 나갔다가 BFCache의 경기 화면으로 돌아온 경우,
      // 서버의 최신 응시 상태를 받으면서 보호막도 새로 활성화한다.
      releaseNavigationGuard();
      window.location.reload();
    },
  );

  refreshAnswered();
  refreshTimer();
  window.setInterval(
    refreshTimer,
    1000,
  );
  window.setInterval(() => {
    enqueueSignal("HEARTBEAT");
    flushSignals().catch(() => {});
  }, 15 * 1000);
})();

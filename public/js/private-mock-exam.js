(() => {
  const selectionForm =
    document.querySelector(
      "[data-private-mock-selection]"
    );

  if (selectionForm) {
    const weekKey =
      selectionForm.dataset
        .weekKey;
    const status =
      selectionForm.querySelector(
        "[data-private-mock-selection-status]"
      );
    const submitSelection =
      async ({
        defer = false,
      } = {}) => {
        const selected =
          selectionForm.querySelector(
            'input[name="representativeAttempt"]:checked'
          );

        if (
          !defer &&
          !selected
        ) {
          status.textContent =
            "반영할 시험을 선택해 주세요.";
          return;
        }

        const buttons = [
          ...selectionForm.querySelectorAll(
            "button"
          ),
        ];
        buttons.forEach(
          (button) => {
            button.disabled = true;
          }
        );
        status.textContent =
          defer
            ? "선택을 미루는 중…"
            : "대표 성적을 저장하는 중…";

        try {
          const response =
            await fetch(
              `/api/private-mock-exams/weeks/${encodeURIComponent(weekKey)}/selection`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    attemptId:
                      selected?.value ||
                      null,
                    defer,
                  }),
              }
            );
          const payload =
            await response.json();

          if (!response.ok) {
            throw new Error(
              payload.message ||
                payload.error ||
                "대표 성적을 저장하지 못했습니다."
            );
          }

          status.textContent =
            defer
              ? "3회차까지 선택을 미뤘습니다."
              : "최종 종합 랭킹 대표 성적을 저장했습니다.";
          if (defer) {
            selectionForm
              .querySelectorAll(
                'input[name="representativeAttempt"]'
              )
              .forEach((input) => {
                input.checked =
                  false;
              });
          }
        } catch (error) {
          status.textContent =
            error.message;
        } finally {
          buttons.forEach(
            (button) => {
              button.disabled =
                false;
            }
          );
        }
      };

    selectionForm.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        submitSelection();
      }
    );
    selectionForm
      .querySelector(
        "[data-private-mock-defer]"
      )
      ?.addEventListener(
        "click",
        () =>
          submitSelection({
            defer: true,
          })
      );
  }

  const pendingResult =
    document.querySelector(
      "[data-private-mock-result-pending]"
    );

  if (pendingResult) {
    const countdown =
      pendingResult.querySelector(
        "[data-private-mock-result-countdown]"
      );
    const resultsAt =
      new Date(
        pendingResult.dataset
          .resultsAt
      ).getTime();
    const serverNow =
      new Date(
        pendingResult.dataset
          .serverNow
      ).getTime();
    const clockOffset =
      Number.isFinite(
        serverNow
      )
        ? serverNow -
          Date.now()
        : 0;
    let reloadRequested =
      false;
    const refreshPending =
      () => {
        const remaining =
          resultsAt -
          (
            Date.now() +
            clockOffset
          );

        if (remaining <= 0) {
          if (!reloadRequested) {
            reloadRequested =
              true;
            countdown.textContent =
              "집계 중…";
            window.setTimeout(
              () =>
                window.location.reload(),
              2500
            );
          }
          return;
        }

        const totalSeconds =
          Math.ceil(
            remaining / 1000
          );
        const hours =
          Math.floor(
            totalSeconds / 3600
          );
        const minutes =
          Math.floor(
            (
              totalSeconds % 3600
            ) / 60
          );
        const seconds =
          totalSeconds % 60;
        countdown.textContent =
          hours > 0
            ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
            : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      };

    refreshPending();
    window.setInterval(
      refreshPending,
      1000
    );
  }

  const root =
    document.querySelector(
      "[data-private-mock-exam]"
    );

  if (!root) return;

  const examId =
    root.dataset.examId;

  if (
    root.dataset.notStarted ===
    "true"
  ) {
    const startButton =
      root.querySelector(
        "[data-private-mock-start]"
      );
    const countdown =
      root.querySelector(
        "[data-private-mock-lobby-countdown]"
      );
    const releaseAt =
      new Date(
        root.dataset.releaseAt
      ).getTime();
    const serverNow =
      new Date(
        root.dataset.serverNow
      ).getTime();
    const clockOffset =
      Number.isFinite(serverNow)
        ? serverNow -
          Date.now()
        : 0;
    const tools =
      root.querySelector(
        "[data-private-mock-lobby-tools]"
      );
    const toolPanel =
      root.querySelector(
        "[data-private-mock-lobby-tool-panel]"
      );
    const toolFrame =
      root.querySelector(
        "[data-private-mock-lobby-tool-frame]"
      );
    const closeTool =
      () => {
        if (toolPanel) {
          toolPanel.hidden =
            true;
        }
        if (toolFrame) {
          toolFrame.removeAttribute(
            "src"
          );
        }
      };
    const refreshLobby =
      () => {
        const remaining =
          Math.max(
            0,
            releaseAt -
              (
                Date.now() +
                clockOffset
              )
          );
        const totalSeconds =
          Math.ceil(
            remaining / 1000
          );
        const minutes =
          Math.floor(
            totalSeconds / 60
          );
        const seconds =
          totalSeconds % 60;

        if (countdown) {
          countdown.textContent =
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`;
        }

        root.classList.toggle(
          "lobby-final-five",
          remaining > 0 &&
            remaining <=
              5000
        );
        const toolsLocked =
          remaining <=
          30 * 1000;
        if (toolsLocked) {
          closeTool();
          if (tools) {
            tools.hidden =
              true;
          }
        }

        if (
          remaining <= 0 &&
          startButton
        ) {
          startButton.classList.remove(
            "disabled"
          );
          startButton.setAttribute(
            "aria-disabled",
            "false"
          );
          startButton.removeAttribute(
            "tabindex"
          );
          startButton.innerHTML =
            "시험 시작 <span aria-hidden=\"true\">→</span>";
        }
      };

    root
      .querySelectorAll(
        "[data-private-mock-lobby-tool]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const type =
              button.dataset
                .privateMockLobbyTool;
            const href =
              type === "quick"
                ? startButton
                    ?.dataset
                    .quickHref
                : startButton
                    ?.dataset
                    .formulaHref;

            if (
              !href ||
              !toolPanel ||
              !toolFrame
            ) {
              return;
            }
            toolFrame.src =
              href;
            toolPanel.hidden =
              false;
          }
        );
      });
    root
      .querySelector(
        "[data-private-mock-lobby-tool-close]"
      )
      ?.addEventListener(
        "click",
        closeTool
      );

    startButton?.addEventListener(
      "click",
      async (event) => {
        if (
          startButton.getAttribute(
            "aria-disabled"
          ) === "true"
        ) {
          event.preventDefault();
          return;
        }
        startButton.disabled =
          true;
        startButton.textContent =
          "타이머 시작 중…";

        try {
          const response =
            await fetch(
              `/api/private-mock-exams/${examId}/start`,
              {
                method:
                  "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
              }
            );
          const payload =
            await response
              .json()
              .catch(
                () => ({})
              );

          if (!response.ok) {
            throw new Error(
              payload.message ||
                "시험을 시작하지 못했습니다."
            );
          }

          window.location.reload();
        } catch (error) {
          startButton.disabled =
            false;
          startButton.textContent =
            error.message;
        }
      }
    );
    refreshLobby();
    window.setInterval(
      refreshLobby,
      1000
    );
    return;
  }

  const serverNow =
    new Date(
      root.dataset.serverNow
    ).getTime();
  const deadline =
    new Date(
      root.dataset.deadline
    ).getTime();
  const clockOffset =
    serverNow - Date.now();
  const timer =
    root.querySelector(
      "[data-private-mock-timer]"
    );
  const form =
    root.querySelector(
      "[data-private-mock-form]"
    );
  const inputs = [
    ...root.querySelectorAll(
      "[data-private-mock-answer]"
    ),
  ];
  const answered =
    root.querySelector(
      "[data-private-mock-answered]"
    );
  const saveState =
    root.querySelector(
      "[data-private-mock-save-state]"
    );
  const errorBox =
    root.querySelector(
      "[data-private-mock-error]"
    );
  const submitButton =
    root.querySelector(
      "[data-private-mock-submit]"
    );
  let saveTimer = null;
  let saving = false;
  let saveRequested = false;
  let answerRevision = 0;
  let saveFailed = false;
  let draftRetryAllowed = true;
  let submitting = false;
  let automaticSubmitRequested = false;
  let dirty = false;
  let telemetryEvents = [];
  let errorKind = "";
  let networkController = null;
  const automaticSubmitRetryDelays = [
    180,
    360,
  ];
  const automaticSubmitLeadMs =
    5 * 1000;
  let pendingSubmissionSnapshot =
    null;

  const hasPendingSave = () =>
    dirty ||
    saving ||
    saveFailed ||
    telemetryEvents.length > 0;

  const trackEvent = (
    eventType,
    extra = {}
  ) => {
    telemetryEvents.push({
      eventType,
      clientAt:
        new Date().toISOString(),
      ...extra,
    });
    if (
      telemetryEvents.length >
      200
    ) {
      telemetryEvents =
        telemetryEvents.slice(
          -200
        );
    }
    if (saving) {
      saveRequested = true;
    }
  };

  const getAnswers = () =>
    inputs.map(
      (input) =>
        input.value.trim()
    );

  const refreshAnswered = () => {
    answered.textContent =
      String(
        getAnswers().filter(Boolean)
          .length
      );
  };

  const submissionRequestId = () =>
    window.crypto
      ?.randomUUID?.() ||
    `private-mock-submit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const showError = (
    message,
    kind = "request"
  ) => {
    errorKind = kind;
    errorBox.textContent =
      message;
    errorBox.hidden = false;
  };

  const clearError = (kind) => {
    if (errorKind !== kind) return;
    errorKind = "";
    errorBox.textContent = "";
    errorBox.hidden = true;
  };

  const save = async ({
    keepalive = false,
  } = {}) => {
    if (saving) {
      saveRequested = true;
      return false;
    }
    if (submitting) {
      return false;
    }
    if (
      !dirty &&
      !telemetryEvents.length &&
      !saveFailed
    ) {
      return true;
    }
    if (navigator.onLine === false) {
      saveFailed = true;
      draftRetryAllowed = true;
      saveState.textContent =
        "연결 대기 · 미저장";
      networkController?.showOffline();
      return false;
    }

    saving = true;
    saveRequested = false;
    saveState.textContent =
      "저장 중";
    const revisionAtStart =
      answerRevision;
    const answersAtStart =
      getAnswers();
    const eventBatch =
      telemetryEvents.slice();
    let requestSucceeded = false;

    try {
      const response =
        await fetch(
          `/api/private-mock-exams/${examId}/draft`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              answers:
                answersAtStart,
              telemetryEvents:
                eventBatch,
            }),
            keepalive,
          }
        );

      if (!response.ok) {
        const payload =
          await response
            .json()
            .catch(() => ({}));
        const requestError = new Error(
          payload.message ||
            "답안을 저장하지 못했습니다."
        );
        requestError.status =
          response.status;
        throw requestError;
      }

      const acknowledgedEvents =
        new Set(eventBatch);
      telemetryEvents =
        telemetryEvents.filter(
          (event) =>
            !acknowledgedEvents.has(
              event
            )
        );
      dirty =
        answerRevision !==
        revisionAtStart;
      saveFailed = false;
      draftRetryAllowed = true;
      requestSucceeded = true;
      saveState.textContent =
        dirty ||
        telemetryEvents.length
          ? "새 변경 저장 대기"
          : "자동 저장 완료";
      clearError("save");
      if (
        dirty ||
        telemetryEvents.length
      ) {
        saveRequested = true;
      }
      return true;
    } catch (error) {
      saveFailed = true;
      const status =
        Number(error.status) || 0;
      draftRetryAllowed =
        !status ||
        status === 408 ||
        status === 425 ||
        status === 429 ||
        status >= 500;
      saveState.textContent =
        draftRetryAllowed
          ? "저장 실패 · 다시 시도 필요"
          : "저장할 수 없음";
      if (!keepalive) {
        showError(
          draftRetryAllowed
            ? `${error.message} 입력은 이 화면에 남아 있습니다.`
            : error.message,
          "save"
        );
        networkController?.showRetryable(
          draftRetryAllowed
            ? "입력은 이 화면에 남아 있습니다. 저장 다시 시도를 눌러 서버에 반영해 주세요."
            : "현재 응시 상태에서는 다시 저장할 수 없습니다. 페이지를 새로고침해 상태를 확인해 주세요."
        );
      }
      return false;
    } finally {
      saving = false;
      if (
        requestSucceeded &&
        !hasPendingSave()
      ) {
        networkController?.markSaved();
      }
      if (
        saveRequested &&
        !keepalive &&
        !submitting &&
        navigator.onLine !== false
      ) {
        queueMicrotask(
          () => void save()
        );
      }
    }
  };

  networkController =
    window.MatthsTimedAttemptNetwork
      ?.create({
        root,
        onRetry: () => save(),
        hasPending:
          hasPendingSave,
        canRetry: () =>
          draftRetryAllowed &&
          !submitting,
      }) || null;

  const submit = async (
    automatic = false
  ) => {
    if (submitting) return;

    if (
      !automatic &&
      !window.confirm(
        "답안을 최종 제출할까요? 제출 후에는 수정할 수 없습니다."
      )
    ) {
      return;
    }

    submitting = true;
    inputs.forEach((input) => {
      input.disabled = true;
    });
    root
      .querySelectorAll(
        "[data-private-mock-choice], [data-private-mock-key]"
      )
      .forEach((control) => {
        control.disabled = true;
      });
    submitButton.disabled = true;
    submitButton.textContent =
      automatic
        ? "마감 보호 · 자동 제출 중"
        : "제출 중";
    errorBox.hidden = true;
    if (!pendingSubmissionSnapshot) {
      pendingSubmissionSnapshot = {
        requestId:
          submissionRequestId(),
        capturedAt:
          new Date(
            Date.now() +
              clockOffset
          ).toISOString(),
        answers: getAnswers(),
        telemetryEvents:
          telemetryEvents.slice(),
      };
    }
    const submissionBody =
      JSON.stringify(
        pendingSubmissionSnapshot
      );
    const maximumAttempts =
      automatic
        ? automaticSubmitRetryDelays.length +
          1
        : 1;
    let attempt = 0;

    try {
      while (
        attempt <
        maximumAttempts
      ) {
        attempt += 1;
        if (
          automatic &&
          attempt > 1
        ) {
          submitButton.textContent =
            `마감 보호 · 자동 제출 재시도 ${attempt}/${maximumAttempts}`;
        }

        try {
          const response =
            await fetch(
              `/api/private-mock-exams/${examId}/submit`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  "Idempotency-Key":
                    pendingSubmissionSnapshot
                      .requestId,
                },
                body:
                  submissionBody,
              }
            );
          const payload =
            await response
              .json()
              .catch(
                () => ({})
              );

          if (!response.ok) {
            if (
              (
                response.status ===
                  409 ||
                response.status ===
                  410
              )
            ) {
              window.location.reload();
              return true;
            }

            const requestError =
              new Error(
                payload.message ||
                  "답안을 제출하지 못했습니다."
              );
            requestError.status =
              response.status;
            throw requestError;
          }

          window.location.reload();
          return true;
        } catch (error) {
          const status =
            Number(
              error.status
            ) || 0;
          const transient =
            !status ||
            status === 408 ||
            status === 425 ||
            status === 429 ||
            status >= 500;
          const retryDelay =
            automaticSubmitRetryDelays[
              attempt - 1
            ];

          if (
            !automatic ||
            !transient ||
            retryDelay ===
              undefined
          ) {
            throw error;
          }

          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                retryDelay
              )
          );
        }
      }
    } catch (error) {
      submitting = false;
      if (automatic) {
        submitButton.disabled =
          false;
        submitButton.textContent =
          "자동 제출 다시 시도";
        showError(
          `${error.message} 자동 제출을 ${attempt}회 시도했습니다. 답안은 이 화면에 남아 있습니다. 연결을 확인한 뒤 버튼을 눌러 제출 상태를 다시 확인해 주세요.`,
          "submit"
        );
      } else {
        submitButton.disabled =
          false;
        submitButton.textContent =
          "답안 최종 제출";
        showError(
          `${error.message} 답안은 이 화면에 남아 있습니다.`,
          "submit"
        );
      }
      return false;
    }
  };

  inputs.forEach((input) => {
    input.addEventListener(
      "focus",
      () => {
        trackEvent(
          "QUESTION_FOCUSED",
          {
            questionNumber:
              Number(
                input.dataset
                  .privateMockAnswer
              ) + 1,
          }
        );
      }
    );
    input.addEventListener(
      "input",
      () => {
        dirty = true;
        saveFailed = false;
        draftRetryAllowed = true;
        answerRevision += 1;
        trackEvent(
          "ANSWER_CHANGED",
          {
            questionNumber:
              Number(
                input.dataset
                  .privateMockAnswer
              ) + 1,
            answerLength:
              input.value.length,
          }
        );
        refreshAnswered();
        saveState.textContent =
          "변경 사항 있음";
        window.clearTimeout(
          saveTimer
        );
        saveTimer =
          window.setTimeout(
            () => save(),
            700
          );
      }
    );
  });

  root.addEventListener(
    "click",
    (event) => {
      const choice =
        event.target.closest(
          "[data-private-mock-choice]"
        );
      const keyboardKey =
        event.target.closest(
          "[data-private-mock-key]"
        );

      if (choice) {
        const index =
          Number(
            choice.dataset
              .answerIndex
          );
        const input =
          inputs.find(
            (candidate) =>
              Number(
                candidate.dataset
                  .privateMockAnswer
              ) === index
          );

        if (!input) return;
        trackEvent(
          "QUESTION_FOCUSED",
          {
            questionNumber:
              index + 1,
          }
        );
        input.value =
          choice.dataset
            .privateMockChoice;
        choice
          .parentElement
          .querySelectorAll(
            "[data-private-mock-choice]"
          )
          .forEach(
            (button) => {
              const selected =
                button ===
                choice;
              button.classList.toggle(
                "selected",
                selected
              );
              button.setAttribute(
                "aria-checked",
                String(
                  selected
                )
              );
            }
          );
        input.dispatchEvent(
          new Event("input", {
            bubbles: true,
          })
        );
        return;
      }

      if (keyboardKey) {
        const index =
          Number(
            keyboardKey.dataset
              .answerIndex
          );
        const input =
          inputs.find(
            (candidate) =>
              Number(
                candidate.dataset
                  .privateMockAnswer
              ) === index
          );

        if (!input) return;
        const key =
          keyboardKey.dataset
            .privateMockKey;
        const start =
          input.selectionStart ??
          input.value.length;
        const end =
          input.selectionEnd ??
          input.value.length;

        if (
          key === "backspace"
        ) {
          if (start !== end) {
            input.value =
              input.value.slice(
                0,
                start
              ) +
              input.value.slice(
                end
              );
            input.setSelectionRange(
              start,
              start
            );
          } else if (start > 0) {
            input.value =
              input.value.slice(
                0,
                start - 1
              ) +
              input.value.slice(
                end
              );
            input.setSelectionRange(
              start - 1,
              start - 1
            );
          }
        } else {
          input.value =
            input.value.slice(
              0,
              start
            ) +
            key +
            input.value.slice(
              end
            );
          const nextPosition =
            start + key.length;
          input.setSelectionRange(
            nextPosition,
            nextPosition
          );
        }

        input.focus();
        input.dispatchEvent(
          new Event("input", {
            bubbles: true,
          })
        );
      }
    }
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      submit();
    }
  );

  const tick = () => {
    const remaining =
      deadline -
      (
        Date.now() +
        clockOffset
      );

    if (
      remaining <=
      automaticSubmitLeadMs
    ) {
      const protectedSeconds =
        Math.max(
          0,
          Math.ceil(
            remaining / 1000
          )
        );
      timer.textContent =
        `00:${String(protectedSeconds).padStart(2, "0")}`;
      root.classList.add(
        "time-critical"
      );
      if (!automaticSubmitRequested) {
        automaticSubmitRequested =
          true;
        saveState.textContent =
          "마감 5초 전 · 최신 답안 전송 보호";
        void submit(true);
      }
      return;
    }

    const totalSeconds =
      Math.ceil(
        remaining / 1000
      );
    const minutes =
      Math.floor(
        totalSeconds / 60
      );
    const seconds =
      totalSeconds % 60;
    timer.textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    root.classList.toggle(
      "time-critical",
      remaining <= 60 * 1000
    );
  };

  window.setInterval(
    tick,
    250
  );
  window.setInterval(
    () => save(),
    15 * 1000
  );
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (
        !submitting &&
        hasPendingSave()
      ) {
        event.preventDefault();
        event.returnValue = true;
        return true;
      }
    }
  );
  window.addEventListener(
    "pagehide",
    () => {
      if (
        (
          dirty ||
          telemetryEvents.length
        ) &&
        !submitting
      ) {
        const body =
          new Blob(
            [
              JSON.stringify({
                answers:
                  getAnswers(),
                telemetryEvents,
              }),
            ],
            {
              type:
                "application/json",
            }
          );
        navigator.sendBeacon(
          `/api/private-mock-exams/${examId}/draft`,
          body
        );
      }
    }
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      trackEvent(
        document.hidden
          ? "VISIBILITY_HIDDEN"
          : "VISIBILITY_VISIBLE",
        {
          visibility:
            document
              .visibilityState,
        }
      );
    }
  );
  window.addEventListener(
    "blur",
    () =>
      trackEvent(
        "WINDOW_BLUR"
      )
  );
  window.addEventListener(
    "focus",
    () =>
      trackEvent(
        "WINDOW_FOCUS"
      )
  );

  refreshAnswered();
  tick();
})();

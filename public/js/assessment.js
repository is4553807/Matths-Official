document.addEventListener(
  "DOMContentLoaded",
  () => {
    const form =
      document.querySelector(
        "#assessment-paper"
      );
    const questions = [
      ...document.querySelectorAll(
        "[data-question]"
      ),
    ];
    const count =
      document.querySelector(
        "#answered-count"
      );
    const progress =
      document.querySelector(
        "#answered-progress"
      );
    const configElement =
      document.getElementById(
        "assessment-attempt-config"
      );
    const timer =
      document.getElementById(
        "assessment-timer"
      );
    const saveState =
      document.getElementById(
        "assessment-save-state"
      );
    const config = configElement
      ? JSON.parse(
          configElement.textContent
        )
      : null;
    const timerPanel =
      timer?.closest(
        ".attempt-timer"
      );
    const timerDragHandle =
      timerPanel?.querySelector(
        ".timer-drag-handle"
      );
    const currentQuestionNumber =
      document.getElementById(
        "current-question-number"
      );
    const activeQuestionInput =
      document.getElementById(
        "active-question-id"
      );
    const currentQuestionInput =
      document.getElementById(
        "current-question-index"
      );
    const previousButton =
      document.querySelector(
        "[data-question-previous]"
      );
    const nextButton =
      document.querySelector(
        "[data-question-next]"
      );
    const jumpButtons = [
      ...document.querySelectorAll(
        "[data-question-jump]"
      ),
    ];

    if (
      !form ||
      !questions.length ||
      !count ||
      !progress
    ) {
      return;
    }

    let localDeadline =
      Date.now() +
      Math.max(
        0,
        Number(
          config?.remainingTimeMs
        ) || 0
      );
    let saveTimer = null;
    let timerFrame = null;
    let submitting = false;
    let expiring = false;
    let heartbeatTimer = null;
    let saveQueue =
      Promise.resolve();
    let currentQuestionIndex =
      Math.max(
        0,
        Math.min(
          questions.length - 1,
          Number(
            config
              ?.initialQuestionIndex
          ) || 0
        )
      );

    const timerPositionKey =
      "matths-assessment-timer-position-v1";

    const resetTimerPosition =
      () => {
        if (!timerPanel) {
          return;
        }

        timerPanel.classList.remove(
          "floating",
          "dragging"
        );
        timerPanel.style.removeProperty(
          "left"
        );
        timerPanel.style.removeProperty(
          "top"
        );

        try {
          window.localStorage.removeItem(
            timerPositionKey
          );
        } catch (error) {
          // 저장 공간을 사용할 수 없어도
          // 타이머 이동 자체는 계속 동작한다.
        }
      };

    const placeFloatingTimer = (
      left,
      top
    ) => {
      if (!timerPanel) {
        return;
      }

      const width =
        timerPanel.offsetWidth;
      const height =
        timerPanel.offsetHeight;
      const margin = 10;
      const boundedLeft =
        Math.min(
          Math.max(
            margin,
            left
          ),
          Math.max(
            margin,
            window.innerWidth -
              width -
              margin
          )
        );
      const boundedTop =
        Math.min(
          Math.max(
            margin,
            top
          ),
          Math.max(
            margin,
            window.innerHeight -
              height -
              margin
          )
        );

      timerPanel.classList.add(
        "floating"
      );
      timerPanel.style.left =
        `${boundedLeft}px`;
      timerPanel.style.top =
        `${boundedTop}px`;
    };

    const saveTimerPosition =
      () => {
        if (
          !timerPanel?.classList.contains(
            "floating"
          )
        ) {
          return;
        }

        try {
          window.localStorage.setItem(
            timerPositionKey,
            JSON.stringify({
              left:
                Number.parseFloat(
                  timerPanel.style
                    .left
                ) || 0,
              top:
                Number.parseFloat(
                  timerPanel.style.top
                ) || 0,
            })
          );
        } catch (error) {
          // 위치 저장 실패는 응시 흐름을
          // 막지 않는다.
        }
      };

    if (
      timerPanel?.dataset
        .draggableTimer ===
        "true" &&
      timerDragHandle
    ) {
      try {
        const savedPosition =
          JSON.parse(
            window.localStorage.getItem(
              timerPositionKey
            ) || "null"
          );

        if (
          Number.isFinite(
            savedPosition?.left
          ) &&
          Number.isFinite(
            savedPosition?.top
          )
        ) {
          placeFloatingTimer(
            savedPosition.left,
            savedPosition.top
          );
        }
      } catch (error) {
        resetTimerPosition();
      }

      let dragOffsetX = 0;
      let dragOffsetY = 0;

      timerDragHandle.addEventListener(
        "pointerdown",
        (event) => {
          if (
            event.button !== 0
          ) {
            return;
          }

          const rect =
            timerPanel.getBoundingClientRect();
          dragOffsetX =
            event.clientX -
            rect.left;
          dragOffsetY =
            event.clientY -
            rect.top;
          placeFloatingTimer(
            rect.left,
            rect.top
          );
          timerPanel.classList.add(
            "dragging"
          );
          timerDragHandle.setPointerCapture(
            event.pointerId
          );
          event.preventDefault();
        }
      );

      timerDragHandle.addEventListener(
        "pointermove",
        (event) => {
          if (
            !timerPanel.classList.contains(
              "dragging"
            )
          ) {
            return;
          }

          placeFloatingTimer(
            event.clientX -
              dragOffsetX,
            event.clientY -
              dragOffsetY
          );
        }
      );

      const finishTimerDrag =
        (event) => {
          if (
            !timerPanel.classList.contains(
              "dragging"
            )
          ) {
            return;
          }

          timerPanel.classList.remove(
            "dragging"
          );

          if (
            timerDragHandle.hasPointerCapture(
              event.pointerId
            )
          ) {
            timerDragHandle.releasePointerCapture(
              event.pointerId
            );
          }
          saveTimerPosition();
        };

      timerDragHandle.addEventListener(
        "pointerup",
        finishTimerDrag
      );
      timerDragHandle.addEventListener(
        "pointercancel",
        finishTimerDrag
      );
      timerDragHandle.addEventListener(
        "dblclick",
        resetTimerPosition
      );
      timerDragHandle.addEventListener(
        "keydown",
        (event) => {
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];

          if (!direction) {
            return;
          }

          const rect =
            timerPanel.getBoundingClientRect();
          const distance =
            event.shiftKey
              ? 32
              : 12;
          placeFloatingTimer(
            rect.left +
              direction[0] *
                distance,
            rect.top +
              direction[1] *
                distance
          );
          saveTimerPosition();
          event.preventDefault();
        }
      );
      window.addEventListener(
        "resize",
        () => {
          if (
            timerPanel.classList.contains(
              "floating"
            )
          ) {
            placeFloatingTimer(
              Number.parseFloat(
                timerPanel.style.left
              ) || 0,
              Number.parseFloat(
                timerPanel.style.top
              ) || 0
            );
            saveTimerPosition();
          }
        }
      );
    }

    const remainingTime = () =>
      Math.max(
        0,
        localDeadline -
          Date.now()
      );

    const formatCountdown = (
      value
    ) => {
      const remainingSeconds =
        Math.max(
          0,
          Math.ceil(
            value / 1000
          )
        );
      const minutes = Math.floor(
        remainingSeconds / 60
      );
      const seconds =
        remainingSeconds % 60;

      return [minutes, seconds]
        .map((part) =>
          String(part).padStart(
            2,
            "0"
          )
        )
        .join(":");
    };

    const renderTimer = () => {
      const remaining =
        remainingTime();

      if (timer) {
        timer.textContent =
          formatCountdown(
            remaining
          );
      }

      timerPanel?.classList.toggle(
        "warning",
        remaining > 0 &&
          remaining <= 60000
      );

      if (remaining <= 0) {
        expireForTimeout();
        return;
      }

      timerFrame =
        window.requestAnimationFrame(
          renderTimer
        );
    };

    const answersFromForm = () => {
      const answers = {};
      const formData =
        new FormData(form);

      for (const [
        key,
        value,
      ] of formData.entries()) {
        const match = key.match(
          /^answers\[(.+)\]$/
        );

        if (match) {
          answers[match[1]] =
            value;
        }
      }

      return answers;
    };

    const activeQuestionPayload =
      () => {
        const question =
          questions[
            currentQuestionIndex
          ];

        return {
          activeQuestionId:
            question?.dataset
              .questionId || "",
          currentQuestionIndex,
        };
      };

    function disablePaper() {
      form
        .querySelectorAll(
          "input, button"
        )
        .forEach((control) => {
          control.disabled = true;
        });
    }

    async function expireForTimeout() {
      if (
        expiring ||
        submitting ||
        !config?.expireUrl
      ) {
        return;
      }

      expiring = true;
      submitting = true;
      window.clearTimeout(
        saveTimer
      );
      window.clearInterval(
        heartbeatTimer
      );
      window.cancelAnimationFrame(
        timerFrame
      );
      disablePaper();
      timerPanel?.classList.add(
        "expired"
      );

      if (timer) {
        timer.textContent = "00:00";
      }
      if (saveState) {
        saveState.textContent =
          "제한 시간 종료 · 실격 처리 중…";
      }

      try {
        const response = await fetch(
          config.expireUrl,
          {
            method: "POST",
            credentials:
              "same-origin",
            cache: "no-store",
            keepalive: true,
            headers: {
              Accept:
                "application/json",
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              answers:
                answersFromForm(),
              ...activeQuestionPayload(),
            }),
          }
        );
        const result =
          await response.json();

        if (
          response.status === 409 &&
          Number(
            result.remainingTimeMs
          ) > 0
        ) {
          localDeadline =
            Date.now() +
            Number(
              result.remainingTimeMs
            );
          expiring = false;
          submitting = false;
          form
            .querySelectorAll(
              "input, button"
            )
            .forEach((control) => {
              control.disabled =
                false;
            });
          timerPanel?.classList.remove(
            "expired"
          );
          renderTimer();
          return;
        }

        if (!response.ok) {
          throw new Error(
            result.message ||
              "시간 만료 처리 실패"
          );
        }

        window.location.replace(
          result.redirectUrl ||
            config.attemptUrl
        );
      } catch (error) {
        expiring = false;
        submitting = false;

        if (saveState) {
          saveState.textContent =
            "시간 만료 처리 재시도 중…";
        }

        window.setTimeout(
          expireForTimeout,
          1000
        );
      }
    }

    async function performSaveDraft({
      beacon = false,
      silent = false,
      closeTiming = false,
    } = {}) {
      if (
        !config?.draftUrl ||
        submitting
      ) {
        return;
      }

      const payload = JSON.stringify({
        answers:
          answersFromForm(),
        ...activeQuestionPayload(),
        closeQuestionTiming:
          closeTiming,
      });

      if (
        beacon &&
        navigator.sendBeacon
      ) {
        navigator.sendBeacon(
          config.draftUrl,
          new Blob([payload], {
            type: "application/json",
          })
        );
        return;
      }

      if (
        saveState &&
        !silent
      ) {
        saveState.textContent =
          "저장 중…";
      }

      try {
        const response = await fetch(
          config.draftUrl,
          {
            method: "POST",
            credentials:
              "same-origin",
            cache: "no-store",
            keepalive: true,
            headers: {
              Accept:
                "application/json",
              "Content-Type":
                "application/json",
            },
            body: payload,
          }
        );

        if (!response.ok) {
          throw new Error(
            "자동 저장 실패"
          );
        }

        const result =
          await response.json();

        if (result.expired) {
          submitting = true;
          window.location.replace(
            result.redirectUrl ||
              config.attemptUrl
          );
          return false;
        }

        if (
          saveState &&
          !silent
        ) {
          saveState.textContent =
            "답안 자동 저장됨";
        }
        return true;
      } catch (error) {
        if (
          saveState &&
          !silent
        ) {
          saveState.textContent =
            "저장 실패 · 다시 입력하면 재시도";
        }
        return null;
      }
    }

    function saveDraft(
      options = {}
    ) {
      if (options.beacon) {
        return performSaveDraft(
          options
        );
      }

      const pending =
        saveQueue.then(() =>
          performSaveDraft(
            options
          )
        );
      saveQueue = pending.catch(
        () => null
      );
      return pending;
    }

    const scheduleSave = () => {
      window.clearTimeout(
        saveTimer
      );
      saveTimer =
        window.setTimeout(
          () => saveDraft(),
          450
        );
    };

    const questionAnswered = (
      question
    ) => {
      const checked =
        question.querySelector(
          "input[type='radio']:checked"
        );
      const shortAnswer =
        question.querySelector(
          "input[type='text']"
        );

      return Boolean(
        checked ||
          shortAnswer?.value.trim()
      );
    };

    const renderCurrentQuestion =
      () => {
        questions.forEach(
          (question, index) => {
            if (
              config?.placement
            ) {
              question.hidden =
                index !==
                currentQuestionIndex;
            }
          }
        );

        const activeQuestion =
          questions[
            currentQuestionIndex
          ];

        if (
          activeQuestionInput
        ) {
          activeQuestionInput.value =
            activeQuestion?.dataset
              .questionId || "";
        }
        if (
          currentQuestionInput
        ) {
          currentQuestionInput.value =
            String(
              currentQuestionIndex
            );
        }
        if (
          currentQuestionNumber
        ) {
          currentQuestionNumber.textContent =
            String(
              currentQuestionIndex +
                1
            );
        }

        previousButton?.toggleAttribute(
          "disabled",
          currentQuestionIndex === 0
        );
        nextButton?.toggleAttribute(
          "disabled",
          currentQuestionIndex ===
            questions.length - 1
        );

        jumpButtons.forEach(
          (button, index) => {
            const current =
              index ===
              currentQuestionIndex;
            button.classList.toggle(
              "current",
              current
            );
            button.classList.toggle(
              "answered",
              questionAnswered(
                questions[index]
              )
            );
            button.setAttribute(
              "aria-current",
              current
                ? "step"
                : "false"
            );
          }
        );
      };

    const moveToQuestion =
      (targetIndex) => {
        if (
          !config?.placement ||
          submitting ||
          expiring
        ) {
          return;
        }

        const nextIndex =
          Math.max(
            0,
            Math.min(
              questions.length - 1,
              Number(targetIndex)
            )
          );

        if (
          nextIndex ===
          currentQuestionIndex
        ) {
          return;
        }

        currentQuestionIndex =
          nextIndex;
        renderCurrentQuestion();
        saveDraft({
          silent: true,
        });
        questions[
          currentQuestionIndex
        ]
          ?.querySelector(
            "input:not([type='hidden'])"
          )
          ?.focus({
            preventScroll: true,
          });
        document
          .querySelector(
            "[data-placement-navigator]"
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      };

    const updateProgress = () => {
      const answered =
        questions.filter(
          questionAnswered
        ).length;
      const percent =
        (answered /
          questions.length) *
        100;

      count.textContent =
        String(answered);
      progress.style.width =
        `${percent}%`;
      renderCurrentQuestion();
    };

    form.addEventListener(
      "input",
      () => {
        updateProgress();
        scheduleSave();
      }
    );
    form.addEventListener(
      "change",
      () => {
        updateProgress();
        scheduleSave();
      }
    );

    previousButton?.addEventListener(
      "click",
      () =>
        moveToQuestion(
          currentQuestionIndex - 1
        )
    );
    nextButton?.addEventListener(
      "click",
      () =>
        moveToQuestion(
          currentQuestionIndex + 1
        )
    );
    jumpButtons.forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            moveToQuestion(
              Number(
                button.dataset
                  .questionJump
              )
            )
        );
      }
    );

    form.addEventListener(
      "submit",
      (event) => {
        const unanswered =
          questions.filter(
            (question) =>
              !questionAnswered(
                question
              )
          ).length;

        if (
          unanswered > 0 &&
          !window.confirm(
            config?.placement
              ? `아직 ${unanswered}문항에 답하지 않았습니다. 미응답은 오답으로 처리되어 초기 랭크에 불이익이 생길 수 있습니다. 그대로 제출할까요?`
              : `아직 ${unanswered}문항에 답하지 않았습니다. 그대로 제출할까요?`
          )
        ) {
          event.preventDefault();
          return;
        }

        submitting = true;
        window.clearTimeout(
          saveTimer
        );
        window.clearInterval(
          heartbeatTimer
        );
      }
    );

    document
      .querySelectorAll(
        config?.backUrl
          ? `a[href='${config.backUrl}']`
          : "a[href='/assessments']"
      )
      .forEach((link) => {
        link.addEventListener(
          "click",
          async (event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }

            event.preventDefault();
            window.clearTimeout(
              saveTimer
            );
            window.clearInterval(
              heartbeatTimer
            );
            const saved =
              await saveDraft({
                closeTiming: true,
              });
            if (saved === false) {
              return;
            }
            submitting = true;
            window.location.assign(
              link.href
            );
          }
        );
      });

    window.addEventListener(
      "pagehide",
      () => {
        window.cancelAnimationFrame(
          timerFrame
        );
        window.clearInterval(
          heartbeatTimer
        );
        saveDraft({
          beacon: true,
          closeTiming: true,
        });
      }
    );

    window.addEventListener(
      "keydown",
      (event) => {
        const screenshotShortcut =
          event.key ===
            "PrintScreen" ||
          (
            event.metaKey &&
            event.shiftKey &&
            ["3", "4", "5"].includes(
              event.key
            )
          );

        if (screenshotShortcut) {
          window.alert(
            "평가는 자신의 풀이로 먼저 해결해보세요. 운영체제 스크린샷은 웹페이지가 완전히 차단하거나 정확히 감지할 수 없습니다."
          );
        }
      }
    );

    updateProgress();
    if (config?.placement) {
      saveDraft({
        silent: true,
      });
      heartbeatTimer =
        window.setInterval(
          () =>
            saveDraft({
              silent: true,
            }),
          5000
        );
    }
    renderTimer();
  }
);

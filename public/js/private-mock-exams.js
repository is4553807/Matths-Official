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
    const saveSelection =
      async (defer = false) => {
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
          "저장 중…";

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
              ? "이번 주 마감 전까지 선택을 미뤘습니다."
              : "경쟁전 내부 실력 지표에 반영할 대표 성적을 저장했습니다.";
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
        saveSelection(false);
      }
    );
    selectionForm
      .querySelector(
        "[data-private-mock-defer]"
      )
      ?.addEventListener(
        "click",
        () =>
          saveSelection(true)
      );
  }

  const hero =
    document.querySelector(
      ".private-mock-hero"
    );
  const output =
    document.querySelector(
      "[data-mock-countdown]"
    );
  let roomLink =
    document.querySelector(
      "[data-private-mock-room-link]"
    );

  if (!hero || !output) return;

  const releaseAt =
    new Date(
      hero.dataset.releaseAt
    ).getTime();
  const closeAt = new Date(hero.dataset.closeAt).getTime();
  const countdownLabel = document.querySelector("[data-mock-countdown-label]");
  const serverNow =
    new Date(
      hero.dataset.serverNow
    ).getTime();
  const clockOffset =
    Number.isFinite(serverNow)
      ? serverNow - Date.now()
      : 0;

  const render = () => {
    const now = Date.now() + clockOffset;
    const closed = Number.isFinite(closeAt) && now >= closeAt;
    const opened = now >= releaseAt && Number.isFinite(closeAt);
    const remaining =
      Math.max(
        0,
        (opened ? closeAt : releaseAt) - now
      );
    const totalSeconds =
      Math.floor(
        remaining / 1000
      );
    const days =
      Math.floor(
        totalSeconds / 86400
      );
    const hours =
      Math.floor(
        (totalSeconds % 86400) /
          3600
      );
    const minutes =
      Math.floor(
        (totalSeconds % 3600) /
          60
      );
    const seconds =
      totalSeconds % 60;

    output.textContent =
      closed
        ? "응시 마감"
        : remaining <= 0
        ? "지금 응시 가능"
        : `${days}일 ` +
          `${String(hours).padStart(2, "0")}:` +
          `${String(minutes).padStart(2, "0")}:` +
          `${String(seconds).padStart(2, "0")}`;
    if (countdownLabel) {
      countdownLabel.textContent = opened ? "응시 마감까지" : "공개까지";
    }
    if (closed && roomLink) {
      if (roomLink.dataset.submitted === "1") return;
      roomLink.removeAttribute("href");
      roomLink.setAttribute("aria-disabled", "true");
      roomLink.classList.add("disabled");
      roomLink.textContent = "응시 마감";
      return;
    }

    if (
      roomLink?.dataset
        .lobbyOpensAt
    ) {
      const lobbyOpensAt =
        new Date(
          roomLink.dataset
            .lobbyOpensAt
        ).getTime();

      if (
        Date.now() +
          clockOffset >=
        lobbyOpensAt
      ) {
        const anchor =
          document.createElement(
            "a"
          );
        anchor.className =
          "private-mock-start-link";
        anchor.href =
          roomLink.dataset
            .roomHref;
        anchor.innerHTML =
          "시험장 입장 <span aria-hidden=\"true\">→</span>";
        roomLink.replaceWith(
          anchor
        );
        roomLink = anchor;
      }
    }
  };

  render();
  window.setInterval(
    render,
    1000
  );
})();

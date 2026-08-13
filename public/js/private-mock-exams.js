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
              ? "3회차 종료 전까지 선택을 미뤘습니다."
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
  const roomLink =
    document.querySelector(
      "[data-private-mock-room-link]"
    );

  if (!hero || !output) return;

  const releaseAt =
    new Date(
      hero.dataset.releaseAt
    ).getTime();
  const serverNow =
    new Date(
      hero.dataset.serverNow
    ).getTime();
  const clockOffset =
    Number.isFinite(serverNow)
      ? serverNow - Date.now()
      : 0;

  const render = () => {
    const remaining =
      Math.max(
        0,
        releaseAt -
          (Date.now() +
            clockOffset)
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
      remaining <= 0
        ? "지금 응시 가능"
        : `${days}일 ` +
          `${String(hours).padStart(2, "0")}:` +
          `${String(minutes).padStart(2, "0")}:` +
          `${String(seconds).padStart(2, "0")}`;

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
      }
    }
  };

  render();
  window.setInterval(
    render,
    1000
  );
})();

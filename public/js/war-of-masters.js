document.addEventListener(
  "DOMContentLoaded",
  () => {
    const dialog =
      document.getElementById(
        "placement-start-dialog"
      );
    const openButton =
      document.querySelector(
        "[data-placement-open]"
      );
    const confirmButton =
      document.querySelector(
        "[data-placement-confirm]"
      );
    const startForm =
      document.getElementById(
        "placement-start-form"
      );

    if (
      !dialog ||
      !openButton ||
      !confirmButton ||
      !startForm
    ) {
      return;
    }

    openButton.addEventListener(
      "click",
      () => {
        if (
          typeof dialog.showModal ===
          "function"
        ) {
          dialog.showModal();
          return;
        }

        const accepted =
          window.confirm(
            "배치고사는 100분입니다. 중간에 나가도 시간이 계속 흐르며, 미응답 문항은 초기 티어에 불이익이 될 수 있습니다. 바로 시작할까요?"
          );

        if (accepted) {
          startForm.requestSubmit();
        }
      }
    );

    confirmButton.addEventListener(
      "click",
      () => {
        confirmButton.disabled =
          true;
        confirmButton.textContent =
          "시험지 만드는 중…";
        startForm.requestSubmit();
      }
    );

    dialog.addEventListener(
      "click",
      (event) => {
        if (
          event.target === dialog
        ) {
          dialog.close();
        }
      }
    );
  }
);

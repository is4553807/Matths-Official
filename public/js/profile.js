(function () {
  "use strict";

  function initPasswordConfirmation() {
    const form = document.querySelector(
      "[data-password-form]"
    );

    if (!form) {
      return;
    }

    const password =
      document.getElementById("newPassword");
    const confirmation =
      document.getElementById(
        "newPasswordConfirm"
      );
    const message =
      document.getElementById(
        "new-password-match"
      );

    if (
      !password ||
      !confirmation ||
      !message
    ) {
      return;
    }

    const defaultMessage =
      message.textContent.trim();

    function validatePasswords() {
      if (!confirmation.value) {
        confirmation.setCustomValidity("");
        message.textContent = defaultMessage;
        message.className = "field-guide";
        return;
      }

      const matches =
        password.value === confirmation.value;

      confirmation.setCustomValidity(
        matches
          ? ""
          : "새 비밀번호가 일치하지 않습니다."
      );

      message.textContent = matches
        ? "새 비밀번호가 일치합니다."
        : "새 비밀번호가 일치하지 않습니다.";
      message.className = matches
        ? "field-guide valid"
        : "field-guide invalid";
    }

    password.addEventListener(
      "input",
      validatePasswords
    );
    confirmation.addEventListener(
      "input",
      validatePasswords
    );
  }

  function initSubmitStates() {
    const forms = document.querySelectorAll(
      "[data-settings-form]"
    );

    forms.forEach((form) => {
      form.addEventListener("submit", () => {
        if (!form.checkValidity()) {
          return;
        }

        const button =
          form.querySelector(".save-button");

        if (!button) {
          return;
        }

        button.disabled = true;
        button.textContent = "저장 중...";
      });
    });
  }

  function initRankingIdentityPreview() {
    const form = document.querySelector(
      "[data-ranking-identity-form]"
    );

    if (!form) {
      return;
    }

    const realName =
      form.querySelector("#realName");
    const preview = form.querySelector(
      "[data-ranking-name-preview]"
    );
    const choices = form.querySelectorAll(
      'input[name="rankingDisplayMode"]'
    );
    const nickname =
      form.dataset.nickname || "익명 학생";

    if (!realName || !preview) {
      return;
    }

    function updatePreview() {
      const selected = form.querySelector(
        'input[name="rankingDisplayMode"]:checked'
      );

      preview.textContent =
        selected?.value === "realName"
          ? realName.value.trim() ||
            "실명을 입력해주세요"
          : nickname;
    }

    realName.addEventListener(
      "input",
      updatePreview
    );
    choices.forEach((choice) => {
      choice.addEventListener(
        "change",
        updatePreview
      );
    });
    updatePreview();
  }

  function init() {
    initPasswordConfirmation();
    initRankingIdentityPreview();
    initSubmitStates();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();

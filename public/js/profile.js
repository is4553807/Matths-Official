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

  function initWithdrawalForm() {
    const form = document.querySelector(
      "[data-withdraw-form]"
    );

    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      if (!form.checkValidity()) {
        return;
      }

      const confirmed = window.confirm(
        "탈퇴하면 개인정보와 로그인 정보는 즉시 제거되며 계정을 복구할 수 없습니다. 계속할까요?"
      );

      if (!confirmed) {
        event.preventDefault();
        return;
      }

      const button = form.querySelector(
        ".withdrawal-button"
      );

      if (button) {
        button.disabled = true;
        button.textContent =
          "개인정보 제거 중...";
      }
    });
  }

  function init() {
    initPasswordConfirmation();
    initSubmitStates();
    initWithdrawalForm();
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

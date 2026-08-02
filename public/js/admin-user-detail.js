(function () {
  "use strict";

  function initAccountDeletionGuard() {
    const form = document.querySelector("[data-admin-delete-form]");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      const mode = form.querySelector('input[name="dataRetention"]:checked')?.value;
      const message = mode === "purged"
        ? "이 계정의 모든 학습·시험·Arena·게시판 데이터를 영구 삭제합니다. 계속할까요?"
        : "개인정보를 제거하고 활동 데이터는 익명으로 보존합니다. 계속할까요?";
      if (!window.confirm(message)) event.preventDefault();
    });
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initAccountDeletionGuard,
      { once: true }
    );
  } else {
    initAccountDeletionGuard();
  }
})();

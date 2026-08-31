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

  function initTeacherExpiryField() {
    const form = document.querySelector("[data-role-form]");
    const select = form?.querySelector("[data-role-select]");
    const field = form?.querySelector("[data-teacher-expiry-field]");
    const input = form?.querySelector("[data-teacher-expiry-input]");
    if (!form || !select || !field || !input) return;
    const synchronize = () => {
      const teacherSelected = select.value === "teacher";
      field.hidden = !teacherSelected;
      input.required = teacherSelected;
    };
    select.addEventListener("change", synchronize);
    synchronize();
  }

  function initPage() {
    initAccountDeletionGuard();
    initTeacherExpiryField();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initPage,
      { once: true }
    );
  } else {
    initPage();
  }
})();

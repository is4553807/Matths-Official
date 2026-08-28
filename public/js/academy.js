(function () {
  "use strict";

  const toast = document.querySelector("[data-copy-toast]");
  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy_failed");
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-value], [data-copy-link]");
    if (!button) return;

    const rawValue = button.dataset.copyValue;
    const linkPath = button.dataset.copyLink;
    const value = rawValue || (linkPath ? new URL(linkPath, window.location.origin).toString() : "");
    if (!value) return;

    try {
      await copyText(value);
      showToast(
        button.dataset.copySuccess ||
          (rawValue ? "초대 코드를 복사했습니다." : "초대 링크를 복사했습니다.")
      );
    } catch (_error) {
      showToast("복사하지 못했습니다. 다시 시도해 주세요.");
    }
  });

  const bulkForm = document.querySelector("[data-student-bulk-form]");
  if (bulkForm) {
    const checkboxes = [...document.querySelectorAll("[data-student-checkbox]")];
    const selectAll = document.querySelector("[data-student-select-all]");
    const selectedCount = bulkForm.querySelector("[data-student-selected-count]");
    const actionSelect = bulkForm.querySelector("[data-student-bulk-action]");
    const classWrap = bulkForm.querySelector("[data-student-bulk-class-wrap]");
    const classSelect = bulkForm.querySelector("[data-student-bulk-class]");
    const submitButton = bulkForm.querySelector("[data-student-bulk-submit]");

    function updateBulkState() {
      const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
      if (selectedCount) selectedCount.textContent = String(checkedCount);
      if (selectAll) {
        selectAll.checked = Boolean(checkboxes.length) && checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
      }

      const isClassAssignment = actionSelect?.value === "ASSIGN_CLASS";
      if (classWrap) classWrap.hidden = !isClassAssignment;
      if (classSelect) {
        classSelect.disabled = !isClassAssignment;
        classSelect.required = isClassAssignment;
      }
      if (submitButton) {
        submitButton.disabled = checkedCount === 0 || !actionSelect?.value;
      }
    }

    selectAll?.addEventListener("change", () => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      updateBulkState();
    });
    checkboxes.forEach((checkbox) => checkbox.addEventListener("change", updateBulkState));
    actionSelect?.addEventListener("change", updateBulkState);
    bulkForm.addEventListener("submit", (event) => {
      const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
      if (!checkedCount) {
        event.preventDefault();
        showToast("관리할 학생을 선택해 주세요.");
        return;
      }
      if (actionSelect?.value === "REMOVE") {
        const confirmed = window.confirm(
          `선택한 학생 ${checkedCount}명의 학원 소속을 해제할까요? 학생 통계 공유도 즉시 중단됩니다.`
        );
        if (!confirmed) event.preventDefault();
      }
    });
    updateBulkState();
  }

  const profileInput = document.querySelector("[data-academy-profile-input]");
  const profilePreview = document.querySelector("[data-academy-profile-preview]");
  const profileFallback = document.querySelector("[data-academy-profile-fallback]");
  let profilePreviewUrl = "";
  profileInput?.addEventListener("change", () => {
    const file = profileInput.files?.[0];
    if (!file || !profilePreview) return;
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl = URL.createObjectURL(file);
    profilePreview.src = profilePreviewUrl;
    profilePreview.hidden = false;
    if (profileFallback) profileFallback.hidden = true;
  });
  window.addEventListener("beforeunload", () => {
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
  });
})();

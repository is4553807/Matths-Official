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
      showToast(rawValue ? "초대 코드를 복사했습니다." : "초대 링크를 복사했습니다.");
    } catch (_error) {
      showToast("복사하지 못했습니다. 다시 시도해 주세요.");
    }
  });
})();

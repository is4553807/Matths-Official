(() => {
  const noopController = Object.freeze({
    retry: async () => false,
    showOffline: () => {},
    showRetryable: () => {},
    markSaved: () => {},
    dispose: () => {},
  });

  const create = ({
    root = document,
    onRetry,
    hasPending = () => false,
    canRetry = () => true,
  } = {}) => {
    const region = root?.querySelector?.(
      "[data-timed-attempt-network-state]"
    );
    if (!region) return noopController;

    const title = region.querySelector(
      "[data-timed-attempt-network-title]"
    );
    const message = region.querySelector(
      "[data-timed-attempt-network-message]"
    );
    const retryButton = region.querySelector(
      "[data-timed-attempt-network-retry]"
    );
    let retrying = false;
    let disposed = false;

    const hide = () => {
      region.hidden = true;
      region.removeAttribute("aria-busy");
    };

    const render = (state, detail = "") => {
      region.dataset.connectionState = state;
      region.hidden = false;
      region.setAttribute(
        "aria-busy",
        state === "retrying" ? "true" : "false"
      );

      if (state === "offline") {
        title.textContent = "연결이 끊겼습니다";
        message.textContent =
          "이 창을 닫거나 새로고침하지 마세요. 입력은 이 화면에 남아 있으며 연결되면 자동으로 다시 저장합니다.";
        retryButton.textContent = "연결 대기 중";
        retryButton.disabled = true;
        return;
      }

      if (state === "retrying") {
        title.textContent = "연결이 복구되었습니다";
        message.textContent =
          "아직 서버에 없는 답안을 다시 저장하고 있습니다.";
        retryButton.textContent = "저장 중";
        retryButton.disabled = true;
        return;
      }

      title.textContent = "아직 저장되지 않은 답안이 있습니다";
      message.textContent =
        detail ||
        "입력은 이 화면에 남아 있습니다. 저장 다시 시도를 눌러 서버에 반영해 주세요.";
      retryButton.textContent = "저장 다시 시도";
      retryButton.disabled = !canRetry();
    };

    const showOffline = () => render("offline");
    const showRetryable = (detail = "") => {
      if (navigator.onLine === false) {
        showOffline();
        return;
      }
      render("retryable", detail);
    };

    const retry = async () => {
      if (
        disposed ||
        retrying ||
        typeof onRetry !== "function" ||
        !canRetry()
      ) {
        return false;
      }
      if (navigator.onLine === false) {
        showOffline();
        return false;
      }

      retrying = true;
      render("retrying");
      try {
        const result = await onRetry();
        if (result === false || hasPending()) {
          showRetryable();
          return false;
        }
        hide();
        return true;
      } catch (_error) {
        showRetryable();
        return false;
      } finally {
        retrying = false;
      }
    };

    const handleOffline = () => showOffline();
    const handleOnline = () => {
      if (hasPending()) {
        if (canRetry()) {
          void retry();
        } else {
          showRetryable();
        }
        return;
      }
      hide();
    };
    const handleRetryClick = () => void retry();

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    retryButton.addEventListener("click", handleRetryClick);

    if (navigator.onLine === false) {
      showOffline();
    }

    return Object.freeze({
      retry,
      showOffline,
      showRetryable,
      markSaved: () => {
        if (navigator.onLine !== false && !hasPending()) {
          hide();
        }
      },
      dispose: () => {
        disposed = true;
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener("online", handleOnline);
        retryButton.removeEventListener("click", handleRetryClick);
      },
    });
  };

  window.MatthsTimedAttemptNetwork = Object.freeze({ create });
})();

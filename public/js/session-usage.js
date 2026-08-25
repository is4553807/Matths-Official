(() => {
  if (window.__matthsSessionUsageStarted) return;
  window.__matthsSessionUsageStarted = true;
  const heartbeatIntervalMs =
    60 * 1000;
  const heartbeatStorageKey =
    "matths-heartbeat-sent-at-v1";
  let heartbeatTimer = null;
  let memoryHeartbeatAt = 0;

  const deviceToken = (() => {
    const key = "matths-device-token-v1";
    try {
      const existing = window.localStorage.getItem(key);
      if (/^[A-Za-z0-9_-]{20,100}$/.test(existing || "")) return existing;
      const next = window.crypto?.randomUUID?.().replace(/-/g, "") ||
        Array.from(window.crypto.getRandomValues(new Uint8Array(24)))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      window.localStorage.setItem(key, next);
      return next;
    } catch (_error) {
      return "";
    }
  })();

  const lastHeartbeatAt = () => {
    try {
      return Number(
        window.sessionStorage.getItem(
          heartbeatStorageKey
        )
      ) || memoryHeartbeatAt;
    } catch (_error) {
      return memoryHeartbeatAt;
    }
  };

  const markHeartbeatSent = (
    value
  ) => {
    memoryHeartbeatAt = value;
    try {
      window.sessionStorage.setItem(
        heartbeatStorageKey,
        String(value)
      );
    } catch (_error) {
      // 저장소를 사용할 수 없어도 현재 페이지의 주기 전송은 계속한다.
    }
  };

  const sendHeartbeat = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (
      now - lastHeartbeatAt() <
      heartbeatIntervalMs - 2_000
    ) return;
    markHeartbeatSent(now);
    fetch("/api/session/heartbeat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceToken }),
      keepalive: true,
    }).catch(() => {});
  };

  const scheduleHeartbeat = () => {
    window.clearTimeout(
      heartbeatTimer
    );
    const elapsed = Math.max(
      0,
      Date.now() -
        lastHeartbeatAt()
    );
    const delay = Math.max(
      1_000,
      heartbeatIntervalMs -
        elapsed
    );
    heartbeatTimer =
      window.setTimeout(() => {
        sendHeartbeat();
        scheduleHeartbeat();
      }, delay);
  };

  sendHeartbeat();
  scheduleHeartbeat();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sendHeartbeat();
      scheduleHeartbeat();
    }
  });
})();

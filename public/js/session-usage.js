(() => {
  if (window.__matthsSessionUsageStarted) return;
  window.__matthsSessionUsageStarted = true;

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

  const sendHeartbeat = () => {
    if (document.visibilityState !== "visible") return;
    fetch("/api/session/heartbeat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceToken }),
      keepalive: true,
    }).catch(() => {});
  };

  sendHeartbeat();
  window.setInterval(sendHeartbeat, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendHeartbeat();
  });
})();

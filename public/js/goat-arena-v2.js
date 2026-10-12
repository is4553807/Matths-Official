(() => {
  document.querySelector("[data-arena2-forfeit]")?.addEventListener("submit", (event) => {
    const mode = event.currentTarget.dataset.arenaForfeitMode;
    const message = mode === "competitive"
      ? "경기를 포기하면 패배로 확정되고 레이팅에 반영됩니다. 포기할까요?"
      : mode === "friendly"
        ? "경기를 포기하면 상대 승리로 종료됩니다. XP와 레이팅은 변하지 않습니다. 포기할까요?"
        : "경기를 포기하면 패배로 기록되어 다음 경기 난이도 조정에 반영되며 XP는 지급되지 않습니다. 포기할까요?";
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });
  const finalizeForm = document.querySelector("[data-placement-finalize]");
  finalizeForm?.addEventListener("submit", (event) => {
    if (!window.confirm("현재 결과로 초기 티어를 확정할까요? 남은 배치고사는 진행하지 않으며, 적은 횟수로 확정할수록 초반 경쟁전 레이팅 변동이 더 큽니다.")) {
      event.preventDefault();
    }
  });

  const guestShareCard = document.querySelector("[data-guest-share-card]");
  if (guestShareCard) {
    const form = guestShareCard.querySelector("[data-guest-share-form]");
    const createButton = guestShareCard.querySelector("[data-guest-share-create-button]");
    const panel = guestShareCard.querySelector("[data-guest-share-panel]");
    const input = guestShareCard.querySelector("[data-guest-share-link]");
    const copyButton = guestShareCard.querySelector("[data-guest-share-copy]");
    const openLink = guestShareCard.querySelector("[data-guest-share-open]");
    const status = guestShareCard.querySelector("[data-guest-share-status]");

    const copyInviteLink = async ({ automatic = false } = {}) => {
      const inviteUrl = input?.value?.trim();
      if (!inviteUrl) return false;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        status.textContent = automatic
          ? "도전장 링크를 만들고 클립보드에 복사했습니다."
          : "도전장 링크를 클립보드에 복사했습니다.";
        status.dataset.state = "success";
        return true;
      } catch (_error) {
        input.focus();
        input.select();
        let copied = false;
        try {
          copied = document.execCommand?.("copy") === true;
        } catch (_fallbackError) {
          copied = false;
        }
        status.textContent = copied
          ? "도전장 링크를 클립보드에 복사했습니다."
          : "자동 복사가 차단되었습니다. 선택된 링크를 복사하거나 오른쪽 버튼을 눌러주세요.";
        status.dataset.state = copied ? "success" : "notice";
        return copied;
      }
    };

    copyButton?.addEventListener("click", () => copyInviteLink());
    input?.addEventListener("focus", () => input.select());

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!createButton || !panel || !input || !openLink || !status) return;
      createButton.disabled = true;
      createButton.dataset.loading = "true";
      createButton.querySelector("span").textContent = "링크 만드는 중";
      status.textContent = "도전장 링크를 만들고 있습니다.";
      status.dataset.state = "notice";
      try {
        const response = await fetch(form.action, {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.inviteUrl) {
          throw new Error(result.error || "도전장 링크를 만들지 못했습니다.");
        }
        input.value = result.inviteUrl;
        openLink.href = result.inviteUrl;
        openLink.hidden = false;
        panel.hidden = false;
        form.hidden = true;
        await copyInviteLink({ automatic: true });
      } catch (error) {
        status.textContent = error.message || "도전장 링크를 만들지 못했습니다. 잠시 후 다시 시도할 수 있습니다.";
        status.dataset.state = "error";
        createButton.disabled = false;
        createButton.dataset.loading = "false";
        createButton.querySelector("span").textContent = "도전장 뿌리기";
      }
    });
  }

  const friendUpdates = document.querySelector("[data-arena2-friend-updates]");
  if (friendUpdates) {
    const incomingCount = Number(friendUpdates.dataset.incomingCount);
    window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/goat-arena/friends/status", {
          headers: { Accept: "application/json" }, credentials: "same-origin",
        });
        if (!response.ok) return;
        const state = await response.json();
        friendUpdates.hidden = state.incomingCount === incomingCount;
        for (const friend of state.friends || []) {
          const row = document.querySelector(`[data-arena2-friend="${friend.userId}"]`);
          if (!row) continue;
          row.querySelector("[data-friend-presence]").textContent =
            `Lv. ${friend.level} · ${friend.tierLabel} · ${friend.online ? "온라인" : "오프라인"} · ${friend.gameStatus}`;
          row.querySelector("button").disabled = !friend.canInvite || friendUpdates.dataset.selfBusy === "true";
        }
        if (state.activeMatch?.mode === "FRIENDLY" && friendUpdates.dataset.selfBusy !== "true") {
          window.location.assign(state.activeMatch.href);
        }
      } catch (_error) {
        // 다음 상태 갱신에서 재시도한다.
      }
    }, 10000);
  }

  const queue = document.querySelector("[data-arena2-queue]");
  if (!queue) return;
  const check = async () => {
    try {
      const response = await fetch("/api/goat-arena/matchmaking/status", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const state = await response.json();
      if (state.status === "MATCHED" && state.matchHref) {
        window.location.assign(state.matchHref);
      } else if (state.status === "IDLE") {
        window.location.reload();
      }
    } catch (_error) {
      // 다음 폴링에서 재시도한다.
    }
  };
  window.setInterval(check, 3000);
})();

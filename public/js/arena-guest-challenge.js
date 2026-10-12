(() => {
  const usesInlineBoard = window.MatthsNoteGrid.isTouchBoardDevice();
  document.documentElement.classList.toggle("arena-touch-board-enabled", usesInlineBoard);

  const nicknameForm = document.querySelector("[data-guest-nickname-form]");
  if (nicknameForm) {
    const token = nicknameForm.dataset.token || "";
    const input = nicknameForm.querySelector("[data-guest-nickname-input]");
    const birthDateInput = nicknameForm.querySelector("[data-guest-birth-date]");
    const status = nicknameForm.querySelector("[data-guest-nickname-status]");
    const submit = nicknameForm.querySelector("[data-guest-nickname-submit]");
    let debounceTimer = null;
    let requestSequence = 0;
    let activeController = null;
    let availableIdentity = "";
    let identityState = "idle";

    const updateSubmitState = () => {
      submit.disabled = identityState !== "available";
    };

    const setState = (state, message) => {
      identityState = state;
      status.dataset.state = state;
      status.textContent = message;
      updateSubmitState();
    };

    const identityKey = () => `${input.value.trim()}\u0000${birthDateInput.value}`;

    const checkAvailability = async () => {
      const nickname = input.value.trim();
      const birthDate = birthDateInput.value;
      const sequence = ++requestSequence;
      availableIdentity = "";
      activeController?.abort();
      activeController = null;
      if (nickname.length < 2) {
        setState("idle", "닉네임은 2자 이상이어야 합니다.");
        return false;
      }
      if (!birthDate) {
        setState("idle", "생년월일을 입력해 주세요.");
        return false;
      }
      setState("checking", "닉네임과 생년월일을 확인하고 있습니다…");
      const controller = new AbortController();
      activeController = controller;
      try {
        const response = await fetch(
          `/api/arena-invite/${encodeURIComponent(token)}/nickname-availability`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ nickname, birthDate }),
            credentials: "same-origin",
            signal: controller.signal,
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (sequence !== requestSequence) return false;
        if (!response.ok || payload.available !== true) {
          setState("unavailable", payload.message || "사용 불가능한 닉네임입니다.");
          return false;
        }
        availableIdentity = identityKey();
        setState("available", payload.message || "참가할 수 있는 정보입니다.");
        return true;
      } catch (error) {
        if (error.name === "AbortError" || sequence !== requestSequence) return false;
        setState("error", "참가 정보를 확인하지 못했습니다. 잠시 후 다시 입력해 주세요.");
        return false;
      }
    };

    const scheduleAvailabilityCheck = () => {
      clearTimeout(debounceTimer);
      requestSequence += 1;
      activeController?.abort();
      activeController = null;
      availableIdentity = "";
      const nickname = input.value.trim();
      if (nickname.length < 2) {
        setState("idle", "닉네임은 2자 이상이어야 합니다.");
        return;
      }
      if (!birthDateInput.value) {
        setState("idle", "생년월일을 입력해 주세요.");
        return;
      }
      setState("checking", "입력을 마치면 자동으로 확인합니다…");
      debounceTimer = setTimeout(checkAvailability, 320);
    };

    submit.disabled = true;
    input.addEventListener("input", scheduleAvailabilityCheck);
    birthDateInput.addEventListener("input", scheduleAvailabilityCheck);
    birthDateInput.addEventListener("change", scheduleAvailabilityCheck);
    nicknameForm.addEventListener("submit", async (event) => {
      if (availableIdentity === identityKey()) return;
      event.preventDefault();
      clearTimeout(debounceTimer);
      if (!nicknameForm.reportValidity()) {
        return;
      }
      if (await checkAvailability()) nicknameForm.requestSubmit();
    });
    if (input.value.trim().length >= 2 && birthDateInput.value) {
      debounceTimer = setTimeout(checkAvailability, 0);
    }
  }

  const hydrateSolutionPreviews = (scope) => {
    scope?.querySelectorAll("img[data-guest-solution-preview][data-src]").forEach((preview) => {
      const source = preview.dataset.src;
      if (!source) return;
      preview.removeAttribute("data-src");
      preview.addEventListener("error", () => {
        preview.hidden = true;
        preview.closest(".arena-challenge-solution-preview")?.classList.add("is-unavailable");
      }, { once: true });
      preview.src = source;
    });
  };

  const participantTabs = document.querySelector("[data-participant-tabs]");
  if (participantTabs) {
    const tabs = [...participantTabs.querySelectorAll("[data-participant-tab]")];
    const panels = [...participantTabs.querySelectorAll("[data-participant-panel]")];
    const shortcuts = [...document.querySelectorAll("[data-participant-tab-shortcut]")];
    const selectParticipant = (index, { focus = false, scroll = false } = {}) => {
      const selectedIndex = Math.max(0, Math.min(tabs.length - 1, Number(index) || 0));
      tabs.forEach((tab, tabIndex) => {
        const selected = tabIndex === selectedIndex;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((panel, panelIndex) => {
        panel.hidden = panelIndex !== selectedIndex;
      });
      shortcuts.forEach((button) => {
        button.classList.toggle("is-selected", Number(button.dataset.participantTabShortcut) === selectedIndex);
      });
      const selectedTab = tabs[selectedIndex];
      const selectedPanel = panels[selectedIndex];
      hydrateSolutionPreviews(selectedPanel);
      window.MatthsMath?.render(selectedPanel);
      if (focus) selectedTab?.focus();
      if (scroll) participantTabs.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectParticipant(index));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        selectParticipant(nextIndex, { focus: true });
      });
    });
    shortcuts.forEach((button) => {
      button.addEventListener("click", () => selectParticipant(
        button.dataset.participantTabShortcut,
        { focus: true, scroll: true }
      ));
    });
    const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));
    selectParticipant(selectedIndex);
  } else {
    hydrateSolutionPreviews(document);
  }

  const reverseLink = document.querySelector("[data-reverse-invite-link]");
  const reverseCopy = document.querySelector("[data-reverse-invite-copy]");
  const reverseStatus = document.querySelector("[data-reverse-invite-status]");
  reverseCopy?.addEventListener("click", async () => {
    if (!reverseLink) return;
    try {
      await navigator.clipboard.writeText(reverseLink.value);
      if (reverseStatus) reverseStatus.textContent = "역도전장 링크를 복사했습니다.";
    } catch (_error) {
      reverseLink.focus();
      reverseLink.select();
      if (reverseStatus) reverseStatus.textContent = "선택된 링크를 복사하면 됩니다.";
    }
  });

  const root = document.querySelector("[data-guest-challenge]");
  if (!root) return;
  window.MatthsMath?.render(root);
  const token = root.dataset.token;
  const attemptId = root.dataset.attemptId || "unknown-attempt";
  const slot = Number(root.dataset.questionSlot || 1);
  const finalQuestion = root.dataset.finalQuestion === "true";
  const deadline = new Date(root.dataset.deadline).getTime();
  const timer = root.querySelector("[data-guest-timer]");
  const answer = root.querySelector("[data-guest-answer]");
  const advanceButton = root.querySelector("[data-guest-advance]");
  const errorBox = root.querySelector("[data-guest-error]");
  const boardRoot = root.querySelector("[data-guest-inline-board]");
  const mobileBoard = Boolean(boardRoot && usesInlineBoard);
  const canvas = boardRoot?.querySelector("[data-board-canvas]");
  const boardState = boardRoot?.querySelector("[data-board-state]");
  const storageKey = `matths-arena-guest-board:${token.slice(0, 12)}:${attemptId}:${slot}`;
  const boardStoragePrefix = `matths-arena-guest-board:${token.slice(0, 12)}:${attemptId}:`;
  const boardStorageTtlMs = 4 * 24 * 60 * 60 * 1000;
  let strokes = [];
  let activeStroke = null;
  let submitting = false;
  let boardRevision = 0;
  let boardDirty = false;

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return [
      (event.clientX - bounds.left) * canvas.width / bounds.width,
      (event.clientY - bounds.top) * canvas.height / bounds.height,
    ];
  };
  const draw = () => {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    window.MatthsNoteGrid.drawScreen(canvas);
    context.strokeStyle = "#17233c";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath(); context.moveTo(...stroke[0]);
      stroke.slice(1).forEach((next) => context.lineTo(...next));
      context.stroke();
    });
  };
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, strokes, savedAt: Date.now() }));
    } catch (_error) {}
  };
  const clearAttemptBoardStorage = () => {
    try {
      for (let questionSlot = 1; questionSlot <= 5; questionSlot += 1) {
        localStorage.removeItem(`${boardStoragePrefix}${questionSlot}`);
      }
    } catch (_error) {}
  };
  const drawingBase64 = () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, strokes }));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  };
  const saveBoard = async () => {
    const evidenceCanvas = window.MatthsNoteGrid.createEvidenceCanvas(canvas, strokes);
    const blob = await new Promise((resolve) => evidenceCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("풀이판 이미지를 만들지 못했습니다.");
    if (boardState) boardState.textContent = "풀이판 저장 중…";
    const form = new FormData();
    form.append("solutionBoard", new File([blob], `guest-question-${slot}.png`, { type: "image/png" }));
    form.append("questionSlot", String(slot));
    form.append("revision", String(Math.max(Date.now(), boardRevision + 1)));
    form.append("strokeCount", String(strokes.length));
    form.append("drawingDataBase64", drawingBase64());
    const response = await fetch(`/api/arena-invite/${encodeURIComponent(token)}/solution-board`, {
      method: "PUT", body: form, credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "풀이판을 저장하지 못했습니다.");
    boardRevision = Number(payload.board?.revision || boardRevision + 1);
    if (boardState) boardState.textContent = "풀이판 저장 완료";
  };

  if (mobileBoard && canvas) {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const savedAt = Number(stored.savedAt || 0);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > boardStorageTtlMs) {
        localStorage.removeItem(storageKey);
        strokes = [];
      } else {
        strokes = Array.isArray(stored.strokes) ? stored.strokes : [];
      }
    } catch (_error) {
      localStorage.removeItem(storageKey);
      strokes = [];
    }
    boardDirty = strokes.length > 0;
    window.MatthsNoteGrid.observeCanvas(canvas, draw);
    draw();
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      activeStroke = [point(event)]; strokes.push(activeStroke); boardDirty = true; persist(); draw();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!activeStroke) return; event.preventDefault(); activeStroke.push(point(event)); persist(); draw();
    });
    const finish = () => { activeStroke = null; persist(); };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    boardRoot.querySelector("[data-board-undo]")?.addEventListener("click", () => { strokes.pop(); boardDirty = true; persist(); draw(); });
    boardRoot.querySelector("[data-board-clear]")?.addEventListener("click", () => {
      if (!confirm("현재 풀이판을 모두 지울까요?")) return;
      strokes = []; boardDirty = true; persist(); draw();
    });
    fetch(`/api/arena-invite/${encodeURIComponent(token)}/solution-boards`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    }).then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        const board = (payload.boards || []).find((item) => Number(item.questionSlot) === slot);
        if (!response.ok || !board) {
          if (boardState) boardState.textContent = "격자 풀이판에 풀이과정을 작성하세요.";
          return;
        }
        boardRevision = Number(board.revision || 0);
        if (boardDirty) {
          if (boardState) boardState.textContent = "기기에 남아 있는 풀이판을 복구했습니다.";
          return;
        }
        const raw = atob(board.drawingDataBase64 || "");
        const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        const restored = JSON.parse(new TextDecoder().decode(bytes));
        strokes = Array.isArray(restored.strokes) ? restored.strokes : [];
        persist();
        draw();
        if (boardState) boardState.textContent = "서버에 저장된 풀이판을 불러왔습니다.";
      })
      .catch(() => {
        if (boardState) boardState.textContent = "저장된 로컬 풀이판을 사용합니다.";
      });
  }

  const advance = async (timedOut = false) => {
    if (submitting) return;
    submitting = true;
    advanceButton.disabled = true;
    try {
      if (mobileBoard) {
        const lockResponse = await fetch(
          `/api/arena-invite/${encodeURIComponent(token)}/lock-question`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              answer: timedOut ? "" : answer.value,
              questionSlot: slot,
            }),
          }
        );
        const lockPayload = await lockResponse.json().catch(() => ({}));
        if (!lockResponse.ok) {
          throw new Error(lockPayload.message || "문항 완료 시각을 확정하지 못했습니다.");
        }
        await saveBoard();
      }
      const response = await fetch(`/api/arena-invite/${encodeURIComponent(token)}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          answer: timedOut ? "" : answer.value,
          ...(mobileBoard ? { evidenceMode: "INLINE_BOARD", questionSlot: slot } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "다음 문항으로 이동하지 못했습니다.");
      if (payload.finalQuestion && mobileBoard) {
        const finalize = await fetch(`/api/arena-invite/${encodeURIComponent(token)}/solution-boards/finalize`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin",
        });
        const finalizeBody = await finalize.json().catch(() => ({}));
        if (!finalize.ok) throw new Error(finalizeBody.message || "풀이판을 제출하지 못했습니다.");
      }
      if (payload.finalQuestion) clearAttemptBoardStorage();
      else localStorage.removeItem(storageKey);
      location.assign(`/arena-invite/${encodeURIComponent(token)}`);
    } catch (error) {
      submitting = false;
      advanceButton.disabled = false;
      showError(error.message);
    }
  };
  advanceButton.addEventListener("click", () => advance(false));
  const refreshTimer = () => {
    const remaining = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (remaining <= 0) advance(true);
  };
  refreshTimer();
  setInterval(refreshTimer, 1000);
})();

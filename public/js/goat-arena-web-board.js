(() => {
  const root = document.querySelector("[data-arena-match-attempt]");
  const boardRoot = root?.querySelector("[data-arena-inline-solution]");
  const canvas = boardRoot?.querySelector("[data-arena-board-canvas]");
  const touchBoardEnabled = Boolean(window.MatthsNoteGrid?.isTouchBoardDevice());
  document.documentElement.classList.toggle("arena-touch-board-enabled", touchBoardEnabled);
  if (
    !root ||
    !boardRoot ||
    !canvas ||
    !touchBoardEnabled
  ) {
    return;
  }

  const matchId = root.dataset.matchId;
  const questionSlot = Number(boardRoot.dataset.questionSlot || 0);
  const state = boardRoot.querySelector("[data-arena-board-state]");
  const nativeFetch = window.fetch.bind(window);
  const advancePath = `/api/goat-arena/matches/${matchId}/advance`;
  const boardPath = `/api/goat-arena/matches/${matchId}/solution-boards/current`;
  const finalizePath = `/api/goat-arena/matches/${matchId}/solution-boards/finalize`;
  let strokes = [];
  let activeStroke = null;
  let revision = 0;
  let sha256 = "";
  let saveChain = Promise.resolve();
  let completionLocked = false;
  let completionRequestId = "";
  let lockedAnswer = "";
  let lockedRevision = 0;
  let lockedSubmissionMode = "MANUAL";
  let localDraftSavedAt = 0;
  let reservedRevision = 0;
  let autosaveTimer = null;
  let lastSavedDrawing = "";
  const draftKey = `arena-member-board:${matchId}:${questionSlot}`;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("arena-member-board:")) continue;
      try {
        const draft = JSON.parse(localStorage.getItem(key));
        if (!draft || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt >= 4 * 24 * 60 * 60 * 1000) localStorage.removeItem(key);
      } catch (_error) { localStorage.removeItem(key); }
    }
  } catch (_error) {}

  const persistDraft = () => {
    try { localDraftSavedAt = Date.now(); localStorage.setItem(draftKey, JSON.stringify({ strokes, savedAt: localDraftSavedAt })); } catch (_error) {}
  };

  const freezeAnswerInput = () => {
    const input = root.querySelector("[data-arena-answer]");
    if (input) { input.value = lockedAnswer; input.readOnly = true; }
  };

  const setState = (message) => {
    if (state) state.textContent = message;
  };

  const encodeDrawingData = (drawingStrokes = strokes) => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ version: 1, strokes: drawingStrokes })
    );
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  };

  const render = () => {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    window.MatthsNoteGrid.drawScreen(canvas);

    context.strokeStyle = "#17233c";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath();
      context.moveTo(stroke[0][0], stroke[0][1]);
      stroke.slice(1).forEach(([x, y]) => context.lineTo(x, y));
      context.stroke();
    });
  };

  const pointFor = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          canvas.width,
          ((event.clientX - bounds.left) * canvas.width) / bounds.width
        )
      ),
      Math.max(
        0,
        Math.min(
          canvas.height,
          ((event.clientY - bounds.top) * canvas.height) / bounds.height
        )
      ),
    ];
  };

  const loadBoard = async () => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft && Date.now() - draft.savedAt < 4 * 24 * 60 * 60 * 1000 && Array.isArray(draft.strokes)) { strokes = draft.strokes; localDraftSavedAt = draft.savedAt; }
      else localStorage.removeItem(draftKey);
    } catch (_error) {}
    render();
    try {
      const response = await nativeFetch(
        `/api/goat-arena/matches/${matchId}/solution-boards`,
        {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        }
      );
      const payload = await response.json().catch(() => ({}));
      const board = (payload.boards || []).find(
        (item) => Number(item.questionSlot) === questionSlot
      );
      if (!response.ok || !board) {
        setState("격자 풀이판에 풀이과정을 작성하세요.");
        return;
      }
      const raw = window.atob(board.drawingDataBase64 || "");
      const bytes = Uint8Array.from(raw, (character) =>
        character.charCodeAt(0)
      );
      if (board.drawingDataBase64 && (!localDraftSavedAt || new Date(board.savedAt || board.lockedAt || 0).getTime() > localDraftSavedAt)) {
        const restored = JSON.parse(new TextDecoder().decode(bytes));
        strokes = Array.isArray(restored.strokes) ? restored.strokes : [];
      }
      completionLocked = Boolean(board.completionLocked);
      completionRequestId = board.completionRequestId || "";
      lockedAnswer = board.lockedAnswer || "";
      lockedRevision = completionLocked ? Number(board.revision) : 0;
      lockedSubmissionMode = board.lockedSubmissionMode || "MANUAL";
      if (completionLocked) freezeAnswerInput();
      revision = Number(board.revision || 0);
      reservedRevision = Math.max(reservedRevision, revision);
      lastSavedDrawing = board.drawingDataBase64 || "";
      sha256 = String(board.sha256 || "");
      render();
      setState("서버에 저장된 풀이판을 불러왔습니다.");
    } catch (_error) {
      setState("풀이판은 다음 문항 이동 전에 저장됩니다.");
    }
  };

  const reserveRevision = () => {
    reservedRevision = Math.max(reservedRevision, revision) + 1;
    return reservedRevision;
  };

  const saveBoard = (requestedRevision = null) => {
    const snapshot = strokes.map(stroke => stroke.map(point => [...point]));
    const drawingDataBase64 = encodeDrawingData(snapshot);
    const uploadRevision = requestedRevision || reserveRevision();
    saveChain = saveChain.catch(() => {}).then(async () => {
      setState("풀이판 저장 중…");
      const evidenceCanvas = window.MatthsNoteGrid.createEvidenceCanvas(canvas, snapshot);
      const blob = await new Promise((resolve) =>
        evidenceCanvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("풀이판 이미지를 만들지 못했습니다.");

      const form = new FormData();
      form.append(
        "solutionBoard",
        new File([blob], `question-${questionSlot}.png`, { type: "image/png" })
      );
      form.append("questionSlot", String(questionSlot));
      form.append("revision", String(uploadRevision));
      form.append("strokeCount", String(snapshot.length));
      form.append("drawingDataBase64", drawingDataBase64);

      const response = await nativeFetch(boardPath, {
        method: "PUT",
        body: form,
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "풀이판을 저장하지 못했습니다.");
      }
      revision = Number(payload.board?.revision || revision + 1);
      sha256 = String(payload.board?.sha256 || "");
      lastSavedDrawing = drawingDataBase64;
      setState("풀이판 저장 완료");
      return payload.board;
    });
    return saveChain;
  };

  const autosave = async () => {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    await boardReady;
    if (completionLocked || activeStroke || encodeDrawingData() === lastSavedDrawing) return;
    try { await saveBoard(); }
    catch (_error) { if (!completionLocked) setState("기기에 저장했습니다. 서버 저장은 다음 필기 또는 문항 완료 때 다시 시도합니다."); }
  };
  const scheduleAutosave = () => {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => { autosave().catch(() => {}); }, 1000);
  };

  const requestUrl = (input) =>
    typeof input === "string" ? input : String(input?.url || "");

  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    const method = String(init.method || (input instanceof Request ? input.method : "GET"))
      .toUpperCase();
    if (url !== advancePath || method !== "POST") {
      return nativeFetch(input, init);
    }

    await boardReady;
    window.clearTimeout(autosaveTimer);
    const body = JSON.parse(String(init.body || "{}"));
    if (!completionLocked) {
      activeStroke = null;
      completionLocked = true;
      completionRequestId = body.requestId;
      lockedAnswer = String(body.value ?? "").trim();
      freezeAnswerInput();
      lockedRevision = reserveRevision();
      lockedSubmissionMode = body.submissionMode === "TIME_LIMIT" ? "TIME_LIMIT" : "MANUAL";
      persistDraft();
    }
    const drawingData = Uint8Array.from(window.atob(encodeDrawingData()), (character) => character.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", drawingData);
    const drawingSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const lockResponse = await nativeFetch(`/api/goat-arena/matches/${matchId}/lock-question`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ questionSlot, requestId: completionRequestId, answer: lockedAnswer,
        boardRevision: lockedRevision, strokeCount: strokes.length, drawingSha256, submissionMode: lockedSubmissionMode }),
    });
    if (!lockResponse.ok) {
      const error = await lockResponse.json().catch(() => ({}));
      throw new Error(error.message || "문항 완료를 확정하지 못했습니다.");
    }
    const lockResult = (await lockResponse.json()).lock || {};
    if (lockResult.advanced) {
      revision = lockedRevision;
      sha256 = lockResult.boardSha256;
    } else if (revision === lockedRevision && /^[a-f0-9]{64}$/.test(sha256)) {
      // A restored completion may already have an accepted PNG. Reuse that
      // immutable upload across viewport/grid updates instead of recapturing it.
      setState("이미 저장된 풀이판으로 문항 완료를 확인합니다.");
    } else {
      setState("답안과 풀이 시간이 확정됐습니다. 풀이판을 업로드합니다.");
      await saveBoard(lockedRevision);
    }
    const response = await nativeFetch(input, {
      ...init,
      body: JSON.stringify({
        ...body,
        requestId: completionRequestId,
        value: lockedAnswer,
        submissionMode: lockedSubmissionMode,
        evidenceMode: "INLINE_BOARD",
        questionSlot,
        boardRevision: revision,
        boardSha256: sha256,
      }),
    });

    if (response.ok) {
      try { localStorage.removeItem(draftKey); } catch (_error) {}
      const payload = await response.clone().json().catch(() => ({}));
      if (payload.finalQuestion) {
        const finalizeResponse = await nativeFetch(finalizePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          credentials: "same-origin",
        });
        if (!finalizeResponse.ok) {
          setState("풀이판은 저장됐지만 최종 제출을 다시 확인해야 합니다.");
        }
      }
    }
    return response;
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (completionLocked) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    activeStroke = [pointFor(event)];
    strokes.push(activeStroke);
    render();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activeStroke) return;
    event.preventDefault();
    activeStroke.push(pointFor(event));
    render();
  });
  const finishStroke = () => {
    activeStroke = null;
    persistDraft();
    if (!completionLocked) scheduleAutosave();
  };
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
  boardRoot.querySelector("[data-arena-board-undo]")?.addEventListener(
    "click",
    () => {
      if (completionLocked) return;
      strokes.pop();
      persistDraft();
      render();
      scheduleAutosave();
    }
  );
  boardRoot.querySelector("[data-arena-board-clear]")?.addEventListener(
    "click",
    () => {
      if (completionLocked) return;
      if (!window.confirm("현재 문항의 풀이판을 모두 지울까요?")) return;
      strokes = [];
      persistDraft();
      render();
      scheduleAutosave();
    }
  );

  window.MatthsNoteGrid.observeCanvas(canvas, render);
  const boardReady = loadBoard();
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !completionLocked) autosave().catch(() => {});
  });
})();

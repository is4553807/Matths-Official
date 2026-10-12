(() => {
  document.querySelectorAll("[data-stored-board-evidence]").forEach(async root => {
    const form = root.querySelector("[data-stored-board-photo-form]");
    const finalizeButton = root.querySelector("[data-stored-board-finalize]");
    const previews = root.querySelector("[data-stored-board-previews]");
    const state = root.querySelector("[data-stored-board-state]");
    try {
      const response = await fetch(root.dataset.boardsUrl, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const boards = (payload.boards || []).filter(board => Number.isInteger(Number(board.questionSlot)) && board.questionSlot >= 1 && board.questionSlot <= 5);
      for (const board of boards) {
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = `${board.questionSlot}번 문항 · 저장된 격자 풀이`;
        if (board.previewURL) {
          const image = document.createElement("img");
          image.src = board.previewURL;
          image.alt = `${board.questionSlot}번 문항의 저장된 풀이`;
          image.loading = "lazy";
          figure.append(image, caption); previews.append(figure);
          continue;
        }
        const canvas = document.createElement("canvas");
        canvas.width = 1200; canvas.height = 900;
        window.MatthsNoteGrid.drawScreen(canvas);
        try {
          const bytes = Uint8Array.from(atob(board.drawingDataBase64 || ""), character => character.charCodeAt(0));
          const drawing = JSON.parse(new TextDecoder().decode(bytes));
          const context = canvas.getContext("2d");
          context.strokeStyle = "#17233c"; context.lineWidth = 4; context.lineCap = "round"; context.lineJoin = "round";
          for (const stroke of drawing.strokes || []) {
            const points = stroke.filter(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
            if (!points.length) continue;
            context.beginPath(); context.moveTo(...points[0]);
            if (points.length === 1) context.lineTo(points[0][0] + .01, points[0][1]);
            points.slice(1).forEach(point => context.lineTo(...point)); context.stroke();
          }
        } catch (_error) { /* The saved PNG remains available in the final result. */ }
        figure.append(canvas, caption); previews.append(figure);
      }
      previews.hidden = boards.length === 0;
      const uploadedSlots = new Set(boards.filter(board => /^[a-f0-9]{64}$/i.test(board.sha256 || "")).map(board => Number(board.questionSlot)));
      const complete = uploadedSlots.size === 5;
      form.hidden = complete;
      finalizeButton.hidden = !complete;
      state.textContent = complete
        ? "다섯 문항의 격자 풀이가 저장됐습니다. 아래 버튼으로 제출을 완료하세요."
        : boards.length
          ? `저장된 격자 풀이 ${boards.length}개는 결과에 함께 표시됩니다. 나머지 풀이 사진을 올려 제출을 완료하세요.`
          : "다섯 문항의 풀이과정이 포함된 사진을 올려 제출을 완료하세요.";
    } catch (_error) {
      state.textContent = "저장된 격자 풀이를 불러오지 못했습니다. 화면을 새로고침해 다시 확인하세요.";
    }
    finalizeButton.addEventListener("click", async () => {
      finalizeButton.disabled = true;
      try {
        const response = await fetch(root.dataset.finalizeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "저장된 풀이를 제출하지 못했습니다.");
        location.reload();
      } catch (error) { state.textContent = error.message; finalizeButton.disabled = false; }
    });
  });
})();

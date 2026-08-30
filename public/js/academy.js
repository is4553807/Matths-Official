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

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function svgElement(name, attributes = {}, textContent = "") {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (textContent) element.textContent = textContent;
    return element;
  }

  function shortened(value, maximum) {
    const text = String(value || "");
    return text.length > maximum ? `${text.slice(0, Math.max(1, maximum - 1))}…` : text;
  }

  function heatColor(accuracy) {
    if (!Number.isFinite(accuracy)) return { fill: "#f0f2f6", ink: "#71798a" };
    if (accuracy < 50) return { fill: "#ffe2e7", ink: "#9f3248" };
    if (accuracy < 65) return { fill: "#ffeadb", ink: "#a4582f" };
    if (accuracy < 80) return { fill: "#fff2c9", ink: "#80641c" };
    if (accuracy < 90) return { fill: "#dff4eb", ink: "#21715c" };
    return { fill: "#c9eddf", ink: "#12664f" };
  }

  function renderHeatmap(container, items) {
    container.replaceChildren();
    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement("div");
      empty.className = "academy-chart-empty";
      empty.textContent = "숙달도를 계산할 수 있는 개념별 풀이 기록이 없습니다.";
      container.append(empty);
      return;
    }

    const width = Math.max(320, Math.floor(container.clientWidth || 900));
    const columns = width < 590 ? 1 : width < 900 ? 2 : 3;
    const gap = 10;
    const cellHeight = 82;
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const rows = Math.ceil(items.length / columns);
    const height = rows * cellHeight + Math.max(0, rows - 1) * gap;
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      role: "presentation",
      "aria-hidden": "true",
    });

    items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (cellWidth + gap);
      const y = row * (cellHeight + gap);
      const mastery = item.mastery ?? item.accuracy ?? null;
      const palette = heatColor(mastery === null ? Number.NaN : Number(mastery));
      const analyzedCount = Number(item.analyzedCount ?? item.studentCount ?? 0);
      const totalStudents = Number(item.totalStudents ?? item.studentCount ?? 0);
      const sampleText = Object.prototype.hasOwnProperty.call(item, "analyzedCount")
        ? `${analyzedCount}/${totalStudents}명 분석`
        : `${item.studentCount}명 · ${item.attempts}문제`;
      const group = svgElement("g", { transform: `translate(${x} ${y})` });
      group.append(
        svgElement("title", {}, `${item.courseTitle} · ${item.unitTitle} · ${item.conceptTitle}\n규칙 기반 숙달도 ${mastery ?? "Unknown"}${mastery === null ? "" : "%"} · ${sampleText}`),
        svgElement("rect", {
          width: cellWidth,
          height: cellHeight,
          rx: 13,
          fill: palette.fill,
          stroke: palette.ink,
          "stroke-opacity": 0.16,
        }),
        svgElement("text", { x: 15, y: 20, fill: palette.ink, "font-size": 10, "font-weight": 750 }, shortened(`${item.courseTitle} · ${item.unitTitle}`, Math.max(18, Math.floor(cellWidth / 9)))),
        svgElement("text", { x: 15, y: 43, fill: "#222a3d", "font-size": 13, "font-weight": 850 }, shortened(item.conceptTitle, Math.max(16, Math.floor(cellWidth / 8)))),
        svgElement("text", { x: 15, y: 65, fill: palette.ink, "font-size": 10, "font-weight": 750 }, sampleText),
        svgElement("text", { x: cellWidth - 15, y: 53, fill: palette.ink, "font-size": 22, "font-weight": 950, "text-anchor": "end" }, mastery === null ? "?" : `${mastery}%`)
      );
      svg.append(group);
    });
    container.append(svg);
  }

  function renderGrowthChart(container, points) {
    container.replaceChildren();
    if (!Array.isArray(points) || !points.some((point) => point.attempts > 0)) {
      const empty = document.createElement("div");
      empty.className = "academy-chart-empty";
      empty.textContent = "선택 기간에 성장 추이를 그릴 문제 풀이 기록이 없습니다.";
      container.append(empty);
      return;
    }

    const width = Math.max(360, Math.floor(container.clientWidth || 650));
    const height = 300;
    const margin = { top: 22, right: 32, bottom: 42, left: 42 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const slotWidth = plotWidth / Math.max(1, points.length);
    const maxProblems = Math.max(1, ...points.map((point) => Number(point.uniqueProblems) || 0));
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      role: "presentation",
      "aria-hidden": "true",
    });

    [0, 25, 50, 75, 100].forEach((tick) => {
      const y = margin.top + plotHeight - (tick / 100) * plotHeight;
      svg.append(
        svgElement("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, stroke: "#e8ebf2", "stroke-width": 1 }),
        svgElement("text", { x: margin.left - 9, y: y + 3, fill: "#9299a9", "font-size": 9, "text-anchor": "end" }, `${tick}`)
      );
    });

    const pathParts = [];
    let previousWasPoint = false;
    points.forEach((point, index) => {
      const centerX = margin.left + slotWidth * index + slotWidth / 2;
      const barWidth = Math.min(46, slotWidth * 0.45);
      const barHeight = (Number(point.uniqueProblems) / maxProblems) * plotHeight * 0.72;
      const bar = svgElement("rect", {
        x: centerX - barWidth / 2,
        y: margin.top + plotHeight - barHeight,
        width: barWidth,
        height: barHeight,
        rx: 6,
        fill: "#dfe5ff",
      });
      bar.append(svgElement("title", {}, `${point.label} · 중복 제외 ${point.uniqueProblems}문제 · 학습 학생 ${point.activeStudents}명`));
      svg.append(bar);
      svg.append(
        svgElement("text", { x: centerX, y: height - 17, fill: "#737c90", "font-size": 10, "font-weight": 750, "text-anchor": "middle" }, point.label),
        svgElement("text", { x: centerX, y: margin.top + plotHeight - barHeight - 7, fill: "#7583bc", "font-size": 9, "font-weight": 800, "text-anchor": "middle" }, `${point.uniqueProblems}`)
      );
      if (Number.isFinite(point.accuracy)) {
        const y = margin.top + plotHeight - (Number(point.accuracy) / 100) * plotHeight;
        pathParts.push(`${previousWasPoint ? "L" : "M"} ${centerX} ${y}`);
        previousWasPoint = true;
      } else {
        previousWasPoint = false;
      }
    });

    if (pathParts.length) {
      svg.append(svgElement("path", {
        d: pathParts.join(" "),
        fill: "none",
        stroke: "#3157f6",
        "stroke-width": 3,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
      points.forEach((point, index) => {
        if (!Number.isFinite(point.accuracy)) return;
        const x = margin.left + slotWidth * index + slotWidth / 2;
        const y = margin.top + plotHeight - (Number(point.accuracy) / 100) * plotHeight;
        const circle = svgElement("circle", { cx: x, cy: y, r: 5, fill: "#fff", stroke: "#3157f6", "stroke-width": 3 });
        circle.append(svgElement("title", {}, `${point.label} 첫 시도 정답률 ${point.accuracy}%`));
        svg.append(circle, svgElement("text", { x, y: y - 11, fill: "#3157f6", "font-size": 10, "font-weight": 900, "text-anchor": "middle" }, `${point.accuracy}%`));
      });
    }
    container.append(svg);
  }

  function mathMapPalette(status) {
    return {
      MASTERED: { fill: "#dff4eb", stroke: "#25846a", ink: "#17634f" },
      DEVELOPING: { fill: "#fff2c9", stroke: "#c89b2d", ink: "#725817" },
      WEAK: { fill: "#ffe2e7", stroke: "#d15b70", ink: "#913146" },
      UNKNOWN: { fill: "#f0f2f6", stroke: "#b3bac8", ink: "#697185" },
    }[status] || { fill: "#f0f2f6", stroke: "#b3bac8", ink: "#697185" };
  }

  function renderStudentMathMap(container, concepts) {
    container.replaceChildren();
    if (!Array.isArray(concepts) || !concepts.length) {
      const empty = document.createElement("div");
      empty.className = "academy-chart-empty";
      empty.textContent = "개념별 문제 풀이 기록이 쌓이면 지도가 표시됩니다.";
      container.append(empty);
      return;
    }

    const groupMap = new Map();
    concepts.forEach((concept) => {
      const key = `${concept.courseId}/${concept.unitId}`;
      if (!groupMap.has(key)) groupMap.set(key, { title: `${concept.courseTitle} · ${concept.unitTitle}`, concepts: [] });
      groupMap.get(key).concepts.push(concept);
    });
    const groups = [...groupMap.values()];
    const columnWidth = 230;
    const nodeWidth = 194;
    const nodeHeight = 49;
    const rowHeight = 65;
    const width = Math.max(360, groups.length * columnWidth + 26);
    const height = Math.max(150, 58 + Math.max(...groups.map((group) => group.concepts.length)) * rowHeight);
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "presentation",
      "aria-hidden": "true",
    });
    const positions = new Map();
    groups.forEach((group, groupIndex) => {
      const x = 18 + groupIndex * columnWidth;
      svg.append(svgElement("text", { x, y: 22, fill: "#59637a", "font-size": 10, "font-weight": 850 }, shortened(group.title, 27)));
      group.concepts.forEach((concept, rowIndex) => {
        positions.set(concept.id, { x, y: 39 + rowIndex * rowHeight, concept });
      });
    });

    concepts.forEach((concept) => {
      const from = positions.get(concept.id);
      (concept.unlocks || []).forEach((edge) => {
        const to = positions.get(edge.to);
        if (!from || !to) return;
        const pathData = from.x === to.x
          ? `M ${from.x + nodeWidth / 2} ${from.y + nodeHeight} C ${from.x + nodeWidth / 2} ${from.y + nodeHeight + 12}, ${to.x + nodeWidth / 2} ${to.y - 12}, ${to.x + nodeWidth / 2} ${to.y}`
          : `M ${from.x + nodeWidth} ${from.y + nodeHeight / 2} C ${from.x + nodeWidth + 24} ${from.y + nodeHeight / 2}, ${to.x - 24} ${to.y + nodeHeight / 2}, ${to.x} ${to.y + nodeHeight / 2}`;
        svg.append(svgElement("path", {
          d: pathData,
          fill: "none",
          stroke: edge.type === "hard-prerequisite" ? "#8794bc" : "#b8bfd3",
          "stroke-width": edge.type === "hard-prerequisite" ? 2 : 1.25,
          "stroke-dasharray": edge.type === "hard-prerequisite" ? "0" : "4 4",
          opacity: 0.75,
        }));
      });
    });

    positions.forEach(({ x, y, concept }) => {
      const palette = mathMapPalette(concept.status);
      const group = svgElement("g", { transform: `translate(${x} ${y})` });
      group.append(
        svgElement("title", {}, `${concept.courseTitle} · ${concept.unitTitle} · ${concept.title}\n${concept.statusLabel} · 숙달도 ${concept.mastery ?? "Unknown"}${concept.mastery === null ? "" : "%"} · 신뢰도 ${concept.confidenceLabel}\n최근 유효 풀이 ${concept.evidence?.attemptCount || 0}개`),
        svgElement("rect", { width: nodeWidth, height: nodeHeight, rx: 11, fill: palette.fill, stroke: palette.stroke, "stroke-width": 1.25 }),
        svgElement("text", { x: 12, y: 20, fill: "#222a3d", "font-size": 10, "font-weight": 850 }, shortened(concept.title, 19)),
        svgElement("text", { x: 12, y: 37, fill: palette.ink, "font-size": 9, "font-weight": 750 }, `${concept.statusLabel} · ${concept.evidence?.attemptCount || 0}개 풀이`),
        svgElement("text", { x: nodeWidth - 11, y: 31, fill: palette.ink, "font-size": 16, "font-weight": 950, "text-anchor": "end" }, concept.mastery === null ? "?" : `${concept.mastery}%`)
      );
      svg.append(group);
    });
    container.append(svg);
  }

  const analyticsDataElement = document.querySelector("[data-academy-analytics-data]");
  const growthChart = document.querySelector("[data-academy-growth-chart]");
  const heatmapChart = document.querySelector("[data-academy-heatmap-chart]");
  if (analyticsDataElement && (growthChart || heatmapChart)) {
    let analyticsData = {};
    try {
      analyticsData = JSON.parse(analyticsDataElement.textContent || "{}");
    } catch (_error) {
      analyticsData = {};
    }
    const renderAnalytics = () => {
      if (growthChart) renderGrowthChart(growthChart, analyticsData.growth?.points || []);
      if (heatmapChart) renderHeatmap(heatmapChart, analyticsData.heatmap?.items || []);
    };
    renderAnalytics();
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderAnalytics, 120);
    });
  }

  const classMathMapElement = document.querySelector("[data-class-math-map-data]");
  const classMathMapChart = document.querySelector("[data-class-math-map-chart]");
  if (classMathMapElement && classMathMapChart) {
    try {
      const classMathMapData = JSON.parse(classMathMapElement.textContent || "{}");
      renderHeatmap(classMathMapChart, classMathMapData.heatmap?.items || []);
    } catch (_error) {
      renderHeatmap(classMathMapChart, []);
    }
  }

  const studentMathMapElement = document.querySelector("[data-student-math-map-data]");
  const studentMathMapChart = document.querySelector("[data-student-math-map-chart]");
  if (studentMathMapElement && studentMathMapChart) {
    try {
      const studentMathMapData = JSON.parse(studentMathMapElement.textContent || "{}");
      renderStudentMathMap(studentMathMapChart, studentMathMapData.concepts || []);
    } catch (_error) {
      renderStudentMathMap(studentMathMapChart, []);
    }
  }

  const attendanceForm = document.querySelector("[data-attendance-form]");
  if (attendanceForm) {
    const attendanceSelects = [...attendanceForm.querySelectorAll("[data-attendance-status]")];
    const markUnrecordedButton = attendanceForm.querySelector("[data-attendance-mark-unrecorded]");
    const updateAttendanceRow = (select) => {
      const row = select.closest("tr");
      if (!row) return;
      row.className = select.value ? `is-${select.value.toLowerCase()}` : "is-unrecorded";
    };
    attendanceSelects.forEach((select) => {
      select.addEventListener("change", () => updateAttendanceRow(select));
    });
    markUnrecordedButton?.addEventListener("click", () => {
      let changed = 0;
      attendanceSelects.forEach((select) => {
        if (select.value) return;
        select.value = "PRESENT";
        updateAttendanceRow(select);
        changed += 1;
      });
      showToast(changed ? `미기록 학생 ${changed}명을 출석으로 입력했습니다.` : "미기록 학생이 없습니다.");
    });
  }
})();

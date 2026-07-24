(function () {
  "use strict";

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setProgress(element, property, percent) {
    if (element) element.style.setProperty(property, `${percent}%`);
  }

  async function requestJson(url, options) {
    const { headers = {}, ...requestOptions } = options;
    const response = await window.fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      },
      ...requestOptions,
    });

    if (response.redirected && new URL(response.url).pathname === "/login") {
      window.location.assign("/login");
      throw new Error("로그인 세션이 만료되었습니다.");
    }

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      throw new Error(body?.message || "학습 진도를 저장하지 못했습니다.");
    }

    if (!body) {
      throw new Error("서버 응답 형식이 올바르지 않습니다.");
    }

    return body;
  }

  function syncTaskLabel(checkbox) {
    const task = checkbox.closest(".topic-task");
    if (!task) return;

    const done = checkbox.checked;
    task.classList.toggle("done", done);
    setText(task.querySelector(".topic-check"), done ? "✓" : "");
    setText(task.querySelector("small"), done ? "학습 완료" : "완료로 표시");
  }

  function initTopicProgress() {
    const lesson = document.querySelector(
      ".lesson-panel[data-course-id][data-unit-id][data-concept-id]"
    );
    const checkboxes = Array.from(
      document.querySelectorAll(".topic-checkbox[data-topic-index]")
    );

    if (!lesson || !checkboxes.length) return;

    const { courseId, unitId, conceptId } = lesson.dataset;
    const progressValue = document.getElementById("concept-progress-value");
    const progressBar = document.getElementById("concept-progress-bar");
    const progressWrap = document.querySelector(".concept-completion");
    const topicCount = document.getElementById("topic-count");
    const feedback = document.getElementById("topic-feedback");
    const unitProgressValue = document.getElementById("unit-progress-value");
    const unitProgressBar = document.getElementById("unit-progress-bar");
    const unitCompletedCount = document.getElementById("unit-completed-count");
    const completedConceptBadge = document.getElementById("completed-concept-badge");
    const activeRailItem = document.querySelector(
      `.concept-nav-item[data-concept-id="${CSS.escape(conceptId)}"]`
    );
    let isSaving = false;

    function setSaving(saving, changedCheckbox) {
      isSaving = saving;
      lesson.setAttribute("aria-busy", String(saving));
      checkboxes.forEach((checkbox) => {
        checkbox.disabled = saving;
        checkbox.closest(".topic-task")?.classList.toggle(
          "saving",
          saving && checkbox === changedCheckbox
        );
      });
    }

    function renderProgress(progress) {
      const conceptProgress = progress.concept;
      const unitProgress = progress.unit;

      if (!conceptProgress || !unitProgress) {
        throw new Error("저장된 진도 정보를 불러오지 못했습니다.");
      }

      const completedIndexes = new Set(
        (conceptProgress.completedTopicIndexes || []).map(Number)
      );

      checkboxes.forEach((checkbox) => {
        checkbox.checked = completedIndexes.has(
          Number(checkbox.dataset.topicIndex)
        );
        syncTaskLabel(checkbox);
      });

      setText(progressValue, `${conceptProgress.progress}%`);
      setProgress(progressBar, "--concept-progress", conceptProgress.progress);
      progressWrap?.setAttribute(
        "aria-valuenow",
        String(conceptProgress.progress)
      );
      setText(
        topicCount,
        `${conceptProgress.completedTopics} / ${conceptProgress.topicCount} 완료`
      );

      if (activeRailItem) {
        activeRailItem.classList.remove(
          "completed",
          "in-progress",
          "not-started"
        );
        activeRailItem.classList.add(conceptProgress.status);

        const railValue = activeRailItem.querySelector("em");
        const railBar = activeRailItem.querySelector("i b");
        const railState = activeRailItem.querySelector(":scope > span");

        setText(railValue, `${conceptProgress.progress}%`);
        setProgress(
          railBar,
          "--concept-progress",
          conceptProgress.progress
        );
        setText(
          railState,
          conceptProgress.progress >= 100
            ? "✓"
            : activeRailItem.dataset.conceptNumber
        );
      }

      setText(unitProgressValue, `${unitProgress.progress}%`);
      setProgress(unitProgressBar, "--unit-progress", unitProgress.progress);
      setText(
        unitCompletedCount,
        `${unitProgress.completedConcepts} / ${unitProgress.totalConcepts}개념 완료`
      );
      setText(completedConceptBadge, progress.overall.completedConcepts);
    }

    checkboxes.forEach((checkbox) => {
      syncTaskLabel(checkbox);

      checkbox.addEventListener("change", async () => {
        if (isSaving) return;

        const previousChecked = !checkbox.checked;
        const completed = checkbox.checked;
        const topicIndex = Number(checkbox.dataset.topicIndex);
        const topicTitle = checkbox
          .closest(".topic-task")
          ?.querySelector("strong")
          ?.textContent.trim();

        syncTaskLabel(checkbox);
        setSaving(true, checkbox);
        setText(feedback, "학습 진도를 저장하는 중입니다…");

        try {
          const endpoint = [
            "/api/learning-progress",
            encodeURIComponent(courseId),
            encodeURIComponent(unitId),
            encodeURIComponent(conceptId),
            "topics",
            encodeURIComponent(topicIndex),
          ].join("/");

          const result = await requestJson(endpoint, {
            method: "PATCH",
            body: JSON.stringify({ completed }),
          });

          renderProgress(result.progress);
          setText(
            feedback,
            completed
              ? `‘${topicTitle}’ 학습을 완료하고 DB에 저장했습니다.`
              : `‘${topicTitle}’의 완료 표시를 취소하고 DB에 반영했습니다.`
          );
        } catch (error) {
          checkbox.checked = previousChecked;
          syncTaskLabel(checkbox);
          setText(
            feedback,
            `${error.message} 잠시 후 다시 시도해주세요.`
          );
        } finally {
          setSaving(false, checkbox);
        }
      });
    });
  }

  function initStepPreview() {
    const button = document.getElementById("preview-steps");
    const cards = Array.from(document.querySelectorAll(".visual-step-card"));
    if (!button || !cards.length) return;

    let timers = [];

    function clearPreview() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
      cards.forEach((card) =>
        card.classList.remove("active", "previewing")
      );
    }

    button.addEventListener("click", () => {
      clearPreview();
      button.disabled = true;
      button.textContent = "Step 재생 중";

      cards.forEach((card, index) => {
        timers.push(
          window.setTimeout(() => {
            cards.forEach((item) =>
              item.classList.remove("active", "previewing")
            );
            card.classList.add("active", "previewing");
          }, index * 900)
        );
      });

      timers.push(
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = "Step 순서 재생";
        }, cards.length * 900)
      );
    });
  }

  function init() {
    initTopicProgress();
    initStepPreview();

    const activeConcept = document.querySelector(".concept-nav-item.active");
    if (activeConcept) {
      activeConcept.scrollIntoView({ block: "nearest" });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

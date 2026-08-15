(function (global) {
  "use strict";

  const READY_TIMEOUT_MS = 15000;
  const RETRY_INTERVAL_MS = 25;
  let readyPromise = null;
  let renderQueue = Promise.resolve();

  function currentMathJax() {
    const mathJax = global.MathJax;

    return mathJax && (
      typeof mathJax.typeset === "function"
      || typeof mathJax.typesetPromise === "function"
    )
      ? mathJax
      : null;
  }

  function waitForMathJax() {
    if (readyPromise) return readyPromise;

    readyPromise = new Promise((resolve, reject) => {
      const startedAt = Date.now();

      function check() {
        const mathJax = currentMathJax();

        if (mathJax) {
          // MathJax 4의 접근성 후처리는 startup.promise보다 오래 걸릴 수
          // 있습니다. 공개 typeset API가 준비된 시점부터 동적 수식은
          // 동기 렌더를 먼저 시도하고, 필요한 경우 아래 render()에서
          // typesetPromise로 안전하게 폴백합니다.
          resolve(mathJax);
          return;
        }

        if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
          reject(new Error("MathJax를 불러오지 못했습니다."));
          return;
        }

        global.setTimeout(check, RETRY_INTERVAL_MS);
      }

      check();
    }).catch((error) => {
      readyPromise = null;
      throw error;
    });

    return readyPromise;
  }

  function normalizeTargets(targets) {
    const list = Array.isArray(targets) ? targets : [targets];

    return list.filter(
      (target) =>
        target &&
        typeof target === "object" &&
        typeof target.nodeType === "number"
    );
  }

  function clear(targets) {
    const elements = normalizeTargets(targets);
    const mathJax = currentMathJax();

    if (!elements.length || !mathJax?.typesetClear) return;

    try {
      mathJax.typesetClear(elements);
    } catch (error) {
      console.error("기존 수식 렌더링 상태를 정리하지 못했습니다.", error);
    }
  }

  function applyAccessibleMathLabels(elements) {
    elements.forEach((element) => {
      element.querySelectorAll("mjx-container").forEach((container) => {
        const source = container
          .querySelector("[data-latex]")
          ?.getAttribute("data-latex")
          ?.trim();

        container.setAttribute("role", "math");
        container.setAttribute(
          "aria-label",
          source || "수학식"
        );

        const svg = container.querySelector(":scope > svg");
        svg?.setAttribute("aria-hidden", "true");

        const label = container.closest("label");
        const input = label?.querySelector(
          'input[type="radio"], input[type="checkbox"]'
        );

        if (input && !input.getAttribute("aria-label")) {
          const plainText = Array.from(label.childNodes)
            .filter((node) => node !== container)
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

          input.setAttribute(
            "aria-label",
            [plainText, source].filter(Boolean).join(" ")
          );
        }
      });
    });
  }

  function render(targets) {
    const elements = normalizeTargets(targets);

    if (!elements.length) return Promise.resolve();
    elements.forEach((element) => {
      element.dataset.mathRenderState = "queued";
    });

    renderQueue = renderQueue
      .catch(() => {})
      .then(async () => {
        const mathJax = await waitForMathJax();
        elements.forEach((element) => {
          element.dataset.mathRenderState = "rendering";
        });
        mathJax.typesetClear?.(elements);
        if (typeof mathJax.typeset === "function") {
          try {
            mathJax.typeset(elements);
            applyAccessibleMathLabels(elements);
            elements.forEach((element) => {
              element.dataset.mathRenderState = "rendered";
            });
            return;
          } catch (error) {
            mathJax.typesetClear?.(elements);
          }
        }
        await mathJax.typesetPromise(elements);
        applyAccessibleMathLabels(elements);
        elements.forEach((element) => {
          element.dataset.mathRenderState = "rendered";
        });
      })
      .catch((error) => {
        elements.forEach((element) => {
          element.dataset.mathRenderState = "error";
        });
        console.error("수식을 렌더링하지 못했습니다.", error);
      });

    return renderQueue;
  }

  function setText(target, value) {
    if (!target) return Promise.resolve();
    clear(target);
    target.textContent = value == null ? "" : String(value);
    target.dataset.mathRenderState = "source-set";
    return render(target);
  }

  global.MatthsMath = Object.freeze({
    ready: waitForMathJax,
    clear,
    render,
    setText,
  });

  function enhanceExistingMath() {
    applyAccessibleMathLabels([global.document]);
  }

  global.addEventListener(
    "load",
    () => {
      global.setTimeout(enhanceExistingMath, 0);
      global.setTimeout(enhanceExistingMath, 1500);
    },
    { once: true }
  );
})(window);

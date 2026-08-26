(function () {
  "use strict";

  const script = document.currentScript;
  const languageSwitcher = document.querySelector(".matths-language-switcher");

  function positionLanguageSwitcher() {
    if (!languageSwitcher) return;
    languageSwitcher.style.top = "10px";
    const switcherRect = languageSwitcher.getBoundingClientRect();
    const headerBottom = [...document.querySelectorAll("header, [role='banner']")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) =>
        rect.height > 0 &&
        rect.top <= 24 &&
        rect.right >= switcherRect.left - 16 &&
        rect.left <= switcherRect.right + 16
      )
      .reduce((bottom, rect) => Math.max(bottom, rect.bottom), 0);
    if (headerBottom > 0 && headerBottom < window.innerHeight * 0.4) {
      languageSwitcher.style.top = `${Math.ceil(headerBottom + 10)}px`;
    }
  }

  positionLanguageSwitcher();
  requestAnimationFrame(positionLanguageSwitcher);
  window.addEventListener("resize", positionLanguageSwitcher, { passive: true });

  const locale = String(
    script?.dataset?.locale || document.documentElement.lang || "ko"
  ).toLowerCase();
  if (!locale.startsWith("en")) {
    document.documentElement.dataset.i18nReady = "true";
    return;
  }

  const skippedTags = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA",
    "SVG", "MATH", "MJX-CONTAINER",
  ]);
  const translatedAttributes = [
    "placeholder", "title", "aria-label", "alt", "content",
    "data-search", "data-label",
  ];

  function normalized(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function shouldSkip(element) {
    if (element?.closest("[data-i18n-translate]")) return false;
    return !element || skippedTags.has(element.tagName) ||
      Boolean(element.closest("[data-i18n-skip], .MathJax, mjx-container"));
  }

  function preserveOuterWhitespace(source, translated) {
    const leading = String(source).match(/^\s*/)?.[0] || "";
    const trailing = String(source).match(/\s*$/)?.[0] || "";
    return `${leading}${translated}${trailing}`;
  }

  function patternTranslation(source) {
    const environmentVariablesMatch = source.match(
      /^(.+?)와 (.+?)를 서버 환경변수에 등록해\s*주세요\.$/u
    );
    if (environmentVariablesMatch) {
      return `Add ${environmentVariablesMatch[1]} and ${environmentVariablesMatch[2]} to the server environment variables.`;
    }

    const fullRefundMatch = source.match(
      /^결제일과 이용 시작일 중 늦은 날부터 7일 이내이고 (.+?)(?:을|를) 한 번도 이용하지 않았다면 전액 환불합니다\.$/u
    );
    if (fullRefundMatch) {
      const feature = fullRefundMatch[1] === "Matths 주간 공식 모의고사"
        ? "the Matths Weekly Official Mock Exam"
        : "paid features such as season and return placement tests, weekly official mock exams, or GOAT Arena";
      return `You will receive a full refund if the request is made within 7 days of the later of the payment date or service start date and you have not used ${feature}.`;
    }

    const partialRefundMatch = source.match(
      /^유료 기능을 이용했거나 7일이 지난 뒤에도 이용 기간이 남아 있다면 다음과 같이 계산합니다\. 부분 환불액 = 결제금액 - 일할 이용금액\(결제금액 × 이용일수 ÷ (\d+)일\)\. 계산 중 발생하는 1원 미만 금액은 버리며, 이용일수는 이용 시작일부터 환불 신청일까지 포함합니다\.$/u
    );
    if (partialRefundMatch) {
      return `If paid features have been used, or more than 7 days have passed while time remains, the partial refund is: payment amount − prorated usage amount (payment amount × days used ÷ ${partialRefundMatch[1]} days). Fractions below KRW 1 are discarded, and days used include both the service start date and refund request date.`;
    }

    const patterns = [
      [/^1개 학교$/, "1 school"],
      [/^(\d+)개 학교$/, "$1 schools"],
      [/^1개 공시대상 대학·캠퍼스$/, "1 listed university/campus"],
      [/^(\d+)개 공시대상 대학·캠퍼스$/, "$1 listed universities/campuses"],
      [/^1개의 질문$/, "1 question"],
      [/^(\d+)개의 질문$/, "$1 questions"],
      [/^(\d+) 오류는 무엇인가요\?$/, "What does error $1 mean?"],
      [/^(\d+)개$/, "$1"],
      [/^(\d+)명$/, "$1 people"],
      [/^(\d+)건$/, "$1 items"],
      [/^(\d+)문제$/, "$1 problems"],
      [/^(\d+)분$/, "$1 min"],
      [/^(\d+)시간$/, "$1 hr"],
      [/^(\d+)일$/, "$1 days"],
      [/^(\d+)위$/, "Rank $1"],
      [/^Lv\.(\d+)$/, "Lv.$1"],
      [/^(\d+)판$/, "$1 matches"],
      [/^총 (\d+)판$/, "$1 matches total"],
      [/^진행 (\d+)\/(\d+)$/, "Progress $1/$2"],
    ];
    for (const [expression, replacement] of patterns) {
      if (expression.test(source)) return source.replace(expression, replacement);
    }
    return "";
  }

  function createTranslator(dictionary) {
    return function translate(source) {
      const key = normalized(source);
      if (!key || !/[가-힣]/.test(key)) return source;
      let translated = dictionary[key] || patternTranslation(key);
      if (!translated && /\s[·•|]\s/.test(key)) {
        const pieces = key.split(/(\s[·•|]\s)/);
        const translatedPieces = pieces.map((piece) => {
          const normalizedPiece = normalized(piece);
          if (/^[·•|]$/.test(normalizedPiece)) return piece;
          return dictionary[normalizedPiece] || patternTranslation(normalizedPiece) || piece;
        });
        if (translatedPieces.some((piece, index) => piece !== pieces[index])) {
          translated = translatedPieces.join("");
        }
      }
      return translated ? preserveOuterWhitespace(source, translated) : source;
    };
  }

  function translateElement(element, translate) {
    if (shouldSkip(element)) return;
    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;
      const source = element.getAttribute(attribute);
      const translated = translate(source);
      if (translated !== source) element.setAttribute(attribute, translated.trim());
    }
    if (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(element.type)
    ) {
      const translated = translate(element.value);
      if (translated !== element.value) element.value = translated.trim();
    }
  }

  function translateTree(root, translate) {
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (!shouldSkip(parent)) root.nodeValue = translate(root.nodeValue);
      return;
    }
    if (!(root instanceof Element) && root !== document) return;
    if (root instanceof Element) translateElement(root, translate);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const element = node.nodeType === Node.ELEMENT_NODE
            ? node
            : node.parentElement;
          return shouldSkip(element)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.nodeValue = translate(node.nodeValue);
      } else {
        translateElement(node, translate);
      }
      node = walker.nextNode();
    }
  }

  const assetVersion = encodeURIComponent(script?.dataset?.assetVersion || "");
  const dictionaryUrl = `/i18n/en.json${assetVersion ? `?v=${assetVersion}` : ""}`;
  fetch(dictionaryUrl, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Translation dictionary ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      const translate = createTranslator(payload.translations || payload);
      translateTree(document, translate);
      let queued = false;
      const changedRoots = new Set();
      const observer = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.type === "characterData") changedRoots.add(record.target);
          record.addedNodes.forEach((node) => changedRoots.add(node));
        });
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          changedRoots.forEach((root) => translateTree(root, translate));
          changedRoots.clear();
          queued = false;
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      document.documentElement.dataset.i18nReady = "true";
      document.dispatchEvent(new CustomEvent("matths:i18n-ready"));
    })
    .catch((error) => {
      document.documentElement.dataset.i18nReady = "error";
      console.error("Matths English translation failed:", error);
    });
})();

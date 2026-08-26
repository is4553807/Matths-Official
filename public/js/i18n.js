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
    const tierNames = {
      브론즈: "Bronze",
      실버: "Silver",
      골드: "Gold",
      플래티넘: "Platinum",
      에메랄드: "Emerald",
      다이아몬드: "Diamond",
      마스터: "Master",
      그랜드마스터: "Grandmaster",
      챌린저: "Challenger",
    };
    const tierDefense = source.match(
      /^(브론즈|실버|골드|플래티넘|에메랄드|다이아몬드|마스터|그랜드마스터|챌린저) 방어$/u
    );
    if (tierDefense) return `${tierNames[tierDefense[1]]} defender`;

    const divisionHeading = source.match(/^(UNRANKED|RANKED|Unranked|Ranked) 핵심 규정$/u);
    if (divisionHeading) {
      const division = divisionHeading[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `${division} Key Rules`;
    }
    const divisionMatchRules = source.match(
      /^(UNRANKED|RANKED|Unranked|Ranked) 1대1 경기에 적용되는 규정$/u
    );
    if (divisionMatchRules) {
      const division = divisionMatchRules[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `Rules for ${division} 1-on-1 matches`;
    }
    const divisionQuestionStandard = source.match(
      /^(UNRANKED|RANKED|Unranked|Ranked) 출제 기준$/u
    );
    if (divisionQuestionStandard) {
      const division = divisionQuestionStandard[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `${division} Question Standards`;
    }
    const divisionQuestionMethod = source.match(
      /^(UNRANKED|RANKED|Unranked|Ranked) 1대1 문제는 이렇게 정합니다\.$/u
    );
    if (divisionQuestionMethod) {
      const division = divisionQuestionMethod[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `How ${division} 1-on-1 questions are selected.`;
    }
    const divisionAccuracyTable = source.match(
      /^(UNRANKED|RANKED|Unranked|Ranked) 전용 정답률표$/u
    );
    if (divisionAccuracyTable) {
      const division = divisionAccuracyTable[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `${division} Accuracy Bands`;
    }
    const divisionDifficultySpec = source.match(
      /^(UNRANKED|RANKED|Unranked|Ranked) 난이도 정의와 경기 규격$/u
    );
    if (divisionDifficultySpec) {
      const division = divisionDifficultySpec[1].toLowerCase() === "ranked"
        ? "Ranked"
        : "Unranked";
      return `${division} Difficulty Definitions and Match Format`;
    }
    const difficultyRange = source.match(
      /^정답률 구간과 문항 순서로 ([UR]1~[UR]9) 난이도를 구분합니다\.$/u
    );
    if (difficultyRange) {
      return `Difficulty levels ${difficultyRange[1].replace("~", "–")} are defined by reference accuracy and question order.`;
    }
    const accuracyAtLeast = source.match(/^기준 정답률 (\d+)% 이상$/u);
    if (accuracyAtLeast) {
      return `Reference accuracy: ${accuracyAtLeast[1]}% or higher`;
    }
    const accuracyBand = source.match(
      /^기준 정답률 (\d+)% 이상 (\d+)% 미만$/u
    );
    if (accuracyBand) {
      return `Reference accuracy: ${accuracyBand[1]}% to under ${accuracyBand[2]}%`;
    }
    const accuracyUnder = source.match(/^기준 정답률 (\d+)% 미만$/u);
    if (accuracyUnder) {
      return `Reference accuracy: under ${accuracyUnder[1]}%`;
    }
    const pointsPerQuestion = source.match(
      /^(\d+)점 \(문항당 (\d+)점\)$/u
    );
    if (pointsPerQuestion) {
      return `${pointsPerQuestion[1]} points (${pointsPerQuestion[2]} per question)`;
    }
    const dedicatedCombination = source.match(/^([UR]1)~([UR]9) 전용 조합$/u);
    if (dedicatedCombination) {
      return `Dedicated ${dedicatedCombination[1]}–${dedicatedCombination[2]} combinations`;
    }
    const policyRule = source.match(/^규정 (\d+)$/u);
    if (policyRule) return `Rule ${policyRule[1]}`;
    const policySection = source.match(/^제(\d+)절$/u);
    if (policySection) return `Section ${policySection[1]}`;
    const tierGap = source.match(/^(\d+)단계 차이$/u);
    if (tierGap) return `${tierGap[1]}-tier gap`;
    const depositRange = source.match(/^(\d+)~(\d+)일 예치$/u);
    if (depositRange) {
      return `Deposit ${depositRange[1]}–${depositRange[2]} days`;
    }
    const originalStakeMultiple = source.match(/^원경기의 (\d+)배$/u);
    if (originalStakeMultiple) {
      return `${originalStakeMultiple[1]}× the original match stake`;
    }
    const scoreRange = source.match(/^(\d+)~(\d+)점$/u);
    if (scoreRange) return `${scoreRange[1]}–${scoreRange[2]} points`;
    const scoreAtLeast = source.match(/^(\d+)점 이상$/u);
    if (scoreAtLeast) return `${scoreAtLeast[1]}+ points`;
    const wonAmount = source.match(/^([\d,]+)원$/u);
    if (wonAmount) return `KRW ${wonAmount[1]}`;
    const activityDays = source.match(/^(\d+) \/ (\d+)일$/u);
    if (activityDays) return `${activityDays[1]} / ${activityDays[2]} days`;
    const questionNumber = source.match(/^(\d+)번$/u);
    if (questionNumber) return `Question ${questionNumber[1]}`;
    const countTimes = source.match(/^(\d+)회$/u);
    if (countTimes) return `${countTimes[1]} times`;
    const plainPoints = source.match(/^(\d+)점$/u);
    if (plainPoints) return `${plainPoints[1]} points`;
    const profileLabel = source.match(
      /^(.+?)님의 GOAT Arena 프로필, 활동 레벨 (\d+)$/u
    );
    if (profileLabel) {
      return `${profileLabel[1]}'s GOAT Arena profile, activity level ${profileLabel[2]}`;
    }
    const paybackAttendanceSummary = source.match(
      /^(\d+)일 이용 주기 중 서로 다른 한국 날짜 (\d+)일에 공격자로 모든 답안과 필수 풀이 증거를 정상 제출해야 합니다\. 공격 시작만으로는 인정하지 않고 승패는 관계없으며, 같은 날 여러 번 정상 제출해도 공격 출석은 1일로 계산합니다\. 출석일은 연속될 필요가 없습니다\.$/u
    );
    if (paybackAttendanceSummary) {
      return `During the ${paybackAttendanceSummary[1]}-day access cycle, submit every answer and all required solution evidence as the attacker on ${paybackAttendanceSummary[2]} different calendar days in Korea. Starting a match alone does not count, and the result does not matter. Multiple valid submissions on the same day count as one attendance day, and the days do not need to be consecutive.`;
    }
    const paybackAttendanceRequirement = source.match(
      /^(\d+)일 이용 주기 중 서로 다른 한국 날짜 (\d+)일에 (Unranked|Ranked) 일반 쟁탈전 또는 복수전의 공격자로 모든 (\d+)개 답안과 필수 풀이 증거를 정상 제출해야 합니다\.$/u
    );
    if (paybackAttendanceRequirement) {
      return `During the ${paybackAttendanceRequirement[1]}-day access cycle, submit all ${paybackAttendanceRequirement[4]} answers and the required solution evidence as the attacker in an ${paybackAttendanceRequirement[3]} Challenge Match or Revenge Match on ${paybackAttendanceRequirement[2]} different calendar days in Korea.`;
    }
    const paybackAttendanceClarification = source.match(
      /^공격 시작만으로는 인정하지 않고 승패는 관계없으며, 같은 날 여러 번 정상 제출해도 공격 출석은 1일로 계산합니다\. (\d+)일은 연속될 필요가 없습니다\.$/u
    );
    if (paybackAttendanceClarification) {
      return `Starting a match alone does not count, and the result does not matter. Multiple valid submissions on the same day count as one attendance day; the ${paybackAttendanceClarification[1]} days do not need to be consecutive.`;
    }

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
      [/^(\d+)과목$/, "$1 courses"],
      [/^(\d+)개 과목$/, "$1 courses"],
      [/^(\d+)개 성취기준$/, "$1 achievement standards"],
      [/^(\d+)학기 기본 순서$/, "Recommended order for Semester $1"],
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
      const leadingDash = key.match(/^—\s*(.+)$/u);
      if (!translated && leadingDash) {
        const translatedRemainder =
          dictionary[leadingDash[1]] || patternTranslation(leadingDash[1]);
        if (translatedRemainder) translated = `— ${translatedRemainder}`;
      }
      const errorSearch = key.match(
        /^오류 에러 코드 error (\d+) HTTP_(\d+) (.+)$/u
      );
      if (!translated && errorSearch) {
        const translatedTitle =
          dictionary[errorSearch[3]] || patternTranslation(errorSearch[3]);
        if (translatedTitle) {
          translated =
            `error code ${errorSearch[1]} HTTP_${errorSearch[2]} ${translatedTitle}`;
        }
      }
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

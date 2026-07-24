const SUBSCRIPT_CHARACTERS = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "₌": "=",
  "₍": "(",
  "₎": ")",
  "ₙ": "n",
  "ₖ": "k",
};

const SUPERSCRIPT_CHARACTERS = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁼": "=",
  "⁽": "(",
  "⁾": ")",
  "ⁿ": "n",
  "ᵏ": "k",
  "ᵐ": "m",
  "ᶠ": "f",
  "ᵍ": "g",
  "ˣ": "x",
};

const MATH_FRAGMENT_PATTERN =
  /[A-Za-z0-9πθΣ√∛∞₀-₉₊₋₌₍₎ₙₖ⁰-⁹⁺⁻⁼⁽⁾ⁿᵏᵐᶠᵍˣ≤≥≠×÷·−±°]/;

const DASHBOARD_FORMULA_OVERRIDES = {
  "밑>1 증가 · 0<밑<1 감소":
    "\\(a>1\\): 증가, \\(0<a<1\\): 감소",
  "π rad = 180° · l = rθ":
    "\\(\\pi\\,\\mathrm{rad}=180^{\\circ},\\quad l=r\\theta\\)",
  "(cosθ, sinθ) · sin²θ + cos²θ = 1":
    "\\((\\cos\\theta,\\sin\\theta),\\quad " +
    "\\sin^2\\theta+\\cos^2\\theta=1\\)",
  "a/sinA = 2R · a² = b²+c²−2bc·cosA":
    "\\(\\frac{a}{\\sin A}=2R,\\quad " +
    "a^2=b^2+c^2-2bc\\cos A\\)",
};

function scriptText(value, characterMap) {
  return Array.from(value)
    .map(
      (character) =>
        characterMap[character] ||
        character
    )
    .join("");
}

function replaceScriptCharacters(
  value,
  characterMap,
  marker
) {
  const characters = Object.keys(characterMap)
    .join("");
  const pattern = new RegExp(
    `[${characters}]+`,
    "g"
  );

  return value.replace(pattern, (match) => {
    const content = Array.from(match)
      .map((character) => characterMap[character])
      .join("");

    return `${marker}{${content}}`;
  });
}

function normalizeRootNotation(value) {
  let result = value;
  const superscriptCharacters =
    Object.keys(SUPERSCRIPT_CHARACTERS)
      .join("");

  result = result.replace(
    new RegExp(
      `([${superscriptCharacters}]+)√\\(([^()]*)\\)`,
      "g"
    ),
    (_, index, radicand) =>
      `\\sqrt[${scriptText(
        index,
        SUPERSCRIPT_CHARACTERS
      )}]{${radicand}}`
  );
  result = result.replace(
    new RegExp(
      `([${superscriptCharacters}]+)√` +
        `([A-Za-z0-9]+[${superscriptCharacters}]*)`,
      "g"
    ),
    (_, index, radicand) =>
      `\\sqrt[${scriptText(
        index,
        SUPERSCRIPT_CHARACTERS
      )}]{${radicand}}`
  );

  result = result.replace(
    /∛\(([^()]*)\)/g,
    "\\sqrt[3]{$1}"
  );
  result = result.replace(
    /√\(([^()]*)\)/g,
    "\\sqrt{$1}"
  );
  result = result.replace(
    /∛([A-Za-z0-9]+(?:_\{[^}]+\}|\^\{[^}]+\})*)/g,
    "\\sqrt[3]{$1}"
  );
  result = result.replace(
    /√([A-Za-z0-9]+(?:_\{[^}]+\}|\^\{[^}]+\})*)/g,
    "\\sqrt{$1}"
  );

  return result;
}

function normalizeMathSource(value) {
  let result = String(value);

  result = result
    .replace(/−/g, "-")
    .replace(/\+\s*-/g, "-")
    .replace(/½/g, "\\frac{1}{2}");

  result = normalizeRootNotation(result);
  result = replaceScriptCharacters(
    result,
    SUBSCRIPT_CHARACTERS,
    "_"
  );
  result = replaceScriptCharacters(
    result,
    SUPERSCRIPT_CHARACTERS,
    "^"
  );

  result = result
    .replace(/\^\(([^()]*)\)/g, "^{$1}")
    .replace(/Σ/g, "\\sum ")
    .replace(/π/g, "\\pi")
    .replace(/θ/g, "\\theta")
    .replace(/∞/g, "\\infty")
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/≠/g, "\\ne ")
    .replace(/×/g, "\\times ")
    .replace(/÷/g, "\\div ")
    .replace(/·/g, "\\cdot ")
    .replace(/→/g, "\\to ")
    .replace(/±/g, "\\pm ")
    .replace(/°/g, "^{\\circ}")
    .replace(/⟺|⇔/g, "\\Longleftrightarrow ")
    .replace(/⇒/g, "\\Longrightarrow ")
    .replace(/↔/g, "\\leftrightarrow ")
    .replace(/∧/g, "\\land ")
    .replace(/∀/g, "\\forall ")
    .replace(/\brad\b/g, "\\mathrm{rad}")
    .replace(
      /\b(log|sin|cos|tan)(?=[A-Z])/g,
      "\\$1 "
    )
    .replace(
      /(^|[^\\A-Za-z])(log|sin|cos|tan)(?=[^A-Za-z]|$)/g,
      "$1\\$2"
    )
    .replace(/\s+/g, " ")
    .trim();

  return result;
}

function wrapMathFragment(fragment) {
  const leadingWhitespace =
    fragment.match(/^\s*/)?.[0] || "";
  const trailingWhitespace =
    fragment.match(/\s*$/)?.[0] || "";
  let core = fragment.trim();

  if (!core || !MATH_FRAGMENT_PATTERN.test(core)) {
    return fragment;
  }

  let leadingPunctuation = "";
  let trailingPunctuation = "";
  const punctuationOnly =
    /^[\s.,;:!?'"‘’“”()[\]{}·×÷+\-=<>≤≥≠±→↔⇒⇔⟺∧∀]+$/;

  if (punctuationOnly.test(core)) {
    return fragment;
  }

  const quoteMatch = core.match(
    /^([,;:'"‘’“”]+\s*)/
  );

  if (quoteMatch) {
    leadingPunctuation = quoteMatch[1];
    core = core.slice(
      leadingPunctuation.length
    );
  }

  const punctuationMatch = core.match(
    /(\s*[,;.!?。]+)$/
  );

  if (punctuationMatch) {
    trailingPunctuation = punctuationMatch[1];
    core = core.slice(
      0,
      -trailingPunctuation.length
    );
  }

  if (
    core.endsWith("(") &&
    !core.includes(")")
  ) {
    core = core.slice(0, -1).trimEnd();
    trailingPunctuation =
      ` (${trailingPunctuation}`;
  }

  const normalized = normalizeMathSource(core);

  if (!normalized) return fragment;

  return (
    `${leadingWhitespace}${leadingPunctuation}` +
    `\\(${normalized}\\)` +
    `${trailingPunctuation}${trailingWhitespace}`
  );
}

function formatAlgebraMathText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const source = String(value)
    .replace(/−/g, "-")
    .replace(/\+\s*-/g, "-");

  if (
    source.includes("\\(") ||
    source.includes("\\[")
  ) {
    return source;
  }

  return source
    .split(/([가-힣]+)/g)
    .map((fragment) =>
      /[가-힣]/.test(fragment)
        ? fragment
        : wrapMathFragment(fragment)
    )
    .join("");
}

function formatAlgebraLesson(lesson) {
  if (!lesson) return lesson;

  return {
    ...lesson,
    clientMotionCaptions: Array.isArray(
      lesson.steps
    )
      ? lesson.steps.map(
          (step) =>
            String(step.description || "")
        )
      : [],
    clientMotionStageLabels: Array.isArray(
      lesson.steps
    )
      ? lesson.steps.map(
          (step) =>
            String(step.title || "")
        )
      : [],
    summary: formatAlgebraMathText(
      lesson.summary
    ),
    keyTakeaway: formatAlgebraMathText(
      lesson.keyTakeaway
    ),
    steps: Array.isArray(lesson.steps)
      ? lesson.steps.map((step) => ({
          ...step,
          title: formatAlgebraMathText(
            step.title
          ),
          description:
            formatAlgebraMathText(
              step.description
            ),
        }))
      : [],
    dashboardPreview: lesson.dashboardPreview
      ? {
          ...lesson.dashboardPreview,
          formula:
            DASHBOARD_FORMULA_OVERRIDES[
              lesson.dashboardPreview
                .formula
            ] ||
            formatAlgebraMathText(
              lesson.dashboardPreview
                .formula
            ),
        }
      : lesson.dashboardPreview,
  };
}

function formatMathTextForCourse(
  courseId,
  value
) {
  return courseId === "algebra"
    ? formatAlgebraMathText(value)
    : String(value ?? "");
}

module.exports = {
  formatAlgebraMathText,
  formatAlgebraLesson,
  formatMathTextForCourse,
};

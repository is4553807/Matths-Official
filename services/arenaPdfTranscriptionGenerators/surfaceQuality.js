"use strict";

const ALGEBRA_VARIABLE = "[a-z](?![A-Za-z0-9])";
const NAMED_FUNCTION = "\\\\(?:sin|cos|tan|log|ln)(?![A-Za-z])";
const UNIT_COEFFICIENT = new RegExp(
  `(?<![0-9A-Za-z_^])1(?=(?:${ALGEBRA_VARIABLE}|${NAMED_FUNCTION}|\\\\sqrt(?![A-Za-z])|[|(]))`,
  "g"
);
const ZERO_TERM_SOURCE =
  "(?<![0-9A-Za-z_^}])0(?:[a-z](?:_\\{[^}]+\\}|_[A-Za-z0-9]+)?(?:\\^\\{[^}]+\\}|\\^[A-Za-z0-9]+)?)";
const DISPLAY_STYLE_OPERATOR_SOURCE =
  "\\\\(?:sum|prod|coprod|lim(?:sup|inf)?|sup|inf|max|min|int|iint|iiint|oint|bigcup|bigcap)(?![A-Za-z])";
const TEX_SCRIPT_SOURCE =
  "(?:_\\{[^{}]+\\}|_[A-Za-z0-9]+)?(?:\\^\\{[^{}]+\\}|\\^[A-Za-z0-9]+)?";
const TEX_GROUP_ATOM_SOURCE =
  "(?:\\((?:[^()]|[A-Za-z](?:')?\\([^()]*\\))*\\)|\\\\\\{[^{}]*\\\\\\}|\\|[^|]*\\|)";
const TEX_FUNCTION_ATOM_SOURCE =
  `(?:[A-Za-z](?:')?${TEX_SCRIPT_SOURCE}\\((?:[^()]|[A-Za-z](?:')?\\([^()]*\\))*\\))`;
const TEX_NAMED_FUNCTION_ATOM_SOURCE =
  `(?:\\\\(?:sin|cos|tan|sec|csc|log|ln)\\s*(?:${TEX_GROUP_ATOM_SOURCE}|\\\\(?:pi|theta)|[A-Za-z]${TEX_SCRIPT_SOURCE}))`;
const TEX_COMMAND_ATOM_SOURCE =
  `(?:\\\\(?:pi|theta|sigma)${TEX_SCRIPT_SOURCE}|\\\\bar\\s*[A-Za-z]${TEX_SCRIPT_SOURCE}|\\\\sqrt(?:\\{[^{}]+\\}|[A-Za-z0-9])${TEX_SCRIPT_SOURCE})`;
const TEX_PLAIN_ATOM_SOURCE =
  `(?:[A-Za-z]+${TEX_SCRIPT_SOURCE}|\\d+${TEX_SCRIPT_SOURCE})`;
const TEX_DIVISION_ATOM_SOURCE =
  `(?:${TEX_GROUP_ATOM_SOURCE}|${TEX_FUNCTION_ATOM_SOURCE}|${TEX_NAMED_FUNCTION_ATOM_SOURCE}|${TEX_COMMAND_ATOM_SOURCE}|${TEX_PLAIN_ATOM_SOURCE})`;

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

function numericFractionTex(numeratorValue, denominatorValue) {
  const numerator = Number(numeratorValue);
  const denominator = Number(denominatorValue);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    return null;
  }
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  if (reducedDenominator === 1) return String(reducedNumerator);
  const sign = reducedNumerator < 0 ? "-" : "";
  return `${sign}\\frac{${Math.abs(reducedNumerator)}}{${reducedDenominator}}`;
}

function normalizeTexDivisions(mathSource) {
  let math = String(mathSource ?? "");
  const division = new RegExp(
    `(${TEX_DIVISION_ATOM_SOURCE})/(${TEX_DIVISION_ATOM_SOURCE})`,
    "g"
  );
  let previous;
  do {
    previous = math;
    math = math.replace(division, "\\frac{$1}{$2}");
  } while (math !== previous);
  return math;
}

function normalizeAssessmentMath(mathSource) {
  let math = String(mathSource ?? "");

  math = math
    .replace(/_(?!\{)(-?\d+)/g, "_{$1}")
    .replace(/\^(?!\{)(-?\d+)/g, "^{$1}");

  math = math.replace(
    /\\frac\{(-?\d+)\}\{(\d+)\}/g,
    (match, numerator, denominator) => numericFractionTex(numerator, denominator) || match
  );
  math = math.replace(
    /(?<![0-9A-Za-z_^}])(-?\d+)\/(\d+)(?![0-9])/g,
    (match, numerator, denominator) => numericFractionTex(numerator, denominator) || match
  );
  math = normalizeTexDivisions(math);

  const signedZeroTerm = new RegExp(`([+\\-])${ZERO_TERM_SOURCE}`, "g");
  const leadingZeroTerm = new RegExp(`([=({,])${ZERO_TERM_SOURCE}(?=[+\\-])`, "g");
  const remainingZeroTerm = new RegExp(ZERO_TERM_SOURCE, "g");
  math = math.replace(signedZeroTerm, "");
  math = math.replace(leadingZeroTerm, "$1");
  math = math.replace(remainingZeroTerm, "0");
  math = math.replace(UNIT_COEFFICIENT, "");
  math = math.replace(/([A-Za-z0-9_)}\]])[+\-]0(?=$|[),}\]])/g, "$1");

  let previous;
  do {
    previous = math;
    math = math
      .replaceAll("++", "+")
      .replaceAll("+-", "-")
      .replaceAll("-+", "-")
      .replaceAll("--", "+");
  } while (math !== previous);
  math = math.replaceAll("=+", "=");
  if (
    new RegExp(DISPLAY_STYLE_OPERATOR_SOURCE).test(math) &&
    !/^\s*\\displaystyle(?![A-Za-z])/.test(math)
  ) {
    math = `\\displaystyle ${math}`;
  }
  math = math.replace(
    /^(\s*\\displaystyle\s+)(?:\\displaystyle\s+)+/,
    "$1"
  );
  return math;
}

function normalizeAssessmentText(value) {
  return String(value ?? "").replace(
    /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (match, inlineMath, displayMath) => {
      if (inlineMath !== undefined) return `\\(${normalizeAssessmentMath(inlineMath)}\\)`;
      return `\\[${normalizeAssessmentMath(displayMath)}\\]`;
    }
  );
}

function normalizeVisualization(visualization) {
  if (!visualization || typeof visualization !== "object") return visualization;
  const normalized = { ...visualization };
  for (const key of ["points", "texts"]) {
    if (!Array.isArray(visualization[key])) continue;
    normalized[key] = visualization[key].map((item) => (
      item?.mathTex
        ? { ...item, mathTex: normalizeAssessmentMath(item.mathTex) }
        : item
    ));
  }
  return normalized;
}

function normalizeRenderedAssessmentProblem(rendered) {
  if (!rendered || typeof rendered !== "object") return rendered;
  return {
    ...rendered,
    prompt: normalizeAssessmentText(rendered.prompt),
    solution: normalizeAssessmentText(rendered.solution),
    visualization: normalizeVisualization(rendered.visualization),
  };
}

function extractMathFragments(value) {
  const fragments = [];
  const text = String(value ?? "");
  for (const match of text.matchAll(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g)) {
    fragments.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return fragments;
}

function unsafeVisibleDecimalTokens(value) {
  return [...String(value || "").matchAll(/-?\d+\.\d+(?:e[+\-]?\d+)?/gi)]
    .map((match) => match[0])
    .filter((token) => {
      const fractionalDigits = (token.split(".")[1] || "").replace(/e.*$/i, "").length;
      return fractionalDigits > 2 || /e[+\-]?\d+$/i.test(token);
    });
}

function assessmentSurfaceIssues(problem) {
  const issues = [];
  const add = (code, field, token) => issues.push({ code, field, token: String(token).slice(0, 120) });
  const fields = [
    ["prompt", String(problem?.prompt || "")],
    ["solution", String(problem?.solution || "")],
  ];

  for (const [field, text] of fields) {
    const textChecks = [
      ["INTERNAL_REFERENCE", /\b(?:parameters?|Math|Number|BigInt)\.[A-Za-z_$][\w$]*/g],
      ["UNEXPANDED_TEMPLATE", /\$\{/g],
      ["NON_FINITE_TOKEN", /\b(?:undefined|NaN|Infinity)\b/g],
      ["RAW_MULTIPLICATION_OPERATOR", /\*/g],
      ["BROKEN_JAVASCRIPT_ESCAPE", /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g],
    ];
    for (const [code, pattern] of textChecks) {
      for (const match of text.matchAll(pattern)) add(code, field, match[0]);
    }
    for (const token of unsafeVisibleDecimalTokens(text)) add("CALCULATOR_STYLE_DECIMAL", field, token);
    const proseOnly = text.replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, "");
    for (const match of proseOnly.matchAll(/(?<!\d)\d+\/\d+(?!\d)/g)) {
      add("NUMERIC_FRACTION_OUTSIDE_MATH", field, match[0]);
    }
    if ((text.match(/\\\(/g) || []).length !== (text.match(/\\\)/g) || []).length) {
      add("UNBALANCED_INLINE_MATH", field, "\\( … \\)");
    }
    if ((text.match(/\\\[/g) || []).length !== (text.match(/\\\]/g) || []).length) {
      add("UNBALANCED_DISPLAY_MATH", field, "\\[ … \\]");
    }

    for (const math of extractMathFragments(text)) {
      const mathChecks = [
        ["UNIT_COEFFICIENT", new RegExp(UNIT_COEFFICIENT.source, "g")],
        ["ZERO_COEFFICIENT_TERM", new RegExp(ZERO_TERM_SOURCE, "g")],
        ["MALFORMED_SIGN_PAIR", /\+\+|--|\+-|-\+/g],
        ["NAKED_NAMED_FUNCTION", /(?<![\\A-Za-z])(?:sin|cos|tan|log|ln|lim)(?![A-Za-z])/g],
        ["LONG_CALCULATOR_INTEGER", /(?<![0-9A-Za-z_^])\d{7,}(?!\d)/g],
        ["UNBRACED_NUMERIC_SCRIPT", /[_^](?!\{)-?\d+/g],
        ["RAW_TEX_DIVISION", /\//g],
      ];
      for (const [code, pattern] of mathChecks) {
        for (const match of math.matchAll(pattern)) add(code, field, match[0]);
      }
      if (
        new RegExp(DISPLAY_STYLE_OPERATOR_SOURCE).test(math) &&
        !/^\s*\\displaystyle(?![A-Za-z])/.test(math)
      ) {
        add("MISSING_DISPLAYSTYLE_OPERATOR", field, math);
      }
      const numericFractions = [
        ...math.matchAll(/(?<![0-9A-Za-z_^}])(\d+)\/(\d+)(?![0-9])/g),
        ...math.matchAll(/\\frac\{(\d+)\}\{(\d+)\}/g),
      ];
      for (const match of numericFractions) {
        const numerator = Number(match[1]);
        const denominator = Number(match[2]);
        if (numerator > 999 || denominator > 999) {
          add("OVERSIZED_NUMERIC_FRACTION", field, match[0]);
        }
        if (denominator !== 0 && gcd(numerator, denominator) > 1) {
          add("UNREDUCED_NUMERIC_FRACTION", field, match[0]);
        }
      }
      let braceDepth = 0;
      let minimumBraceDepth = 0;
      for (const character of math) {
        if (character === "{") braceDepth += 1;
        if (character === "}") braceDepth -= 1;
        minimumBraceDepth = Math.min(minimumBraceDepth, braceDepth);
      }
      if (braceDepth !== 0 || minimumBraceDepth < 0) {
        add("UNBALANCED_TEX_BRACES", field, math);
      }
    }
  }
  return issues;
}

module.exports = {
  assessmentSurfaceIssues,
  extractMathFragments,
  normalizeAssessmentMath,
  normalizeAssessmentText,
  normalizeRenderedAssessmentProblem,
  unsafeVisibleDecimalTokens,
};

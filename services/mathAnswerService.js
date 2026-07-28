function normalizeExpressionSource(value) {
  let source = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\s*\\\((.*)\\\)\s*$/s, "$1")
    .replace(/^\s*\$(.*)\$\s*$/s, "$1")
    .replace(/−/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\\(?:times|cdot)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, "pi")
    .replace(/π/g, "pi")
    .replace(/\s+/g, "");

  /*
   * 학생 답안에 자주 쓰이는 간단한 TeX 분수·근호를 계산 가능한
   * 표현으로 바꿉니다. 중첩이 깊은 식은 평가 답안 형식으로 쓰지
   * 않으므로, 유한 횟수로 안쪽 표현부터 정리합니다.
   */
  for (let index = 0; index < 6; index += 1) {
    const next = source
      .replace(
        /\\frac\{([^{}]+)\}\{([^{}]+)\}/g,
        "(($1)/($2))"
      )
      .replace(
        /\\sqrt\{([^{}]+)\}/g,
        "sqrt($1)"
      )
      .replace(
        /\\sqrt\[3\]\{([^{}]+)\}/g,
        "cbrt($1)"
      );

    if (next === source) break;
    source = next;
  }

  source = source
    .replace(/∛\(([^()]*)\)/g, "cbrt($1)")
    .replace(/√\(([^()]*)\)/g, "sqrt($1)")
    .replace(/∛(-?\d+(?:\.\d+)?)/g, "cbrt($1)")
    .replace(/√(-?\d+(?:\.\d+)?)/g, "sqrt($1)")
    .replace(/\bsqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\bcbrt\{([^{}]+)\}/g, "cbrt($1)")
    .replace(
      /(?<=[0-9.)])x(?=[0-9.(+-])/g,
      "*"
    );

  return source;
}

function tokenizeExpression(source) {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);
    const number = rest.match(
      /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/
    );

    if (number) {
      tokens.push({
        type: "number",
        value: Number(number[0]),
      });
      index += number[0].length;
      continue;
    }

    const name = rest.match(
      /^(sqrt|cbrt|pi)/
    );

    if (name) {
      tokens.push({
        type: "name",
        value: name[1],
      });
      index += name[1].length;
      continue;
    }

    const character = source[index];

    if ("+-*/^()".includes(character)) {
      tokens.push({
        type:
          character === "(" ||
          character === ")"
            ? "paren"
            : "operator",
        value: character,
      });
      index += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

function parseNumericExpression(value) {
  const source =
    normalizeExpressionSource(value);
  const tokens = tokenizeExpression(source);

  if (!tokens?.length) return null;

  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];
  const startsPrimary = (token) =>
    token?.type === "number" ||
    token?.type === "name" ||
    (
      token?.type === "paren" &&
      token.value === "("
    );

  function parsePrimary() {
    const token = consume();

    if (!token) {
      throw new Error("표현이 끝났습니다.");
    }

    if (token.type === "number") {
      return token.value;
    }

    if (
      token.type === "name" &&
      token.value === "pi"
    ) {
      return Math.PI;
    }

    if (
      token.type === "name" &&
      ["sqrt", "cbrt"].includes(
        token.value
      )
    ) {
      const opening = consume();

      if (
        opening?.type !== "paren" ||
        opening.value !== "("
      ) {
        throw new Error("근호 괄호가 필요합니다.");
      }

      const inner = parseExpression();
      const closing = consume();

      if (
        closing?.type !== "paren" ||
        closing.value !== ")"
      ) {
        throw new Error("근호 괄호가 닫히지 않았습니다.");
      }

      if (token.value === "sqrt") {
        if (inner < 0) {
          throw new Error("실수 범위의 근호가 아닙니다.");
        }
        return Math.sqrt(inner);
      }

      return Math.cbrt(inner);
    }

    if (
      token.type === "paren" &&
      token.value === "("
    ) {
      const inner = parseExpression();
      const closing = consume();

      if (
        closing?.type !== "paren" ||
        closing.value !== ")"
      ) {
        throw new Error("괄호가 닫히지 않았습니다.");
      }

      return inner;
    }

    throw new Error("숫자 표현이 아닙니다.");
  }

  function parseUnary() {
    const token = peek();

    if (
      token?.type === "operator" &&
      ["+", "-"].includes(token.value)
    ) {
      consume();
      const value = parseUnary();
      return token.value === "-"
        ? -value
        : value;
    }

    return parsePrimary();
  }

  function parsePower() {
    let left = parseUnary();
    const token = peek();

    if (
      token?.type === "operator" &&
      token.value === "^"
    ) {
      consume();
      left = left ** parsePower();
    }

    return left;
  }

  function parseTerm() {
    let left = parsePower();

    while (true) {
      const token = peek();
      const explicit =
        token?.type === "operator" &&
        ["*", "/"].includes(
          token.value
        );
      const implicit =
        startsPrimary(token);

      if (!explicit && !implicit) break;

      if (explicit) consume();
      const right = parsePower();
      left =
        explicit &&
        token.value === "/"
          ? left / right
          : left * right;
    }

    return left;
  }

  function parseExpression() {
    let left = parseTerm();

    while (true) {
      const token = peek();

      if (
        token?.type !== "operator" ||
        !["+", "-"].includes(
          token.value
        )
      ) {
        break;
      }

      consume();
      const right = parseTerm();
      left =
        token.value === "+"
          ? left + right
          : left - right;
    }

    return left;
  }

  try {
    const result = parseExpression();

    if (
      cursor !== tokens.length ||
      !Number.isFinite(result)
    ) {
      return null;
    }

    return result;
  } catch (error) {
    return null;
  }
}

function normalizeAnswerText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/−/g, "-")
    .replace(/[;，]/g, ",")
    .replace(/\s+/g, "");
}

function answersEquivalent(
  expected,
  submitted
) {
  const expectedText =
    normalizeAnswerText(expected);
  const submittedText =
    normalizeAnswerText(submitted);

  if (
    expectedText.includes(",") ||
    submittedText.includes(",")
  ) {
    const expectedParts =
      expectedText.split(",");
    const submittedParts =
      submittedText.split(",");

    return (
      expectedParts.length ===
        submittedParts.length &&
      expectedParts.every(
        (part, index) =>
          answersEquivalent(
            part,
            submittedParts[index]
          )
      )
    );
  }

  const expectedNumber =
    parseNumericExpression(expectedText);
  const submittedNumber =
    parseNumericExpression(submittedText);

  if (
    expectedNumber !== null &&
    submittedNumber !== null
  ) {
    return (
      Math.abs(
        expectedNumber -
          submittedNumber
      ) <=
      Math.max(
        1e-7,
        Math.abs(expectedNumber) *
          1e-7
      )
    );
  }

  return expectedText === submittedText;
}

module.exports = {
  normalizeExpressionSource,
  parseNumericExpression,
  normalizeAnswerText,
  answersEquivalent,
};

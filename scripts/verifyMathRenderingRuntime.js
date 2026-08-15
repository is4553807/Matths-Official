const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const viewRoot = path.join(root, "views");
const scriptRoot = path.join(root, "public", "js");
const runtimePath = path.join(scriptRoot, "math-renderer.js");

function filesIn(directory, extension) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? filesIn(absolute, extension)
        : entry.name.endsWith(extension)
          ? [absolute]
          : [];
    });
}

async function verifyDelayedStartup() {
  const calls = [];
  const target = {
    nodeType: 1,
    textContent: "",
    dataset: {},
    querySelectorAll() { return []; },
  };
  const browserWindow = {
    MathJax: {},
    addEventListener() {},
    setTimeout,
  };
  const consoleStub = {
    error(...args) {
      calls.push(["error", ...args]);
    },
  };

  vm.runInNewContext(fs.readFileSync(runtimePath, "utf8"), {
    console: consoleStub,
    window: browserWindow,
  });

  const firstRender = browserWindow.MatthsMath.setText(
    target,
    "\\(x^2+1\\)"
  );

  setTimeout(() => {
    browserWindow.MathJax = {
      startup: { promise: Promise.resolve() },
      typesetClear(targets) {
        calls.push(["clear", targets[0].textContent]);
      },
      async typesetPromise(targets) {
        calls.push(["typeset", targets[0].textContent]);
      },
    };
  }, 40);

  await firstRender;
  assert.deepEqual(calls.at(-1), ["typeset", "\\(x^2+1\\)"]);

  await browserWindow.MatthsMath.setText(target, "\\(2x\\)");
  assert.equal(target.textContent, "\\(2x\\)");
  assert.equal(
    calls.filter(([type]) => type === "typeset").length,
    2,
    "동적으로 바뀐 두 수식이 모두 조판되어야 합니다."
  );
  assert.equal(
    calls.filter(([type]) => type === "error").length,
    0,
    "지연 로딩 중 수식 렌더링 오류가 없어야 합니다."
  );
}

async function main() {
  assert.ok(fs.existsSync(runtimePath), "공통 수식 렌더러가 없습니다.");

  const mathLoaderPattern = /(?:\/vendor\/mathjax\/tex-svg\.js|mathjax@4\/tex-svg\.js)/;
  const mathViews = filesIn(viewRoot, ".ejs").filter((filename) =>
    mathLoaderPattern.test(fs.readFileSync(filename, "utf8"))
  );

  assert.ok(mathViews.length > 0, "MathJax를 사용하는 화면을 찾지 못했습니다.");
  for (const filename of mathViews) {
    const source = fs.readFileSync(filename, "utf8");
    const mathLoaderMatch = source.match(mathLoaderPattern);
    const mathJaxIndex = mathLoaderMatch?.index ?? -1;
    const runtimeIndex = source.indexOf('/js/math-renderer.js');

    assert.ok(
      runtimeIndex > mathJaxIndex,
      `${path.relative(root, filename)}에 공통 수식 렌더러가 MathJax 다음 순서로 포함되어야 합니다.`
    );
    assert.doesNotMatch(
      source,
      /enableAssistiveMml/,
      `${path.relative(root, filename)}에 MathJax 4에서 제거된 enableAssistiveMml 옵션이 남아 있습니다.`
    );
  }

  const remoteMathJaxViews = mathViews.filter((filename) =>
    fs.readFileSync(filename, "utf8").includes("mathjax@4/tex-svg.js")
  );
  assert.deepEqual(
    remoteMathJaxViews.map((filename) => path.relative(root, filename)),
    [],
    "수식 화면은 외부 CDN이 아니라 로컬 MathJax 자산을 사용해야 합니다."
  );

  const directRuntimePattern = /typesetPromise|typesetClear|startup\.promise/;
  const directUsers = [
    ...filesIn(scriptRoot, ".js").filter((filename) => filename !== runtimePath),
    ...filesIn(viewRoot, ".ejs"),
  ].filter((filename) =>
    directRuntimePattern.test(fs.readFileSync(filename, "utf8"))
  );

  assert.deepEqual(
    directUsers.map((filename) => path.relative(root, filename)),
    [],
    "화면별 코드가 MathJax를 직접 호출하지 않고 공통 렌더러를 사용해야 합니다."
  );

  await verifyDelayedStartup();
  console.log(
    `Math rendering runtime verified: ${mathViews.length} MathJax views use the delayed-start-safe shared renderer.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

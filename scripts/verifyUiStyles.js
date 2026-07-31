const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const viewRoot = path.join(root, "views");
const cssRoot = path.join(root, "public", "css");
const publicRoot = path.join(root, "public");

function filesIn(directory, extension) {
  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const absolute = path.join(
        directory,
        entry.name
      );
      if (entry.isDirectory()) {
        return filesIn(absolute, extension);
      }
      return entry.name.endsWith(extension)
        ? [absolute]
        : [];
    });
}

const viewFiles = filesIn(viewRoot, ".ejs");
for (const filename of viewFiles) {
  const markup = fs.readFileSync(
    filename,
    "utf8"
  );
  ejs.compile(
    markup,
    { filename }
  );

  if (/<!doctype html>/i.test(markup)) {
    assert.match(
      markup,
      /<link[^>]+rel=["'](?:shortcut )?icon["']/i,
      `favicon이 없는 화면: ${path.relative(
        root,
        filename
      )}`
    );
  }

  for (const match of markup.matchAll(
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](\/css\/[^"']+)["']/gi
  )) {
    const stylesheet = path.join(
      publicRoot,
      match[1].split("?")[0]
    );
    assert.ok(
      fs.existsSync(stylesheet),
      `존재하지 않는 stylesheet: ${match[1]} (${path.relative(
        root,
        filename
      )})`
    );
  }
}

const cssFiles = filesIn(cssRoot, ".css");
const css = cssFiles
  .map((filename) =>
    fs.readFileSync(filename, "utf8")
  )
  .join("\n");

for (const filename of cssFiles) {
  const source = fs.readFileSync(
    filename,
    "utf8"
  );
  for (const match of source.matchAll(
    /url\(\s*["']?(\/[^"')?#]+)[^"')]*["']?\s*\)/gi
  )) {
    const asset = path.join(
      publicRoot,
      match[1]
    );
    assert.ok(
      fs.existsSync(asset),
      `CSS가 참조하는 파일이 없음: ${match[1]} (${path.relative(
        root,
        filename
      )})`
    );
  }
}

const registerMarkup = fs.readFileSync(
  path.join(viewRoot, "register.ejs"),
  "utf8"
);
const realNameIndex =
  registerMarkup.indexOf('id="realName"');
const birthDateIndex =
  registerMarkup.indexOf('id="birthDate"');
const nicknameIndex =
  registerMarkup.indexOf('id="name"');
assert.ok(
  realNameIndex >= 0 &&
    birthDateIndex > realNameIndex &&
    nicknameIndex > birthDateIndex,
  "회원가입 생년월일은 실명 다음, 닉네임 전에 있어야 합니다."
);

const auditedViews = [
  "register.ejs",
  "intro.ejs",
  "goat-arena.ejs",
  "goat-arena-division.ejs",
  "goat-arena-profile.ejs",
  "goat-arena-rankings.ejs",
  "partials/goat-arena-navigation.ejs",
  "partials/rank-crest.ejs",
  "partials/tier-ranking-pools.ejs",
];
const structuralClasses = new Set([
  "active",
  "is-me",
]);
const missing = new Set();

for (const relative of auditedViews) {
  const markup = fs.readFileSync(
    path.join(viewRoot, relative),
    "utf8"
  );
  const attributes = markup.matchAll(
    /class\s*=\s*"([^"]+)"/g
  );
  for (const attribute of attributes) {
    const staticValue = attribute[1].replace(
      /<%[\s\S]*?%>/g,
      " "
    );
    for (const className of staticValue.split(/\s+/)) {
      if (
        !/^[a-z][a-z0-9_-]*$/i.test(
          className
        ) ||
        className.endsWith("--") ||
        structuralClasses.has(className)
      ) {
        continue;
      }
      const selector = new RegExp(
        `\\.${className.replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          "\\$&"
        )}(?![a-zA-Z0-9_-])`
      );
      if (!selector.test(css)) {
        missing.add(className);
      }
    }
  }
}

assert.deepEqual(
  [...missing].sort(),
  [],
  `스타일 정의가 없는 정적 class: ${[
    ...missing,
  ].sort().join(", ")}`
);

console.log(
  `UI verification passed: ${viewFiles.length} EJS templates compiled and audited styles are present`
);

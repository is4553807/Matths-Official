const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const ejs = require("ejs");

const app = express();
const root = path.resolve(__dirname, "..");
const viewRoot = path.join(root, "views");
const port = Number(process.env.MATTHS_CONTRAST_PORT) || 8012;

app.use(express.static(path.join(root, "public")));

function universalValue({ filled = false } = {}) {
  let value;
  const callable = function previewValue() {
    return value;
  };
  value = new Proxy(callable, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) {
        return (hint) =>
          hint === "number"
            ? 0
            : "2026-08-19T00:00:00.000Z";
      }
      if (key === Symbol.iterator) {
        return function* previewIterator() {
          if (filled) yield value;
        };
      }
      if (key === "length") return filled ? 1 : 0;
      if (key === "toJSON") return () => null;
      if (key === "toString") return () => "";
      if (key === "valueOf") return () => 0;
      if (key === "slice") return () => value;
      if (["map", "filter", "flatMap", "sort"].includes(key)) {
        return () => (filled ? [value] : []);
      }
      if (key === "forEach") {
        return (callback) => {
          if (filled) callback(value, 0, [value]);
        };
      }
      if (key === "find") return () => value;
      if (key === "findIndex") return () => (filled ? 0 : -1);
      if (key === "some") return () => filled;
      if (key === "every") return () => true;
      if (key === "includes") return () => false;
      if (key === "reduce") return (_callback, initial) => initial;
      if (key === "join") return () => "";
      return value;
    },
    apply() {
      return value;
    },
    construct() {
      return value;
    },
  });
  return value;
}

const viewNames = fs
  .readdirSync(viewRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ejs"))
  .map((entry) => entry.name.replace(/\.ejs$/, ""))
  .sort();

function baseLocals(previewValue) {
  return {
    Math,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    Infinity,
    NaN,
    audit: {
      health: "HEALTHY",
      generatedAt: new Date(),
      pagination: {
        page: 1,
        totalPages: 1,
        total: 0,
        perPage: 20,
      },
      filters: {
        adminUserId: "",
        query: "",
      },
      admins: [],
      rows: [],
      summary: {
        criticalCount: 0,
        warningCount: 0,
        pendingOutboxCount: 0,
        checkedCycles: 0,
        checkedMatches: 0,
        checkedInvitations: 0,
        checkedLocks: 0,
        checkedShopPurchases: 0,
        checkedShopEffects: 0,
        displayedIssueCount: 0,
        issueCount: 0,
        byCategory: {},
      },
      scope: { truncated: false },
      issues: [],
    },
    arenaContract: {
      learningCycleDays: 29,
      minimumAttackParticipationDays: 15,
      maximumPaybackRatePercent: 100,
    },
    pendingRevengeRight: null,
    pendingRevengeRequestId: null,
    previewValue,
  };
}

async function renderView(viewName, { filled = false } = {}) {
  const previewValue = universalValue({ filled });
  const locals = baseLocals(previewValue);
  const filename = path.join(viewRoot, `${viewName}.ejs`);

  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      return await ejs.renderFile(filename, locals);
    } catch (error) {
      const missing = String(error?.message || "").match(
        /([A-Za-z_$][\w$]*) is not defined/
      );
      if (!missing) throw error;
      locals[missing[1]] = previewValue;
    }
  }

  throw new Error(`미리보기 변수를 준비하지 못했습니다: ${viewName}`);
}

app.get("/preview/contrast/views", (_req, res) => {
  res.json({ views: viewNames });
});

app.get("/preview/contrast/view/:viewName", async (req, res, next) => {
  const viewName = String(req.params.viewName || "");
  if (!viewNames.includes(viewName)) {
    return res.status(404).send("존재하지 않는 view입니다.");
  }

  try {
    const filled = req.query.filled === "1";
    return res.type("html").send(await renderView(viewName, { filled }));
  } catch (error) {
    return next(error);
  }
});

const server = require.main === module
  ? app.listen(port, "127.0.0.1", () => {
      console.log(`Matths contrast preview: http://127.0.0.1:${port}`);
    })
  : null;

module.exports = {
  app,
  server,
  viewNames,
  renderView,
};

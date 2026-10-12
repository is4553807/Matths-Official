"use strict";

const { getAdminProblemBankCatalog } = require("../services/problemBankCatalogService");
const {
  getAdminProblemTypeCatalog,
  reviseProblemTypeVersion,
  syncProblemTypeRegistry,
} = require("../services/problemTypeCatalogService");

const SCHEMA_VERSION = "ADMIN_PROBLEM_BANK_NATIVE_V2";

function requireAdmin(req) {
  if (String(req.apiUser?.role || "").toLowerCase() !== "admin") {
    const error = new Error("관리자만 문제 유형과 문제 데이터를 관리할 수 있습니다.");
    error.status = 403;
    throw error;
  }
  return req.apiUser;
}

function id(value) {
  return String(value?._id || value?.id || value || "");
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

function validation(value = {}) {
  return {
    passed: value.passed === true,
    sampleCount: Number(value.sampleCount || 0),
    validationMode: String(value.validationMode || ""),
    calculatorFree: value.calculatorFree === true,
    answerVerified: value.answerVerified === true,
    failures: (value.failures || []).map((item) => String(item?.message || item)),
  };
}

function type(value = {}) {
  return {
    id: id(value),
    category: String(value.category || ""),
    engineKey: String(value.engineKey || ""),
    displayName: String(value.displayName || value.label || ""),
    courseId: String(value.courseId || ""),
    unitId: String(value.unitId || ""),
    conceptId: String(value.conceptId || ""),
    enabled: value.enabled !== false,
    selectionWeight: Number(value.selectionWeight || 1),
    revision: Number(value.revision || 1),
    status: String(value.status || ""),
    operatorNote: String(value.operatorNote || ""),
    sourceFile: String(value.sourceFile || ""),
    sourceHash: String(value.sourceHash || ""),
    codeChanged: value.codeChanged === true,
    validation: validation(value.validationReport),
  };
}

async function dashboardData(query = {}) {
  const [catalog, types] = await Promise.all([
    Promise.resolve(getAdminProblemBankCatalog()),
    getAdminProblemTypeCatalog({
      category: query.category || "CONCEPT_PRACTICE",
      query: query.query || "",
      inspectVersionId: query.inspectVersionId || "",
    }),
  ]);
  return {
    arenaRuntime: catalog.arenaRuntime,
    arenaComponents: (catalog.items || [])
      .filter((item) => /GOAT Arena 2\.x/.test(item.name))
      .map((item) => ({
        name: String(item.name || ""),
        file: String(item.file || ""),
        purpose: String(item.purpose || ""),
        status: String(item.status || ""),
      })),
    types: {
      categories: (types.categories || []).map((item) => ({
        key: String(item.key || ""),
        label: String(item.label || ""),
        description: String(item.description || ""),
        count: Number(item.count || 0),
      })),
      selectedCategory: String(types.selectedCategory || ""),
      entries: (types.entries || []).map(type),
      inspected: types.inspected ? type(types.inspected) : null,
      history: (types.history || []).map(type),
    },
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    requireAdmin(req);
    noStore(res);
    return res.json({
      schemaVersion: SCHEMA_VERSION,
      dashboard: await dashboardData(req.query || {}),
    });
  } catch (error) {
    return next(error);
  }
};

exports.syncTypes = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    const result = await syncProblemTypeRegistry({
      adminUserId: admin._id || admin.id,
      activateSourceChanges: true,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true, result });
  } catch (error) {
    return next(error);
  }
};

exports.reviseType = async (req, res, next) => {
  try {
    const admin = requireAdmin(req);
    await reviseProblemTypeVersion({
      adminUserId: admin._id || admin.id,
      versionId: req.params.versionId,
      input: req.body || {},
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ok: true });
  } catch (error) {
    return next(error);
  }
};

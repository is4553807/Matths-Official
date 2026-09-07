"use strict";

const { Academy } = require("../models/academyModel");
const { assertTeacherAccount, getTeacherAcademyContext, getAcademyClassDetail } = require("../services/academyService");
const { assertSuperAdmin } = require("../services/adminAcademyService");
const { getAcademyWeeklyMockInsights, getWeeklyMockInsights } = require("../services/weeklyMockInsightService");

const SCHEMA_VERSION = "WEEKLY_MOCK_INSIGHTS_NATIVE_V1";
function failure(status, message) { const error = new Error(message); error.status = status; return error; }
function id(value) { return String(value?._id || value || ""); }
function userId(req) {
  if (!req.apiUser?._id) throw failure(401, "로그인 후 분석을 확인해 주세요.");
  return req.apiUser._id;
}
function requestedId(value) {
  if (value === undefined || value === "") return null;
  // Query arrays/objects may not select an unintended wider scope.
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw failure(400, "분석 범위 ID를 확인해 주세요.");
  return value;
}
function response(res, scope, data) {
  res.set("Cache-Control", "private, no-store");
  return res.json({ schemaVersion: SCHEMA_VERSION, scope, overall: data.overall, classes: data.classes || [] });
}

exports.teacher = async (req, res, next) => {
  try {
    const actor = userId(req);
    await assertTeacherAccount(actor);
    const classId = requestedId(req.query.classId);
    const context = await getTeacherAcademyContext(actor);
    let data, scope;
    if (classId) {
      const detail = await getAcademyClassDetail({ teacherUserId: actor, classId });
      const studentUserIds = detail.students.map((row) => row.studentUserId._id);
      data = { overall: await getWeeklyMockInsights({ studentUserIds, scopeLabel: detail.academyClass.name }), classes: [] };
      scope = { kind: "class", id: classId, label: detail.academyClass.name };
    } else {
      // The canonical web academy dashboard allows active academy staff to see
      // its aggregate totals/class comparison; no student identities are returned.
      data = await getAcademyWeeklyMockInsights({ academyId: context.academyId });
      scope = { kind: "academy", id: id(context.academyId), label: context.academy.name };
    }
    // Aggregation can await several DB queries. Revocation or switching academy
    // during that interval must not disclose the previously authorized result.
    await assertTeacherAccount(actor);
    const current = await getTeacherAcademyContext(actor);
    if (id(current.academyId) !== id(context.academyId)) throw failure(403, "학원 소속이 변경되었습니다. 다시 조회해 주세요.");
    if (classId) await getAcademyClassDetail({ teacherUserId: actor, classId });
    return response(res, scope, data);
  } catch (error) { return next(error); }
};

exports.admin = async (req, res, next) => {
  try {
    const actor = userId(req);
    await assertSuperAdmin(actor);
    const academyId = requestedId(req.params.academyId);
    let data, scope;
    if (academyId) {
      const academy = await Academy.findById(academyId).select("name").lean();
      if (!academy) throw failure(404, "학원을 찾을 수 없습니다.");
      data = await getAcademyWeeklyMockInsights({ academyId });
      scope = { kind: "academy", id: academyId, label: academy.name };
    } else {
      data = { overall: await getWeeklyMockInsights({ scopeLabel: "전체 유저" }), classes: [] };
      scope = { kind: "global", id: "global", label: "전체 유저" };
    }
    await assertSuperAdmin(actor);
    return response(res, scope, data);
  } catch (error) { return next(error); }
};

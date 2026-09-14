"use strict";

const mongoose = require("mongoose");
const auth = require("./authMiddleware");
const { Academy, AcademyClass, AcademyStudentMembership } = require("../models/academyModel");
const { runWithAdminPageContext } = require("../services/adminPageContextService");

function previewWriteError() {
  const error = new Error("관리자 미리보기는 읽기 전용입니다. 변경 작업은 관리자 페이지에서 진행해주세요.");
  error.status = 403;
  error.code = "ADMIN_PREVIEW_READ_ONLY";
  return error;
}

function installAdminPreview(res, selectorPath) {
  res.locals.isAdminPagePreview = true;
  res.set("Cache-Control", "private, no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  const send = res.send.bind(res);
  const assetVersion = encodeURIComponent(res.locals.assetVersion || "admin-page-access-20260914");
  res.send = (body) => {
    if (typeof body === "string" && /^\s*(?:<!doctype html>|<html)/i.test(body) && /<body(?:\s|>)/i.test(body)) {
      const banner = `<link rel="stylesheet" href="/css/admin-page-preview.css?v=${assetVersion}"><aside class="admin-page-preview-bar" aria-label="관리자 미리보기"><span>관리자 미리보기 · 읽기 전용</span><a href="/admin">관리자 홈</a><a href="${selectorPath}">대상 변경</a></aside><script src="/js/admin-page-preview.js?v=${assetVersion}" defer></script>`;
      body = body.replace(/<body[^>]*>/i, (opening) => opening + banner);
    }
    return send(body);
  };
}

function renderAdminPageSelector(res, { surface, choices, targetPath }) {
  res.set("Cache-Control", "private, no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  return res.render("admin-page-selector", { surface, choices, targetPath });
}

function adminAcademyPreview(req, res, next) {
  const pathname = String(req.originalUrl || req.path).split(/[?#]/, 1)[0];
  if (!/^\/academy(?:\/|$)/.test(pathname) || !req.session?.user) return next();
  if (/^\/academy\/(?:login|register|logout|join|staff-invite)(?:\/|$)/.test(pathname)) return next();
  // Refresh stored roles before using an admin session hint.
  return auth.isLoggedIn(req, res, async (error) => {
    if (error) return next(error);
    if (req.authenticatedUser?.role !== "admin") return next();
    try {
      if (!["GET", "HEAD"].includes(req.method)) return next(previewWriteError());
      const saved = req.session.adminPagePreview || {};
      if (req.query.clearAdminPreview === "1") delete saved.academyId;
      let academyId = req.query.academyId || saved.academyId;
      const classMatch = pathname.match(/^\/academy\/classes\/([^/]+)/);
      const studentMatch = pathname.match(/^\/academy\/students\/([^/]+)/);
      if (classMatch) {
        if (!mongoose.isValidObjectId(classMatch[1])) return next(Object.assign(new Error("반을 찾을 수 없습니다."), { status: 404 }));
        const academyClass = await AcademyClass.findById(classMatch[1]).select("academyId").lean();
        if (!academyClass) return next(Object.assign(new Error("반을 찾을 수 없습니다."), { status: 404 }));
        academyId = academyClass.academyId;
      } else if (studentMatch) {
        if (!mongoose.isValidObjectId(studentMatch[1])) return next(Object.assign(new Error("학생 소속을 찾을 수 없습니다."), { status: 404 }));
        const membership = await AcademyStudentMembership.findById(studentMatch[1]).select("academyId").lean();
        if (!membership) return next(Object.assign(new Error("학생 소속을 찾을 수 없습니다."), { status: 404 }));
        academyId = membership.academyId;
      }
      if (!academyId || pathname === "/academy/setup") {
        req.session.adminPagePreview = saved;
        const academies = await Academy.find({}).select("name status").sort({ name: 1, _id: 1 }).lean();
        return renderAdminPageSelector(res, { surface: "academy", targetPath: "/academy", choices: academies.map(academy => ({ id: String(academy._id), label: academy.name, detail: academy.status })) });
      }
      if (!mongoose.isValidObjectId(academyId)) return next(Object.assign(new Error("학원을 다시 선택해주세요."), { status: 400 }));
      saved.academyId = String(academyId);
      req.session.adminPagePreview = saved;
      installAdminPreview(res, "/academy?clearAdminPreview=1");
      return runWithAdminPageContext({ adminUserId: req.authenticatedUser._id, academyId }, next);
    } catch (failure) { return next(failure); }
  });
}

module.exports = { adminAcademyPreview, installAdminPreview, previewWriteError, renderAdminPageSelector };

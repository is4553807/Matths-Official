"use strict";

const { getAdminActiveArenaMatchesData } = require("../services/adminActiveArenaMatchesService");
const { getAdminArenaMatchHistoryData } = require("../services/adminArenaMatchHistoryService");
const { getAdminArenaEvidenceData, getAdminEvidenceFile } = require("../services/arenaMatchEvidenceService");
const {
  getAdminArenaIntegrityData,
  requestArenaSupplementalEvidence,
  reviewArenaIntegrityCase,
} = require("../services/arenaIntegrityRiskService");
const {
  reviewHeldArenaV2Match,
} = require("../services/arenaV2IntegrityReviewAdapter");
const { getAdminArenaV2Audit } = require("../services/adminArenaV2Service");

const SCHEMA_VERSION = "ADMIN_ARENA_NATIVE_V2";
function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
function requireAdmin(req) { if (String(req.apiUser?.role || "").toLowerCase() !== "admin") throw statusError(403, "관리자만 Arena 운영 화면을 사용할 수 있습니다."); return req.apiUser; }
function id(value) { return String(value?._id || value?.id || value || ""); }
function noStore(res) { res.set("Cache-Control", "private, no-store"); }
function user(value) { return value ? { id: id(value), name: String(value.realName || value.name || value.nickname || value.username || ""), email: String(value.email || ""), accountStatus: String(value.accountStatus || ""), warningCount: Number(value.warningCount || 0) } : null; }
function attempt(value) {
  if (!value) return null;
  const evidence = value.evidence ? {
    id: id(value.evidence), status: String(value.evidence.status || ""), anomalyFlags: value.evidence.anomalyFlags || [],
    files: (value.evidence.files || []).map((file) => ({ storedName: String(file.storedName || ""), originalName: String(file.originalName || ""), mimeType: String(file.mimeType || "application/octet-stream") })),
    supplementalStatus: String(value.evidence.supplementalRequest?.status || "NONE"), supplementalDeadlineAt: value.evidence.supplementalRequest?.deadlineAt || null,
    supplementalFiles: (value.evidence.supplementalRequest?.files || []).map((file) => ({ storedName: String(file.storedName || ""), originalName: String(file.originalName || ""), mimeType: String(file.mimeType || "application/octet-stream") })),
  } : null;
  return {
    id: id(value), role: String(value.role || ""), status: String(value.status || ""), score: value.score == null ? null : Number(value.score), correctCount: value.correctCount == null ? null : Number(value.correctCount),
    currentQuestion: Number(value.currentQuestion || value.currentQuestionIndex || 0), answeredCount: Number(value.answeredCount || 0), isLive: value.isLive === true, statusLabel: String(value.statusLabel || value.status || ""), focusState: String(value.focusState || ""),
    activeSolveTimeMs: value.activeSolveTimeMs == null ? null : Number(value.activeSolveTimeMs), lastHeartbeatAt: value.lastHeartbeatAt || null, deadlineAt: value.deadlineAt || null, submittedAt: value.submittedAt || null,
    user: user(value.user), evidence,
    questions: (value.questions || []).map((question) => ({ number: Number(question.number), typeId: String(question.typeId || ""), prompt: String(question.prompt || ""), submittedAnswer: String(question.submittedAnswer || ""), correctAnswer: String(question.correctAnswer || ""), solution: String(question.solution || ""), correct: question.correct === true, responseTimeMs: question.responseTimeMs == null ? null : Number(question.responseTimeMs) })),
  };
}
function participant(value) { return value ? { id: id(value), name: String(value.nickname || value.realName || value.name || value.email || ""), email: String(value.email || ""), result: String(value.result || ""), score: value.score == null ? null : Number(value.score), correctCount: value.correctCount == null ? null : Number(value.correctCount) } : null; }
function normalizeLive(value) { return { generatedAt: value.generatedAt, refreshIntervalSeconds: Number(value.refreshIntervalSeconds || 15), truncated: value.truncated === true, stats: { total: Number(value.stats?.total || 0), live: Number(value.stats?.live || 0), waiting: Number(value.stats?.waiting || 0), stale: Number(value.stats?.stale || 0), evidence: Number(value.stats?.evidence || 0), held: Number(value.stats?.held || 0), settlement: Number(value.stats?.settlement || 0) }, matches: (value.matches || []).map((match) => ({ id: id(match), mode: String(match.mode || ""), asynchronous: match.asynchronous === true, status: String(match.status || ""), tierPairLabel: String(match.tierPairLabel || ""), stageKey: String(match.stage?.key || ""), stageLabel: String(match.stage?.label || ""), deadlineAt: match.deadlineAt || null, deadlineOverdue: match.deadlineOverdue === true, requestedAt: match.requestedAt || null, startedAt: match.startedAt || null, currentPlayer: participant(match.currentPlayer), opponent: participant(match.opponent), opponentKind: String(match.opponentKind || ""), attempts: (match.attempts || []).map(attempt).filter(Boolean) })) }; }
function normalizeHistory(value) { return { filters: value.filters, total: Number(value.total || 0), page: Number(value.page || 1), pageSize: Number(value.pageSize || 30), totalPages: Number(value.totalPages || 1), records: (value.records || []).map((match) => ({ id: id(match), matchKey: String(match.matchKey || ""), mode: String(match.gameMode || ""), asynchronous: match.asynchronous === true, tierPairLabel: String(match.tierPairLabel || ""), status: String(match.status || ""), integrityStatus: String(match.integrityStatus || ""), winnerRole: String(match.winnerRole || ""), challenger: participant(match.challenger), defender: participant(match.defender), ratingChange: match.ratingChange || null, requestedAt: match.requestedAt || null, startedAt: match.startedAt || null, completedAt: match.completedAt || null })) }; }
function normalizeIntegrity(value) { return { openCount: Number(value.openCount || 0), highCount: Number(value.highCount || 0), heldCount: Number(value.heldCount || 0), completedCount: Number(value.completedCount || 0), heldMatches: (value.heldMatches || []).map((match) => ({ id: id(match), mode: String(match.gameMode || ""), asynchronous: match.asynchronous === true, status: String(match.status || ""), integrityStatus: String(match.integrityStatus || ""), tierPairLabel: String(match.tierPairLabel || ""), reviewDeadlineAt: match.integrityReviewDeadlineAt || null, currentPlayer: user(match.challengerUser), historicalOpponent: match.asynchronous ? user(match.defenderUser) : null, opponent: user(match.defenderUser), attempts: (match.attempts || []).map(attempt) })), cases: (value.cases || []).map((entry) => ({ id: id(entry), user: user(entry.user), riskScore: Number(entry.riskScore || 0), riskLevel: String(entry.riskLevel || ""), status: String(entry.status || ""), reasons: (entry.reasons || []).map((reason) => ({ label: String(reason.label || ""), description: String(reason.description || ""), points: Number(reason.points || 0) })), linkedUsers: (entry.linkedUsers || []).map(user).filter(Boolean), relatedMatchCount: (entry.relatedMatchIds || []).length, createdAt: entry.createdAt || null })), completedReviews: (value.completedReviews || []).map((entry) => ({ id: id(entry), type: String(entry.type || ""), decision: String(entry.decision || ""), action: String(entry.action || ""), note: String(entry.note || ""), reviewedAt: entry.reviewedAt || null, user: user(entry.user), reviewer: user(entry.reviewer), matchId: String(entry.matchId || ""), caseId: String(entry.caseId || "") })) }; }
function normalizeEvidence(entries) { return (entries || []).map((entry) => ({ id: id(entry), status: String(entry.status || ""), submittedAt: entry.submittedAt || null, user: user(entry.user), matchId: id(entry.matchId), attemptRole: String(entry.attempt?.role || ""), files: (entry.files || []).map((file) => ({ storedName: String(file.storedName || ""), originalName: String(file.originalName || ""), mimeType: String(file.mimeType || "application/octet-stream") })) })); }
function normalizeAudit(value) { return { generatedAt: value.generatedAt, health: String(value.health || ""), summary: { criticalCount: Number(value.summary?.criticalCount || 0), warningCount: Number(value.summary?.warningCount || 0), activeMatches: Number(value.summary?.activeMatches || 0), availableNormalRecords: Number(value.summary?.availableNormalRecords || 0), availableCompetitiveRecords: Number(value.summary?.availableCompetitiveRecords || 0), ratingSettlements: Number(value.summary?.ratingSettlements || 0), placedProfiles: Number(value.summary?.placedProfiles || 0) }, issues: (value.issues || []).map((issue) => ({ key: String(issue.key || ""), severity: String(issue.severity || ""), title: String(issue.title || ""), detail: String(issue.detail || ""), count: Number(issue.count || 0) })) }; }

async function dashboard(query = {}) {
  const [live, history, integrity, evidence, audit] = await Promise.all([
    getAdminActiveArenaMatchesData(),
    getAdminArenaMatchHistoryData({ query: query.query, dateFrom: query.dateFrom, dateTo: query.dateTo, gameMode: query.gameMode, status: query.status, integrityStatus: query.integrityStatus, page: query.page }),
    getAdminArenaIntegrityData(), getAdminArenaEvidenceData(), getAdminArenaV2Audit(),
  ]);
  return { live: normalizeLive(live), history: normalizeHistory(history), integrity: normalizeIntegrity(integrity), evidence: normalizeEvidence(evidence), audit: normalizeAudit(audit) };
}
async function ok(res) { noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, ok: true }); }

exports.dashboard = async (req, res, next) => { try { requireAdmin(req); noStore(res); return res.json({ schemaVersion: SCHEMA_VERSION, dashboard: await dashboard(req.query || {}) }); } catch (error) { return next(error); } };
exports.reviewMatch = async (req, res, next) => { try { const admin = requireAdmin(req); await reviewHeldArenaV2Match({ matchId: req.params.matchId, adminUserId: admin._id || admin.id, decision: String(req.body?.decision || "").toUpperCase(), note: req.body?.note }); return ok(res); } catch (error) { return next(error); } };
exports.requestEvidence = async (req, res, next) => { try { const admin = requireAdmin(req); await requestArenaSupplementalEvidence({ matchId: req.params.matchId, role: req.params.role, adminUserId: admin._id || admin.id, requestMessage: req.body?.requestMessage }); return ok(res); } catch (error) { return next(error); } };
exports.reviewCase = async (req, res, next) => { try { const admin = requireAdmin(req); await reviewArenaIntegrityCase({ caseId: req.params.caseId, adminUserId: admin._id || admin.id, decision: String(req.body?.decision || "").toUpperCase(), note: req.body?.note }); return ok(res); } catch (error) { return next(error); } };
exports.evidenceFile = async (req, res, next) => { try { requireAdmin(req); const file = await getAdminEvidenceFile({ evidenceId: req.params.evidenceId, storedName: req.params.storedName }); noStore(res); res.set("X-Content-Type-Options", "nosniff"); res.type(file.mimeType); if (file.cloudUrl) return res.redirect(302, file.cloudUrl); return res.sendFile(file.absolutePath); } catch (error) { return next(error); } };

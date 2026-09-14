"use strict";

const { createHash, randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const { Academy, AcademyAccount, AcademyStaff, AcademyStaffInvite } = require("../models/academyModel");
const { assertTeacherAccount, getTeacherAcademyContext } = require("./academyService");
const { statusError, inviteTokenFrom } = require("./portalRegistrationValidation");
const hash = value => createHash("sha256").update(value).digest("hex");

async function getAcademyStaffInvite(value) {
  const token = inviteTokenFrom(value, "/academy/staff-invite/");
  const invite = await AcademyStaffInvite.findOne({ tokenHash: hash(token) }).lean();
  if (!invite) throw statusError(404, "교사 초대 링크를 찾을 수 없습니다.");
  if (invite.status !== "ACTIVE" || new Date(invite.expiresAt).getTime() <= Date.now()) throw statusError(410, "사용했거나 만료·취소된 교사 초대입니다. 원장에게 새 초대를 요청해주세요.");
  const academy = await Academy.findById(invite.academyId).lean();
  if (!academy || academy.status !== "ACTIVE" || !academy.contractEndsAt || new Date(academy.contractEndsAt).getTime() <= Date.now() || (academy.contractStartsAt && new Date(academy.contractStartsAt).getTime() > Date.now())) throw statusError(410, "현재 참여할 수 없는 학원입니다. 원장에게 이용 상태를 확인해주세요.");
  const context = await getTeacherAcademyContext(invite.createdByUserId, { allowMissing: true });
  if (!context || context.staff.isAdminPreview || context.staff.role !== "OWNER" || String(context.academyId) !== String(academy._id)) throw statusError(410, "교사 초대 권한이 취소되었습니다. 원장에게 새 초대를 요청해주세요.");
  await assertTeacherAccount(invite.createdByUserId);
  const ownerAccount = await AcademyAccount.findOne({ teacherUserId: invite.createdByUserId }).select("isActive").lean();
  if (ownerAccount?.isActive === false) throw statusError(410, "초대를 발급한 학원 계정이 중지되었습니다. 원장에게 새 초대를 요청해주세요.");
  return { invite, academy, token };
}

async function createAcademyStaffInvite({ teacherUserId, email }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (context.staff.role !== "OWNER" || context.staff.isAdminPreview) throw statusError(403, "학원 원장만 교사 초대를 만들 수 있습니다.");
  await assertTeacherAccount(teacherUserId);
  const ownerAccount = await AcademyAccount.findOne({ teacherUserId }).select("isActive").lean();
  if (ownerAccount?.isActive === false) throw statusError(403, "이용이 중지된 학원 계정입니다.");
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw statusError(400, "초대받을 선생님의 이메일을 확인해주세요.");
  if (!context.academy.contractEndsAt || new Date(context.academy.contractEndsAt).getTime() <= Date.now()) throw statusError(403, "학원 계약 기간을 확인해주세요.");
  await AcademyStaffInvite.updateMany({ academyId: context.academyId, email: cleanEmail, status: "ACTIVE" }, { $set: { status: "REVOKED" } });
  const token = randomBytes(32).toString("base64url");
  const invite = await AcademyStaffInvite.create({
    academyId: context.academyId, email: cleanEmail, tokenHash: hash(token),
    expiresAt: new Date(Math.min(Date.now() + 72 * 3600000, new Date(context.academy.contractEndsAt).getTime())),
    createdByUserId: teacherUserId,
  });
  return { invite, token };
}

async function acceptAcademyStaffInvite({ value, teacherUserId, email }) {
  const { invite, academy, token } = await getAcademyStaffInvite(value);
  const teacher = await assertTeacherAccount(teacherUserId);
  const account = await AcademyAccount.findOne({ teacherUserId }).select("isActive").lean();
  if (account?.isActive === false) throw statusError(403, "이용이 중지된 학원 계정입니다.");
  if (String(teacher.email || "").toLowerCase() !== invite.email || String(email || "").trim().toLowerCase() !== invite.email) throw statusError(403, "초대받은 이메일의 학원 계정으로만 참여할 수 있습니다.");
  if (await AcademyStaff.exists({ userId: teacherUserId, status: { $in: ["PENDING", "ACTIVE"] } })) throw statusError(409, "이미 소속 학원이 있거나 참여 승인을 기다리는 계정입니다.");
  const acceptedAt = new Date();
  const claimed = await AcademyStaffInvite.findOneAndUpdate({
    _id: invite._id, tokenHash: hash(token), status: "ACTIVE", expiresAt: { $gt: acceptedAt },
  }, { $set: { status: "ACCEPTED", acceptedByUserId: teacherUserId, acceptedAt } }, { returnDocument: "after" }).lean();
  if (!claimed) throw statusError(409, "이미 처리된 교사 초대입니다.");
  try {
    // Invitations still require the academy owner's final approval.
    const staff = await AcademyStaff.findOneAndUpdate({ academyId: academy._id, userId: teacherUserId }, {
      $set: { role: "TEACHER", status: "PENDING", currentStaffKey: String(teacherUserId), requestedAt: acceptedAt, joinedAt: null, reviewedAt: null, reviewedByUserId: null, rejectedAt: null, revokedAt: null },
      $setOnInsert: { academyId: academy._id, userId: teacherUserId },
    }, { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }).lean();
    return { staff, academy };
  } catch (error) {
    await AcademyStaffInvite.updateOne({ _id: claimed._id, status: "ACCEPTED", acceptedByUserId: teacherUserId, acceptedAt }, { $set: { status: "ACTIVE", acceptedAt: null, acceptedByUserId: null } });
    if (Number(error.code) === 11000) throw statusError(409, "이미 다른 학원에 연결된 계정입니다.");
    throw error;
  }
}

async function revokeAcademyStaffInvite({ teacherUserId, inviteId }) {
  const context = await getTeacherAcademyContext(teacherUserId);
  if (context.staff.role !== "OWNER" || context.staff.isAdminPreview) throw statusError(403, "학원 원장만 교사 초대를 취소할 수 있습니다.");
  if (!mongoose.isValidObjectId(inviteId)) throw statusError(404, "교사 초대를 찾을 수 없습니다.");
  const invite = await AcademyStaffInvite.findOneAndUpdate({ _id: inviteId, academyId: context.academyId, status: "ACTIVE" }, { $set: { status: "REVOKED" } }, { returnDocument: "after" }).lean();
  if (!invite) throw statusError(404, "취소할 교사 초대를 찾을 수 없습니다.");
  return invite;
}

module.exports = { getAcademyStaffInvite, createAcademyStaffInvite, acceptAcademyStaffInvite, revokeAcademyStaffInvite };

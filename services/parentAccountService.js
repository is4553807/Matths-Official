"use strict";

const { createHash } = require("node:crypto");
const bcrypt = require("bcrypt");
const { ParentAccount } = require("../models/parentModel");
const { User } = require("../models/matthsModel");
const { AcademyAccount } = require("../models/academyModel");
const { acceptParentInvite, getParentInvite } = require("./checkoutService");
const { inviteTokenFrom, statusError, validateAccount, validateChildConsent } = require("./portalRegistrationValidation");

async function registerParentAccount(values) {
  const credentials = validateAccount(values, { nameLabel: "학부모 이름", nameMaximum: 30 });
  const token = values.inviteToken ? inviteTokenFrom(values.inviteToken, "/parent/invite/") : "";
  const invite = token ? await getParentInvite(token) : null;
  const consent = invite ? validateChildConsent(values) : null;
  if (invite && invite.parentEmail !== credentials.email) throw statusError(400, "자녀 초대를 받은 이메일로 가입해주세요.");
  const [parentExists, userExists, academyExists] = await Promise.all([
    ParentAccount.exists({ email: credentials.email }), User.exists({ email: credentials.email }), AcademyAccount.exists({ email: credentials.email }),
  ]);
  if (parentExists || userExists || academyExists) throw statusError(409, "이미 사용 중인 이메일입니다.");
  const now = new Date();
  let parent;
  try {
    parent = await ParentAccount.create({
      username: credentials.displayName,
      usernameNormalized: `parent-${createHash("sha256").update(credentials.email).digest("hex").slice(0, 20)}`,
      email: credentials.email, passwordHash: await bcrypt.hash(credentials.password, 12),
      childUserId: null, acceptedTermsAt: now, acceptedPrivacyAt: now, lastLoginAt: now,
    });
    if (invite) {
      const linked = await acceptParentInvite({ rawToken: token, parentAccountId: parent._id, ...consent });
      parent.childUserId = linked.child._id;
    }
    return parent;
  } catch (error) {
    // Retain a successfully linked account if a later database operation fails.
    if (parent && !await ParentAccount.exists({ _id: parent._id, childUserId: { $ne: null } })) await ParentAccount.deleteOne({ _id: parent._id });
    if (Number(error.code) === 11000) throw statusError(409, "이미 사용 중인 이메일 또는 자녀 연결입니다.");
    throw error;
  }
}

module.exports = { registerParentAccount };

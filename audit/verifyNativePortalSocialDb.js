"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const express = require("express");
require("../services/emailVerificationService").sendVerificationForAccount = async () => ({ sent: true });
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { AcademyAccount, Academy } = require("../models/academyModel");
const portal = require("../services/nativePortalSocialService");
const { consumeMobileAuthGrant } = require("../services/mobileSocialAuthGrantService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
const verifier = "A".repeat(43), codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const profile = (kind, provider = "google") => ({ provider, providerUserId: `synthetic-${kind}-${provider}`, email: `${kind}-${provider}@example.test`, emailVerified: true, displayName: "테스트 계정" });
async function main() {
  assert.match(String(process.env.DB), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  let server;
  try {
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
    const post = async (path, body) => { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/portal/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }); return { status: res.status, body: await res.json(), cache: res.headers.get("cache-control") }; };
    for (const accountType of ["parent", "academy"]) {
      for (const provider of ["google", "kakao", "apple"]) {
        const identity = profile(accountType, provider);
        const ticket = await portal.issuePortalProof(identity, { accountType, codeChallenge });
        const row = await mongoose.model("NativePortalTicket").collection.findOne({ tokenHash: crypto.createHash("sha256").update(ticket).digest("hex") });
        assert.ok(!JSON.stringify(row).includes(identity.email)); assert.ok(!JSON.stringify(row).includes(identity.providerUserId));
        await assert.rejects(portal.exchangePortalProof(ticket, "B".repeat(43)), error => error.code === "PORTAL_AUTH_EXPIRED");
        const exchange = await post("exchange", { ticket, codeVerifier: verifier });
        assert.equal(exchange.status, 200); assert.equal(exchange.cache, "no-store");
        assert.equal(exchange.body.status, "registration_required"); assert.equal(exchange.body.accountType, accountType);
        const body = { registrationToken: ticket, codeVerifier: verifier, displayName: "소셜 테스트", termsAccepted: false,
          academyName: "소셜 테스트 학원", address: "서울 테스트로 123", contactPhone: "01000000000", authorityConfirmed: true, registrationFlow: "new",
          email: "forged@example.test", socialProfile: profile("attacker"), role: "admin" };
        assert.equal((await post("register", body)).status, 400);
        const registrations = await Promise.all([post("register", { ...body, termsAccepted: true }), post("register", { ...body, termsAccepted: true })]);
        assert.equal(registrations.filter(result => result.status === 202).length, 1);
        const registered = registrations.find(result => result.status === 202).body;
        assert.equal(registered.status, "email_verification_required");
        assert.equal(registered.verification.email, identity.email); assert.equal(registered.session, undefined); assert.equal(registered.code, undefined);
        const Model = accountType === "parent" ? ParentAccount : User;
        const owner = await Model.findOne({ email: identity.email }); assert.ok(owner.emailVerificationRequiredAt); assert.equal(owner.emailVerifiedAt, null);
        assert.equal(await Model.countDocuments({ email: identity.email }), 1);
        if (accountType === "academy") { assert.equal(owner.role, "teacher"); assert.equal((await Academy.findOne({ createdByUserId: owner._id })).status, "PENDING"); }
        const pendingProof = await portal.issuePortalProof(identity, { accountType, codeChallenge });
        assert.equal((await portal.exchangePortalProof(pendingProof, verifier)).status, "email_verification_required");
        await Model.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerificationRequiredAt: 1 } });
        if (accountType === "academy") {
          await User.updateOne({ _id: owner._id }, { $set: { teacherAccessExpiresAt: new Date(Date.now() + 86400000 * 30), accountStatus: "active", isActive: true } });
          await AcademyAccount.updateOne({ teacherUserId: owner._id }, { $set: { isActive: true } });
        }
        const loginProof = await portal.issuePortalProof(identity, { accountType, codeChallenge });
        const login = await portal.exchangePortalProof(loginProof, verifier);
        assert.equal(login.status, "authenticated"); assert.equal(login.accountType, accountType);
        if (accountType === "parent") {
          assert.ok(login.session.token); assert.equal(login.code, undefined);
          await ParentAccount.updateOne({ _id: owner._id }, { $unset: { [`socialAuth.${provider}Id`]: 1 } });
          const revoked = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/parent-native/dashboard`, { headers: { Authorization: `Bearer ${login.session.token}` } });
          assert.equal(revoked.status, 401, "unlink must invalidate provider-bound native parent session");
        }
        else { assert.ok(login.code); assert.ok(await consumeMobileAuthGrant(login.code, { codeVerifier: verifier })); }
        await assert.rejects(portal.exchangePortalProof(loginProof, verifier));
        const wrongRole = await portal.issuePortalProof(identity, { accountType: accountType === "parent" ? "academy" : "parent", codeChallenge });
        await assert.rejects(portal.exchangePortalProof(wrongRole, verifier), error => error.code === "SOCIAL_AUTH_ACCOUNT_CONFLICT");
      }
    }
    const expired = await portal.issuePortalProof(profile("expired"), { accountType: "parent", codeChallenge });
    await mongoose.model("NativePortalTicket").updateOne({ tokenHash: crypto.createHash("sha256").update(expired).digest("hex") }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(portal.exchangePortalProof(expired, verifier));
    await assert.rejects(portal.issuePortalProof({ ...profile("unverified"), emailVerified: false }, { accountType: "parent", codeChallenge }));
    console.log("PASS portal social: 3 providers x 2 roles, proof encryption/PKCE/expiry/one-use, consent, concurrent completion, no client role/email injection, activation gating, parent vs academy session separation");
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const express = require("express");
const { User } = require("../models/matthsModel");
const { Academy, AcademyClass, AcademyStaff, AcademyInvite } = require("../models/academyModel");
const { createAccessToken } = require("../services/mobileAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");

async function main() {
  assert.match(String(process.env.DB), /^mongodb:\/\/127\.0\.0\.1:[^/]+\/matths_audit_zero_assumption_20260815(?:\?|$)/);
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  try {
    await Promise.all([AcademyStaff, AcademyInvite, AcademyClass].map((model) => model.createIndexes()));
    const users = await User.create(["teacher", "teacher", "teacher"].map((role, index) => ({
      name: `초대검증${index}`, email: `${new mongoose.Types.ObjectId()}@qa.invalid`, passwordHash: "fixture-only", role,
      teacherAccessExpiresAt: new Date(Date.now() + 365 * 86400000),
    })));
    const tokens = users.map(createAccessToken);
    const academy = await Academy.create({ name: "초대 검증 학원", nameNormalized: "초대 검증 학원", status: "ACTIVE", createdByUserId: users[0]._id,
      contractStartsAt: new Date(Date.now() - 86400000), contractEndsAt: new Date(Date.now() + 365 * 86400000) });
    await AcademyStaff.create([0, 1].map((index) => ({ academyId: academy._id, userId: users[index]._id,
      role: index ? "TEACHER" : "OWNER", status: "ACTIVE", currentStaffKey: String(users[index]._id) })));
    const academyClass = await AcademyClass.create({ academyId: academy._id, name: "초대반", nameNormalized: "초대반", createdByUserId: users[0]._id, homeroomTeacherUserId: users[0]._id });
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    await AcademyInvite.create(Array.from({ length: 35 }, (_, index) => ({ academyId: academy._id, createdByUserId: users[0]._id,
      label: `과거 초대 ${index}`, code: `MTH-AAAA${alphabet[Math.floor(index / alphabet.length)]}${alphabet[index % alphabet.length]}`, token: `synthetic-invite-${String(index).padStart(20, "0")}`,
      expiresAt: new Date(Date.now() + (index === 2 ? -1 : 10) * 86400000), maxUses: 30, useCount: index === 3 ? 30 : 0,
      status: index === 1 ? "REVOKED" : "ACTIVE", classId: academyClass._id,
    })));
    const app = express(); app.use(express.json()); app.use("/api/v1", router); app.use(errorHandler);
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(path, account = 0, body) {
      const result = await fetch(origin + path, { method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${tokens[account]}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: result.status, body: await result.json() };
    }
    const list = await request("/academy/teacher");
    assert.equal(list.status, 200);
    if (process.env.EXPECT_INVITE_PARITY_GAPS === "1") {
      assert.equal(list.body.invites.length, 20);
      assert.ok(list.body.invites.every((invite) => invite.token === undefined));
      await User.updateOne({ _id: users[1]._id }, { $set: { role: "student" } });
      tokens[1] = createAccessToken(await User.findById(users[1]._id));
      assert.equal((await request("/academy/teacher", 1)).status, 200);
      console.log("REPRO: native teacher dashboard truncates 35 web-visible invites to20 and omits link tokens; retained staff with a fresh student token can still read teacher dashboard.");
      return;
    }
    assert.equal(list.body.invites.length, 35);
    assert.ok(list.body.invites.every((invite) => /^[A-Za-z0-9_-]{16,128}$/.test(invite.token)));
    assert.deepEqual(new Set(list.body.invites.map((invite) => invite.displayState)), new Set(["ACTIVE", "REVOKED", "EXPIRED", "EXHAUSTED"]));
    for (const [expiryDays, maxUses] of [[7, 1], [14, 30], [30, 200]]) {
      const label = `설정검증-${expiryDays}`;
      const created = await request("/academy/teacher/invites", 0, { label, classId: String(academyClass._id), expiryDays, maxUses });
      assert.equal(created.status, 201);
      const invite = created.body.invites.find((item) => item.label === label);
      assert.equal(invite.maxUses, maxUses); assert.equal(invite.academyClass.id, String(academyClass._id));
      assert.ok(Math.abs(new Date(invite.expiresAt).getTime() - Date.now() - expiryDays * 86400000) < 15000);
      const revoked = await request(`/academy/teacher/invites/${invite.id}/revoke`, 0, {});
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.invites.find((item) => item.id === invite.id).displayState, "REVOKED");
      assert.equal((await request(`/academy/teacher/invites/${invite.id}/revoke`, 2, {})).status, 403);
    }
    await User.updateOne({ _id: users[1]._id }, { $set: { role: "student" } });
    tokens[1] = createAccessToken(await User.findById(users[1]._id));
    const before = await AcademyInvite.countDocuments({ academyId: academy._id });
    assert.equal((await request("/academy/teacher", 1)).status, 403);
    assert.equal((await request("/academy/teacher/invites", 1, { label: "금지", expiryDays: 7, maxUses: 1 })).status, 403);
    assert.equal(await AcademyInvite.countDocuments({ academyId: academy._id }), before);
    await User.updateOne({ _id: users[1]._id }, { $set: { role: "teacher", teacherAccessExpiresAt: new Date(Date.now() - 1000) } });
    tokens[1] = createAccessToken(await User.findById(users[1]._id));
    assert.equal((await request("/academy/teacher", 1)).status, 403);
    for (const revoke of ["role", "staff"]) {
      await User.updateOne({ _id: users[1]._id }, { $set: { role: "teacher", teacherAccessExpiresAt: new Date(Date.now() + 86400000) } });
      await AcademyStaff.updateOne({ userId: users[1]._id }, { $set: { status: "ACTIVE" } });
      tokens[1] = createAccessToken(await User.findById(users[1]._id));
      const original = AcademyInvite.find;
      let enter, release, held = false;
      const entered = new Promise((resolve) => { enter = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      AcademyInvite.find = function (...args) {
        const query = original.apply(this, args), lean = query.lean;
        query.lean = function (...options) {
          return lean.apply(this, options).exec().then(async (rows) => {
            if (!held) { held = true; enter(); await gate; }
            return rows;
          });
        };
        return query;
      };
      try {
        const pending = request("/academy/teacher", 1);
        await entered;
        if (revoke === "role") await User.updateOne({ _id: users[1]._id }, { $set: { role: "student" } });
        else await AcademyStaff.updateOne({ userId: users[1]._id }, { $set: { status: "REVOKED" } });
        release(); const result = await pending;
        assert.equal(result.status, 403);
        assert.equal(result.body.invites, undefined, "tokens must not escape after permission was revoked during the query");
      } finally { release(); AcademyInvite.find = original; }
    }
    console.log("PASS actual native invites: web-equivalent history and tokens,7/14/30 days,1/30/200 uses,class mapping,revoke with retained history,foreign/revoked/expired teacher denial without writes.");
    console.log("PASS role/staff revocation during the actual awaited dashboard query suppresses invitation tokens.");
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

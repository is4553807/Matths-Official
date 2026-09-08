"use strict";

/*
 * This is deliberately an end-to-end web-session check, not a controller mock.
 * It uses a fresh in-memory replica set and random credentials, so it never
 * reads from or writes to a production account.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

const matthsController = require("../controllers/matthsController");
const { MongoSessionStore } = require("../services/mongoSessionStore");
const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const { WebSession } = require("../models/sessionModel");

function password() {
  return `Qa1!${crypto.randomBytes(24).toString("base64url")}`;
}

function sessionCookie(response) {
  const raw = String(response.headers.get("set-cookie") || "");
  const match = raw.match(/connect\.sid=[^;]+/);
  assert.ok(match, "로그인 성공 응답이 새 세션 쿠키를 설정해야 합니다.");
  return match[0];
}

async function postForm(origin, path, fields, cookie = "") {
  const body = new URLSearchParams(fields);
  return fetch(`${origin}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
}

async function sessionView(origin, cookie) {
  const response = await fetch(`${origin}/__test/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200, "새 세션 쿠키로 세션을 다시 읽을 수 있어야 합니다.");
  return response.json();
}

async function main() {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    DISABLE_SCHEDULERS: process.env.DISABLE_SCHEDULERS,
  };
  process.env.NODE_ENV = "development";
  process.env.DISABLE_SCHEDULERS = "1";

  let replicaSet;
  let listener;
  try {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: "8.2.6" },
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replicaSet.getUri("matths_web_login_fixture"));

    const now = new Date();
    const accounts = await Promise.all(
      ["student", "teacher", "admin"].map(async (role) => {
        const userPassword = password();
        const user = await User.create({
          name: `웹로그인${role}`,
          nameNormalized: `웹로그인${role}`.toLowerCase(),
          realName: `웹 로그인 ${role}`,
          email: `${role}-${crypto.randomUUID()}@qa.invalid`,
          passwordHash: await bcrypt.hash(userPassword, 10),
          role,
          isActive: true,
          accountStatus: "active",
          schoolGrade: 10,
          termsAcceptedAt: now,
          ...(role === "teacher"
            ? { teacherAccessExpiresAt: new Date(Date.now() + 86_400_000) }
            : {}),
        });
        return { role, email: user.email, password: userPassword, user };
      })
    );
    const studentAccount = accounts.find((account) => account.role === "student");
    const parentPassword = password();
    const parent = await ParentAccount.create({
      username: "웹로그인학부모",
      usernameNormalized: "웹로그인학부모",
      email: `parent-${crypto.randomUUID()}@qa.invalid`,
      passwordHash: await bcrypt.hash(parentPassword, 10),
      childUserId: studentAccount.user._id,
      isActive: true,
    });

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({
      secret: crypto.randomBytes(48).toString("base64url"),
      resave: false,
      saveUninitialized: false,
      store: new MongoSessionStore({ ttlSeconds: 600 }),
      cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 600_000 },
    }));
    app.post("/login", matthsController.login);
    app.get("/__test/return-to", (req, res) => {
      req.session.returnTo = String(req.query.path || "");
      res.sendStatus(204);
    });
    app.get("/__test/session", (req, res) => {
      res.json({
        userRole: req.session?.user?.role || null,
        parentId: req.session?.parent?.id || null,
      });
    });
    app.use((error, _req, res, _next) => {
      res.status(Number(error?.status) || 500).json({ error: error?.message || "unexpected" });
    });
    listener = await new Promise((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
    });
    const origin = `http://127.0.0.1:${listener.address().port}`;

    const returnToByRole = {
      student: "/academy/join/test-invite-token",
      teacher: "/academy/forensics?case=open",
      admin: "/admin/users?status=active",
    };
    for (const account of accounts) {
      const returnResponse = await fetch(
        `${origin}/__test/return-to?path=${encodeURIComponent(returnToByRole[account.role])}`
      );
      assert.equal(returnResponse.status, 204);
      const preLoginCookie = sessionCookie(returnResponse);
      const response = await postForm(origin, "/login", {
        email: account.email,
        password: account.password,
      }, preLoginCookie);
      assert.equal(response.status, 302, `${account.role} 로그인은 성공 후 이동해야 합니다.`);
      assert.equal(response.headers.get("location"), returnToByRole[account.role]);
      const snapshot = await sessionView(origin, sessionCookie(response));
      assert.equal(snapshot.userRole, account.role);
      assert.equal(snapshot.parentId, null);
    }

    const blockedAcademyReturn = await fetch(
      `${origin}/__test/return-to?path=${encodeURIComponent("/academy/forensics")}`
    );
    assert.equal(blockedAcademyReturn.status, 204);
    const blockedAcademyResponse = await postForm(origin, "/login", {
      email: studentAccount.email,
      password: studentAccount.password,
    }, sessionCookie(blockedAcademyReturn));
    assert.equal(blockedAcademyResponse.status, 302);
    assert.equal(
      blockedAcademyResponse.headers.get("location"),
      "/main",
      "학생은 학원 초대 경로 이외의 학원 관리 화면으로 복귀하면 안 됩니다."
    );

    const parentResponse = await postForm(origin, "/login", {
      email: parent.email,
      password: parentPassword,
      next: "/parent",
    });
    assert.equal(parentResponse.status, 302, "공용 로그인에서 학부모 이메일 로그인이 성공해야 합니다.");
    assert.equal(parentResponse.headers.get("location"), "/parent");
    const parentSnapshot = await sessionView(origin, sessionCookie(parentResponse));
    assert.equal(parentSnapshot.userRole, null);
    assert.equal(parentSnapshot.parentId, String(parent._id));
    assert.equal(await WebSession.countDocuments({}), 5, "각 역할과 경로 복귀 로그인은 Mongo 세션 저장소에 기록되어야 합니다.");

    console.log("웹 로그인 검증 완료: 학생·선생님·관리자·학부모의 세션 재발급과 역할별 목적지 이동을 확인했습니다.");
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (replicaSet) await replicaSet.stop();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

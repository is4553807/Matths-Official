const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");

const { User } = require("../models/matthsModel");
const { ParentAccount } = require("../models/parentModel");
const AppleAuthCredential = require(
  "../models/appleAuthCredentialModel"
);
const MobileAuthGrant = require(
  "../models/mobileAuthGrantModel"
);
const NativeSocialRegistrationTicket = require(
  "../models/nativeSocialRegistrationTicketModel"
);
const {
  PRIVACY_VERSION,
  TERMS_VERSION,
  completeNativeSocialRegistration,
  ensureNativeSocialRegistrationIndexes,
  startAppleNativeSocial,
  startKakaoNativeSocial,
  _testing,
} = require("../services/nativeSocialRegistrationService");
const {
  consumeMobileAuthGrant,
} = require("../services/mobileSocialAuthGrantService");
const {
  verifyNativeKakaoIdentity,
} = require("../services/kakaoNativeAuthService");
const appleAuth = require("../services/appleAuthService");
const router = require("../routes/api-routes");
const { errorHandler } = require("../middleware/errorMiddleware");
const {
  authRequestKey,
} = require("../middleware/requestSecurity");

const verifier = "a".repeat(43);
const codeChallenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

function registrationBody(token, overrides = {}) {
  return {
    registrationToken: token,
    codeVerifier: verifier,
    realName: "검증학생",
    name: `검증닉네임${crypto.randomBytes(4).toString("hex")}`,
    birthDate: "2008-05-17",
    schoolGrade: 13,
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    ...overrides,
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error?.code === code,
    `expected ${code}`
  );
}

async function issueKakaoTicket(id, email) {
  return _testing.startNativeSocialRegistration({
    provider: "kakao",
    identity: {
      providerUserId: id,
      email,
      emailVerified: true,
    },
    codeChallenge,
  });
}

async function main() {
  assert.match(
    String(process.env.DB),
    /matths_audit_zero_assumption_20260815/
  );
  await mongoose.connect(process.env.DB, { autoIndex: false });
  let server;
  const originalFetch = global.fetch;
  const originalBundleId = process.env.APPLE_BUNDLE_ID;
  const originalServicesId = process.env.APPLE_SERVICES_ID;
  const originalTeamId = process.env.APPLE_TEAM_ID;
  const originalKeyId = process.env.APPLE_KEY_ID;
  const originalPrivateKey = process.env.APPLE_PRIVATE_KEY;
  try {
    await Promise.all([
      User.createIndexes(),
      ParentAccount.createIndexes(),
      AppleAuthCredential.createIndexes(),
      MobileAuthGrant.createIndexes(),
      ensureNativeSocialRegistrationIndexes(),
    ]);
    const ticketIndexes = await NativeSocialRegistrationTicket.collection
      .listIndexes()
      .toArray();
    const tokenIndex = ticketIndexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({ tokenHash: 1 })
    );
    const ttlIndex = ticketIndexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({ expiresAt: 1 })
    );
    const identityIndex = ticketIndexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({
        provider: 1,
        identityDigest: 1,
        status: 1,
        createdAt: -1,
      })
    );
    assert.equal(tokenIndex?.unique, true);
    assert.equal(ttlIndex?.expireAfterSeconds, 0);
    assert.ok(identityIndex);

    const paths = new Set(
      router.stack
        .map((layer) => layer.route?.path)
        .filter(Boolean)
    );
    for (const path of [
      "/auth/native-social/kakao/start",
      "/auth/native-social/apple/start",
      "/auth/native-social/register",
    ]) {
      assert.equal(paths.has(path), true, `${path} route missing`);
    }
    const requestKey = (body) => authRequestKey({
      body,
      ip: "127.0.0.1",
      socket: {},
    });
    assert.equal(
      requestKey({
        accessToken: "fixed-provider-token",
        email: "attacker-one@example.test",
      }),
      requestKey({
        accessToken: "fixed-provider-token",
        email: "attacker-two@example.test",
      }),
      "untrusted email must not change the native provider-token rate bucket"
    );
    assert.equal(
      requestKey({
        registrationToken: "fixed-registration-token",
        email: "attacker-one@example.test",
      }),
      requestKey({
        registrationToken: "fixed-registration-token",
        email: "attacker-two@example.test",
      }),
      "untrusted email must not change the native registration-ticket rate bucket"
    );

    const providerSubject = "kakao-native-audit-001";
    const providerEmail = "native-audit-001@example.test";
    const started = await issueKakaoTicket(providerSubject, providerEmail);
    assert.equal(started.status, "registration_required");
    assert.equal(started.registration.provider, "kakao");
    assert.equal(started.registration.email, providerEmail);
    assert.equal(started.registration.termsVersion, TERMS_VERSION);
    const rawTicket = await NativeSocialRegistrationTicket.collection.findOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(started.registration.token)
        .digest("hex"),
    });
    const storedText = JSON.stringify(rawTicket);
    assert.equal(storedText.includes(started.registration.token), false);
    assert.equal(storedText.includes(providerSubject), false);
    assert.equal(storedText.includes(providerEmail), false);
    assert.equal(storedText.includes(verifier), false);

    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(started.registration.token, {
          codeVerifier: "b".repeat(43),
        })
      ),
      "NATIVE_SOCIAL_REGISTRATION_INVALID"
    );
    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(started.registration.token, {
          schoolGrade: 10,
          schoolRegion: "",
          schoolCode: "",
        })
      ),
      "INVALID_SCHOOL"
    );
    assert.equal(
      (
        await NativeSocialRegistrationTicket.findById(rawTicket._id)
      ).status,
      "PENDING"
    );

    const body = registrationBody(started.registration.token);
    const completed = await completeNativeSocialRegistration(body);
    const replayed = await completeNativeSocialRegistration(body);
    assert.equal(replayed.code, completed.code);
    await rejectsCode(
      completeNativeSocialRegistration({
        ...body,
        name: `${body.name}변경`,
      }),
      "NATIVE_SOCIAL_REGISTRATION_CONFLICT"
    );
    const created = await User.findOne({ email: providerEmail })
      .select("+birthDate +socialAuth.kakaoId");
    assert.ok(created);
    assert.equal(created.socialAuth.kakaoId, providerSubject);
    assert.equal(created.birthDate.toISOString().slice(0, 10), "2008-05-17");
    assert.equal(await User.countDocuments({ email: providerEmail }), 1);
    assert.equal(
      await MobileAuthGrant.countDocuments({ userId: created._id }),
      1
    );
    assert.ok(
      await consumeMobileAuthGrant(completed.code, {
        codeVerifier: verifier,
      })
    );

    const completeLogin = await _testing.startNativeSocialRegistration({
      provider: "kakao",
      identity: {
        providerUserId: providerSubject,
        email: providerEmail,
        emailVerified: true,
      },
      codeChallenge,
    });
    assert.equal(completeLogin.status, "authenticated");
    assert.ok(completeLogin.code);
    const existingWithoutEmail = await startKakaoNativeSocial(
      { accessToken: "ignored", codeChallenge },
      {
        verifyIdentity: async () => ({
          providerUserId: providerSubject,
          email: "",
          emailVerified: false,
        }),
      }
    );
    assert.equal(existingWithoutEmail.status, "authenticated");
    assert.ok(existingWithoutEmail.code);

    const raceStarted = await issueKakaoTicket(
      "kakao-native-race-001",
      "native-race-001@example.test"
    );
    const raceBody = registrationBody(raceStarted.registration.token);
    const raceResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        completeNativeSocialRegistration(raceBody)
      )
    );
    assert.equal(new Set(raceResults.map((item) => item.code)).size, 1);
    const raceUser = await User.findOne({
      email: "native-race-001@example.test",
    });
    assert.equal(
      await User.countDocuments({
        email: "native-race-001@example.test",
      }),
      1
    );
    assert.equal(
      await MobileAuthGrant.countDocuments({ userId: raceUser._id }),
      1
    );

    const conflictStarted = await issueKakaoTicket(
      "kakao-native-conflict-001",
      "native-conflict-001@example.test"
    );
    const conflictBodyA = registrationBody(
      conflictStarted.registration.token,
      { name: "동시입력가" }
    );
    const conflictBodyB = registrationBody(
      conflictStarted.registration.token,
      { name: "동시입력나" }
    );
    const conflictResults = await Promise.allSettled([
      completeNativeSocialRegistration(conflictBodyA),
      completeNativeSocialRegistration(conflictBodyB),
    ]);
    assert.equal(
      conflictResults.filter((item) => item.status === "fulfilled").length,
      1
    );
    const rejectedConflict = conflictResults.find(
      (item) => item.status === "rejected"
    );
    assert.equal(
      rejectedConflict.reason?.code,
      "NATIVE_SOCIAL_REGISTRATION_CONFLICT"
    );
    const conflictUser = await User.findOne({
      email: "native-conflict-001@example.test",
    });
    assert.ok(["동시입력가", "동시입력나"].includes(conflictUser.name));
    assert.equal(
      await User.countDocuments({
        email: "native-conflict-001@example.test",
      }),
      1
    );

    const siblingOne = await issueKakaoTicket(
      "kakao-native-sibling-001",
      "native-sibling-001@example.test"
    );
    const siblingTwo = await issueKakaoTicket(
      "kakao-native-sibling-001",
      "native-sibling-001@example.test"
    );
    await completeNativeSocialRegistration(
      registrationBody(siblingOne.registration.token)
    );
    const siblingTwoRow = await NativeSocialRegistrationTicket.findOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(siblingTwo.registration.token)
        .digest("hex"),
    }).select("+tokenHash");
    assert.equal(siblingTwoRow.status, "REVOKED");
    assert.ok(siblingTwoRow.userId);
    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(siblingTwo.registration.token)
      ),
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );

    const rollbackStarted = await _testing.startNativeSocialRegistration({
      provider: "apple",
      identity: {
        providerUserId: "apple-native-rollback-001",
        email: "apple-rollback-001@example.test",
        emailVerified: true,
        suggestedRealName: "롤백 학생",
      },
      codeChallenge,
      appleAuthorization: {
        authorizationCode: "secret-authorization-code",
        authorizationCodeIssuedAt: new Date().toISOString(),
        clientId: "kr.matths.app",
        refreshToken: "secret-refresh-token",
        refreshTokenIssuedAt: new Date().toISOString(),
      },
    });
    const rollbackBody = registrationBody(rollbackStarted.registration.token);
    await assert.rejects(
      completeNativeSocialRegistration(rollbackBody, {
        failurePoint: "after-grant",
      }),
      /NATIVE_SOCIAL_TEST_FAILURE_AFTER_GRANT/
    );
    assert.equal(
      await User.countDocuments({
        email: "apple-rollback-001@example.test",
      }),
      0
    );
    assert.equal(
      await AppleAuthCredential.countDocuments({
        appleSubject: "apple-native-rollback-001",
      }),
      0
    );
    assert.equal(
      (
        await NativeSocialRegistrationTicket.findOne({
          tokenHash: crypto
            .createHash("sha256")
            .update(rollbackStarted.registration.token)
            .digest("hex"),
        }).select("+tokenHash")
      ).status,
      "PENDING"
    );
    const rollbackCompleted = await completeNativeSocialRegistration(
      rollbackBody
    );
    assert.ok(rollbackCompleted.code);
    const appleUser = await User.findOne({
      email: "apple-rollback-001@example.test",
    }).select("+socialAuth.appleId");
    const appleCredential = await AppleAuthCredential.findOne({
      userId: appleUser._id,
    }).select(
      "+appleSubject +authorizationCode +refreshToken"
    );
    assert.equal(appleCredential.appleSubject, "apple-native-rollback-001");
    assert.notEqual(
      appleCredential.authorizationCode,
      "secret-authorization-code"
    );
    assert.notEqual(
      appleCredential.refreshToken,
      "secret-refresh-token"
    );

    const legacyUser = await User.create({
      realName: "",
      name: "레거시애플검증",
      nameNormalized: "레거시애플검증",
      email: "legacy-apple-001@example.test",
      passwordHash: "audit-only",
      totalStudySeconds: 4321,
      schoolGrade: 10,
      school: {
        region: "서울",
        code: "LEGACY-HS-001",
        name: "기존 고등학교",
        roadAddress: "기존 주소",
        establishment: "사립",
        highSchoolType: "일반고",
      },
      university: {
        code: "LEGACY-UNI-001",
        name: "기존 대학교",
        campus: "본교",
        region: "서울",
      },
      identityMatchHash: "legacy-identity-hash",
      identityMatchVersion: "name-birthdate-school-v1",
      preferences: {
        coachMode: "spicy",
        dashboardTutorialStatus: "COMPLETED",
        dashboardTutorialCompletedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      socialAuth: { appleId: "apple-native-legacy-001" },
      termsAcceptedAt: new Date(),
    });
    await AppleAuthCredential.create({
      appleSubject: "apple-native-legacy-001",
      userId: legacyUser._id,
    });
    const legacyStart = await _testing.startNativeSocialRegistration({
      provider: "apple",
      identity: {
        providerUserId: "apple-native-legacy-001",
        email: "legacy-apple-001@example.test",
        emailVerified: true,
      },
      codeChallenge,
    });
    assert.equal(legacyStart.status, "registration_required");
    await completeNativeSocialRegistration(
      registrationBody(legacyStart.registration.token, {
        realName: "레거시 학생",
      })
    );
    const completedLegacy = await User.findById(legacyUser._id)
      .select(
        "+birthDate +identityMatchHash +identityMatchVersion +socialAuth.appleId"
      );
    assert.equal(completedLegacy.totalStudySeconds, 4321);
    assert.equal(completedLegacy.realName, "레거시 학생");
    assert.equal(completedLegacy.socialAuth.appleId, "apple-native-legacy-001");
    assert.equal(completedLegacy.school.code, "LEGACY-HS-001");
    assert.equal(completedLegacy.school.name, "기존 고등학교");
    assert.equal(completedLegacy.university.code, "LEGACY-UNI-001");
    assert.notEqual(completedLegacy.identityMatchHash, "legacy-identity-hash");
    assert.equal(completedLegacy.preferences.coachMode, "spicy");
    assert.equal(
      completedLegacy.preferences.dashboardTutorialStatus,
      "COMPLETED"
    );
    assert.equal(
      completedLegacy.preferences.dashboardTutorialCompletedAt
        .toISOString(),
      "2026-08-01T00:00:00.000Z"
    );

    const staleUser = await User.create({
      realName: "",
      name: "오래된티켓사용자",
      nameNormalized: "오래된티켓사용자",
      email: "stale-ticket-apple@example.test",
      passwordHash: "audit-only",
      schoolGrade: 10,
      socialAuth: { appleId: "apple-native-stale-001" },
      termsAcceptedAt: new Date(),
    });
    await AppleAuthCredential.create({
      appleSubject: "apple-native-stale-001",
      userId: staleUser._id,
    });
    const staleStart = await _testing.startNativeSocialRegistration({
      provider: "apple",
      identity: {
        providerUserId: "apple-native-stale-001",
        email: staleUser.email,
        emailVerified: true,
      },
      codeChallenge,
    });
    assert.equal(staleStart.status, "registration_required");
    await User.updateOne(
      { _id: staleUser._id },
      {
        $set: {
          role: "teacher",
          realName: "관리자 최신 이름",
          name: "관리자최신닉네임",
          nameNormalized: "관리자최신닉네임",
          birthDate: new Date("1990-01-01T00:00:00.000Z"),
          school: {
            region: "경기",
            code: "ADMIN-HS-001",
            name: "관리자가 저장한 학교",
          },
        },
      }
    );
    await completeNativeSocialRegistration(
      registrationBody(staleStart.registration.token, {
        realName: "오래된 폼 이름",
        name: "오래된폼닉네임",
      })
    );
    const staleCompleted = await User.findById(staleUser._id)
      .select("+birthDate +socialAuth.appleId");
    assert.equal(staleCompleted.role, "teacher");
    assert.equal(staleCompleted.realName, "관리자 최신 이름");
    assert.equal(staleCompleted.name, "관리자최신닉네임");
    assert.equal(staleCompleted.school.code, "ADMIN-HS-001");
    assert.equal(staleCompleted.socialAuth.appleId, "apple-native-stale-001");

    const noEmailApple = await startAppleNativeSocial(
      {
        identityToken: "not-stored-token",
        authorizationCode: "not-stored-code",
        nonce: "not-stored-nonce",
        fullName: "애플 학생",
        email: "untrusted-body-email@example.test",
        codeChallenge,
      },
      {
        verifyIdentity: async () => ({
          subject: "apple-native-noemail-001",
          audience: "kr.matths.app",
          email: "",
          emailVerified: false,
        }),
        prepareAuthorization: async () => ({
          authorizationCode: "not-stored-code",
          authorizationCodeIssuedAt: new Date().toISOString(),
          clientId: "kr.matths.app",
          refreshToken: "not-stored-refresh",
          refreshTokenIssuedAt: new Date().toISOString(),
        }),
        validateNativeAudience: () => true,
      }
    );
    assert.equal(noEmailApple.status, "registration_required");
    assert.equal("email" in noEmailApple.registration, false);
    const noEmailRaw = await NativeSocialRegistrationTicket.collection.findOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(noEmailApple.registration.token)
        .digest("hex"),
    });
    const noEmailStored = JSON.stringify(noEmailRaw);
    for (const secret of [
      "apple-native-noemail-001",
      "not-stored-token",
      "not-stored-code",
      "not-stored-nonce",
      "not-stored-refresh",
    ]) {
      assert.equal(noEmailStored.includes(secret), false);
    }
    await completeNativeSocialRegistration(
      registrationBody(noEmailApple.registration.token, {
        realName: "애플 학생",
      })
    );
    const noEmailUser = await User.findOne({
      "socialAuth.appleId": "apple-native-noemail-001",
    }).select("+socialAuth.appleId");
    assert.match(noEmailUser.email, /^apple\.[a-f0-9]{24}@appleid\.invalid$/);
    assert.equal(noEmailUser.emailVerifiedAt, null);
    assert.notEqual(noEmailUser.email, "untrusted-body-email@example.test");
    await rejectsCode(
      startAppleNativeSocial(
        {
          identityToken: "web-services-token",
          nonce: "web-services-nonce",
          codeChallenge,
        },
        {
          verifyIdentity: async () => ({
            subject: "apple-web-audience-001",
            audience: "kr.matths.web",
            email: "apple-web-audience@example.test",
            emailVerified: true,
          }),
          prepareAuthorization: async () => null,
          validateNativeAudience: () => false,
        }
      ),
      "APPLE_AUTH_AUDIENCE_INVALID"
    );

    await rejectsCode(
      startKakaoNativeSocial(
        { accessToken: "ignored", codeChallenge },
        {
          verifyIdentity: async () => ({
            providerUserId: "kakao-without-email",
            email: "",
            emailVerified: false,
          }),
        }
      ),
      "SOCIAL_AUTH_EMAIL_REQUIRED"
    );

    const blockedUser = await User.create({
      realName: "차단 학생",
      name: "차단학생닉네임",
      nameNormalized: "차단학생닉네임",
      email: "native-blocked-001@example.test",
      passwordHash: "audit-only",
      birthDate: new Date("2008-01-01T00:00:00.000Z"),
      schoolGrade: 13,
      termsAcceptedAt: new Date(),
      accountStatus: "suspended",
      isActive: true,
      socialAuth: { kakaoId: "kakao-native-blocked-001" },
    });
    await rejectsCode(
      _testing.startNativeSocialRegistration({
        provider: "kakao",
        identity: {
          providerUserId: "kakao-native-blocked-001",
          email: "",
          emailVerified: false,
        },
        codeChallenge,
      }),
      "ACCOUNT_BLOCKED"
    );
    const fakeKakao = await verifyNativeKakaoIdentity(
      "valid-kakao-token",
      async (url) => {
        if (String(url).includes("access_token_info")) {
          return {
            ok: true,
            json: async () => ({
              id: 777,
              app_id: 1539001,
              expires_in: 300,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: 777,
            kakao_account: {
              email: "verified-kakao@example.test",
              email_needs_agreement: false,
              is_email_valid: true,
              is_email_verified: true,
              profile: { nickname: "검증 카카오" },
            },
          }),
        };
      }
    );
    assert.equal(fakeKakao.providerUserId, "777");
    assert.equal(fakeKakao.emailVerified, true);

    const expiring = await issueKakaoTicket(
      "kakao-native-expired-001",
      "native-expired-001@example.test"
    );
    await NativeSocialRegistrationTicket.updateOne(
      {
        tokenHash: crypto
          .createHash("sha256")
          .update(expiring.registration.token)
          .digest("hex"),
      },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(expiring.registration.token)
      ),
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );
    const purged = await issueKakaoTicket(
      "kakao-native-purged-001",
      "native-purged-001@example.test"
    );
    await NativeSocialRegistrationTicket.deleteOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(purged.registration.token)
        .digest("hex"),
    });
    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(purged.registration.token)
      ),
      "NATIVE_SOCIAL_REGISTRATION_EXPIRED"
    );

    const parentChild = await User.create({
      name: "학부모충돌자녀",
      nameNormalized: "학부모충돌자녀",
      email: "parent-child-native@example.test",
      passwordHash: "audit-only",
    });
    const nativeParent = await ParentAccount.create({
      username: "네이티브학부모",
      usernameNormalized: "네이티브학부모",
      email: "parent-native@example.test",
      passwordHash: "audit-only",
      childUserId: parentChild._id,
      isActive: true,
    });
    await rejectsCode(
      issueKakaoTicket(
        "kakao-native-parent-conflict",
        "parent-native@example.test"
      ),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
    await AppleAuthCredential.create({
      appleSubject: "apple-native-parent-owned",
      userId: nativeParent._id,
      ownerModel: "ParentAccount",
    });
    await rejectsCode(
      _testing.startNativeSocialRegistration({
        provider: "apple",
        identity: {
          providerUserId: "apple-native-parent-owned",
          email: nativeParent.email,
          emailVerified: true,
        },
        codeChallenge,
      }),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
    await rejectsCode(
      appleAuth.storePreparedAppleAuthorization({
        userId: parentChild._id,
        subject: "apple-native-parent-owned",
        prepared: null,
      }),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );

    const crossStoreUser = await User.create({
      realName: "교차 저장소 학생",
      name: "교차저장소학생",
      nameNormalized: "교차저장소학생",
      email: "cross-store-kakao@example.test",
      passwordHash: "audit-only",
      birthDate: new Date("2008-01-01T00:00:00.000Z"),
      schoolGrade: 13,
      termsAcceptedAt: new Date(),
    });
    await ParentAccount.create({
      username: "교차저장소학부모",
      usernameNormalized: "cross-store-parent",
      email: crossStoreUser.email,
      passwordHash: "audit-only",
      socialAuth: { kakaoId: "kakao-parent-owned-cross-store" },
      isActive: true,
    });
    await rejectsCode(
      issueKakaoTicket(
        "kakao-parent-owned-cross-store",
        crossStoreUser.email
      ),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
    assert.equal(
      (
        await User.findById(crossStoreUser._id)
          .select("+socialAuth.kakaoId")
      ).socialAuth.kakaoId,
      undefined
    );

    const duplicateEmailUser = await User.create({
      realName: "이메일 충돌 학생",
      name: "이메일충돌학생",
      nameNormalized: "이메일충돌학생",
      email: "cross-store-email@example.test",
      passwordHash: "audit-only",
      birthDate: new Date("2008-02-01T00:00:00.000Z"),
      schoolGrade: 13,
      termsAcceptedAt: new Date(),
      socialAuth: { kakaoId: "kakao-student-email-owner" },
    });
    await ParentAccount.create({
      username: "이메일충돌학부모",
      usernameNormalized: "cross-store-email-parent",
      email: duplicateEmailUser.email,
      passwordHash: "audit-only",
      isActive: true,
    });
    await rejectsCode(
      issueKakaoTicket(
        "kakao-student-email-owner",
        duplicateEmailUser.email
      ),
      "NATIVE_SOCIAL_ACCOUNT_CONFLICT"
    );

    const inactiveProviderParent = await ParentAccount.create({
      username: "비활성제공자학부모",
      usernameNormalized: "inactive-provider-parent",
      email: "inactive-provider-parent@example.test",
      passwordHash: "audit-only",
      socialAuth: { kakaoId: "kakao-inactive-parent-owner" },
      isActive: false,
    });
    await rejectsCode(
      _testing.startNativeSocialRegistration({
        provider: "kakao",
        identity: {
          providerUserId: "kakao-inactive-parent-owner",
          email: "changed-provider-email@example.test",
          emailVerified: true,
        },
        codeChallenge,
      }),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
    assert.equal(inactiveProviderParent.isActive, false);

    const staleParentLink = await issueKakaoTicket(
      "kakao-parent-link-after-ticket",
      "parent-link-after-ticket@example.test"
    );
    await ParentAccount.create({
      username: "티켓후연결학부모",
      usernameNormalized: "parent-link-after-ticket",
      email: "parent-link-after-ticket@example.test",
      passwordHash: "audit-only",
      socialAuth: { kakaoId: "kakao-parent-link-after-ticket" },
      isActive: true,
    });
    await rejectsCode(
      completeNativeSocialRegistration(
        registrationBody(staleParentLink.registration.token)
      ),
      "SOCIAL_AUTH_PARENT_ACCOUNT"
    );
    const staleParentTicket = await NativeSocialRegistrationTicket.findOne({
      tokenHash: crypto
        .createHash("sha256")
        .update(staleParentLink.registration.token)
        .digest("hex"),
    }).select("+tokenHash");
    assert.equal(staleParentTicket.status, "PENDING");
    assert.equal(
      await User.exists({
        email: "parent-link-after-ticket@example.test",
      }),
      null
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1", router);
    app.use(errorHandler);
    server = await new Promise((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`;

    global.fetch = async (url) => {
      if (String(url).includes("access_token_info")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 88001,
            app_id: 1539001,
            expires_in: 300,
          }),
        };
      }
      if (String(url).includes("/v2/user/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 88001,
            kakao_account: {
              email: "native-http-001@example.test",
              email_needs_agreement: false,
              is_email_valid: true,
              is_email_verified: true,
            },
          }),
        };
      }
      throw new Error(`unexpected Kakao HTTP test URL: ${url}`);
    };
    const kakaoStartResponse = await originalFetch(
      `${origin}/auth/native-social/kakao/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: "native-http-kakao-access-token",
          codeChallenge,
        }),
      }
    );
    global.fetch = originalFetch;
    assert.equal(kakaoStartResponse.status, 200);
    assert.equal(kakaoStartResponse.headers.get("cache-control"), "no-store");
    const httpStarted = await kakaoStartResponse.json();
    assert.equal(httpStarted.status, "registration_required");

    const response = await originalFetch(
      `${origin}/auth/native-social/register`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          registrationBody(httpStarted.registration.token)
        ),
      }
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok((await response.json()).code);

    process.env.APPLE_BUNDLE_ID = "kr.matths.audit";
    process.env.APPLE_SERVICES_ID = "kr.matths.web.audit";
    const revokeKeys = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    process.env.APPLE_TEAM_ID = "TEAMNATIVE1";
    process.env.APPLE_KEY_ID = "KEYNATIVE1";
    process.env.APPLE_PRIVATE_KEY = revokeKeys.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .replace(/\n/g, "\\n");
    appleAuth._testing.resetJwksCache();
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = {
      ...publicKey.export({ format: "jwk" }),
      kid: "native-http-apple-kid",
      alg: "RS256",
      use: "sig",
    };
    const appleNonce = "native-http-apple-nonce-001";
    const makeAppleToken = (
      audience,
      subject,
      email,
      { authorizationCode = "" } = {}
    ) => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({
        alg: "RS256",
        kid: jwk.kid,
        typ: "JWT",
      })).toString("base64url");
      const claims = {
        iss: "https://appleid.apple.com",
        aud: audience,
        sub: subject,
        iat: nowSeconds - 5,
        exp: nowSeconds + 600,
        nonce: crypto.createHash("sha256").update(appleNonce).digest("hex"),
        email,
        email_verified: "true",
        ...(authorizationCode
          ? {
              c_hash: appleAuth._testing.authorizationCodeHash(
                authorizationCode
              ),
            }
          : {}),
      };
      const payload = Buffer.from(JSON.stringify(claims))
        .toString("base64url");
      const signingInput = `${header}.${payload}`;
      const signature = crypto
        .sign("RSA-SHA256", Buffer.from(signingInput, "utf8"), privateKey)
        .toString("base64url");
      return `${signingInput}.${signature}`;
    };
    const httpAppleAuthorizationCode =
      "native-http-apple-authorization-code";
    global.fetch = async (url) => {
      if (String(url) === appleAuth._testing.APPLE_JWKS_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: [jwk] }),
        };
      }
      if (String(url) === appleAuth._testing.APPLE_TOKEN_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            refresh_token: "native-http-apple-refresh-token",
            id_token: makeAppleToken(
              "kr.matths.audit",
              "apple-native-http-001",
              "native-apple-http@example.test"
            ),
          }),
        };
      }
      throw new Error(`unexpected Apple HTTP test URL: ${url}`);
    };
    const appleStartResponse = await originalFetch(
      `${origin}/auth/native-social/apple/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityToken: makeAppleToken(
            "kr.matths.audit",
            "apple-native-http-001",
            "native-apple-http@example.test",
            { authorizationCode: httpAppleAuthorizationCode }
          ),
          authorizationCode: httpAppleAuthorizationCode,
          nonce: appleNonce,
          codeChallenge,
          email: "untrusted-apple-http@example.test",
        }),
      }
    );
    assert.equal(appleStartResponse.status, 200);
    assert.equal(appleStartResponse.headers.get("cache-control"), "no-store");
    const appleStartBody = await appleStartResponse.json();
    assert.equal(appleStartBody.status, "registration_required");
    assert.equal(
      appleStartBody.registration.email,
      "native-apple-http@example.test"
    );
    const codeHashMismatchResponse = await originalFetch(
      `${origin}/auth/native-social/apple/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityToken: makeAppleToken(
            "kr.matths.audit",
            "apple-native-http-001",
            "native-apple-http@example.test",
            { authorizationCode: "different-authorization-code" }
          ),
          authorizationCode: httpAppleAuthorizationCode,
          nonce: appleNonce,
          codeChallenge,
        }),
      }
    );
    assert.equal(codeHashMismatchResponse.status, 401);
    assert.equal(
      (await codeHashMismatchResponse.json()).code,
      "APPLE_AUTH_CODE_MISMATCH"
    );

    const servicesTokenResponse = await originalFetch(
      `${origin}/auth/native-social/apple/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityToken: makeAppleToken(
            "kr.matths.web.audit",
            "apple-web-http-001",
            "native-apple-web@example.test"
          ),
          nonce: appleNonce,
          codeChallenge,
        }),
      }
    );
    assert.equal(servicesTokenResponse.status, 401);
    assert.equal(servicesTokenResponse.headers.get("cache-control"), "no-store");
    assert.equal(
      (await servicesTokenResponse.json()).code,
      "APPLE_AUTH_AUDIENCE_INVALID"
    );

    const tokenExchangeFetch = async (url) => {
      if (String(url) === appleAuth._testing.APPLE_TOKEN_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            refresh_token: "cross-sub-refresh-token",
            id_token: makeAppleToken(
              "kr.matths.audit",
              "apple-code-owner-b",
              "owner-b@example.test"
            ),
          }),
        };
      }
      if (String(url) === appleAuth._testing.APPLE_JWKS_URL) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: [jwk] }),
        };
      }
      throw new Error(`unexpected Apple credential test URL: ${url}`);
    };
    await rejectsCode(
      appleAuth.prepareAppleAuthorization(
        {
          authorizationCode: "authorization-code-owner-b",
          clientId: "kr.matths.audit",
          expectedSubject: "apple-identity-owner-a",
        },
        { fetchImpl: tokenExchangeFetch }
      ),
      "APPLE_AUTH_CODE_SUBJECT_MISMATCH"
    );
    const boundAuthorization = await appleAuth.prepareAppleAuthorization(
      {
        authorizationCode: "authorization-code-owner-b",
        clientId: "kr.matths.audit",
        expectedSubject: "apple-code-owner-b",
      },
      { fetchImpl: tokenExchangeFetch }
    );
    assert.equal(
      boundAuthorization.refreshToken,
      "cross-sub-refresh-token"
    );
    await rejectsCode(
      appleAuth.prepareAppleAuthorization(
        {
          authorizationCode: "authorization-code-owner-b",
          clientId: "kr.matths.audit",
          expectedSubject: "apple-code-owner-b",
          expectedCodeHash: appleAuth._testing.authorizationCodeHash(
            "different-authorization-code"
          ),
        },
        { fetchImpl: tokenExchangeFetch }
      ),
      "APPLE_AUTH_CODE_MISMATCH"
    );
    global.fetch = originalFetch;
    appleAuth._testing.resetJwksCache();

    console.log(
      "Native social registration DB/HTTP tests PASS: encrypted tickets, PKCE, canonical validation, stable replay, concurrency, sibling revocation, transactional rollback, legacy Apple completion, no-email Apple, verified-email Kakao, expiry, parent conflict and no-store route."
    );
  } finally {
    global.fetch = originalFetch;
    if (originalBundleId === undefined) delete process.env.APPLE_BUNDLE_ID;
    else process.env.APPLE_BUNDLE_ID = originalBundleId;
    if (originalServicesId === undefined) delete process.env.APPLE_SERVICES_ID;
    else process.env.APPLE_SERVICES_ID = originalServicesId;
    if (originalTeamId === undefined) delete process.env.APPLE_TEAM_ID;
    else process.env.APPLE_TEAM_ID = originalTeamId;
    if (originalKeyId === undefined) delete process.env.APPLE_KEY_ID;
    else process.env.APPLE_KEY_ID = originalKeyId;
    if (originalPrivateKey === undefined) delete process.env.APPLE_PRIVATE_KEY;
    else process.env.APPLE_PRIVATE_KEY = originalPrivateKey;
    appleAuth._testing.resetJwksCache();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

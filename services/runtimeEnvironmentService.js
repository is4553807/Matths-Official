const MIN_SECRET_LENGTH = 32;

function valueOf(environment, key) {
  return String(environment?.[key] || "").trim();
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch (_error) {
    return false;
  }
}

function hasCloudinaryConfig(environment) {
  return Boolean(
    valueOf(environment, "CLOUDINARY_URL") ||
      (
        valueOf(environment, "CLOUDINARY_CLOUD_NAME") &&
        valueOf(environment, "CLOUDINARY_API_KEY") &&
        valueOf(environment, "CLOUDINARY_API_SECRET")
      )
  );
}

function hasR2Config(environment) {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ].every((key) => valueOf(environment, key));
}

function hasSupportSmtpConfig(environment) {
  return Boolean(
    valueOf(environment, "SUPPORT_SMTP_HOST") &&
    valueOf(environment, "SUPPORT_SMTP_USER") &&
    valueOf(environment, "GMAIL_APP_PASSWORD")
  );
}

function runtimeEnvironmentReport(environment = process.env) {
  const production = valueOf(environment, "NODE_ENV") === "production";
  const errors = [];
  const warnings = [];

  function requireValue(key, message = `${key} 값이 필요합니다.`) {
    if (!valueOf(environment, key)) errors.push(message);
  }

  if (!production) return { production, errors, warnings };

  requireValue("DB", "DB(MongoDB 연결 문자열)를 운영 환경에 등록해야 합니다.");
  const sessionSecret = valueOf(environment, "SECRET");
  if (sessionSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`SECRET은 ${MIN_SECRET_LENGTH}자 이상의 무작위 값이어야 합니다.`);
  }

  for (const key of ["APP_BASE_URL", "PUBLIC_BASE_URL"]) {
    const value = valueOf(environment, key);
    if (!validHttpsUrl(value)) {
      errors.push(`${key}는 경로가 없는 HTTPS 주소여야 합니다. 예: https://www.matths.kr`);
    }
  }

  for (const key of [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
  ]) {
    requireValue(
      key,
      `${key}를 Cloudtype 운영 환경에 등록해야 합니다.`
    );
  }
  const expectedGoogleRedirect =
    valueOf(
      environment,
      "PUBLIC_BASE_URL"
    )
      ? `${valueOf(environment, "PUBLIC_BASE_URL").replace(/\/$/, "")}/auth/google/callback`
      : "";
  if (
    valueOf(
      environment,
      "GOOGLE_OAUTH_REDIRECT_URI"
    ) &&
    valueOf(
      environment,
      "GOOGLE_OAUTH_REDIRECT_URI"
    ) !== expectedGoogleRedirect
  ) {
    errors.push(
      `GOOGLE_OAUTH_REDIRECT_URI는 ${expectedGoogleRedirect || "PUBLIC_BASE_URL 기반 callback"}이어야 합니다.`
    );
  }

  if (!hasCloudinaryConfig(environment)) {
    errors.push("사용자 업로드를 위한 Cloudinary 운영 연결 정보가 필요합니다.");
  }
  if (!hasR2Config(environment)) {
    errors.push("관리자 원본 파일 보관을 위한 Cloudflare R2 운영 연결 정보가 필요합니다.");
  }
  if (!hasSupportSmtpConfig(environment)) {
    errors.push("전체 운영 메일 발송을 위한 SUPPORT_SMTP_HOST, SUPPORT_SMTP_USER, GMAIL_APP_PASSWORD가 필요합니다.");
  }

  if (valueOf(environment, "DOCUMENT_WATERMARK_SECRET").length < 16) {
    errors.push("DOCUMENT_WATERMARK_SECRET은 16자 이상의 별도 무작위 값이어야 합니다.");
  }
  if (valueOf(environment, "PASSWORD_RESET_SECRET").length < 24) {
    errors.push("PASSWORD_RESET_SECRET은 24자 이상의 별도 무작위 값이어야 합니다.");
  }

  const reserveBps = valueOf(environment, "FINANCE_PG_FEE_RESERVE_BPS");
  if (!/^\d+$/.test(reserveBps) || Number(reserveBps) < 0 || Number(reserveBps) > 10_000) {
    warnings.push(
      "FINANCE_PG_FEE_RESERVE_BPS가 0~10000 정수로 설정되기 전에는 사업자 출금이 잠깁니다."
    );
  }

  if (valueOf(environment, "PAID_CHECKOUT_ENABLED").toLowerCase() === "true") {
    if (valueOf(environment, "PAYMENT_PROVIDER").toUpperCase() !== "TOSS") {
      errors.push("유료 결제를 열려면 PAYMENT_PROVIDER=TOSS가 필요합니다.");
    } else {
      try {
        const { getTossConfig } = require("./tossPaymentService");
        const toss = getTossConfig(environment);
        if (toss.mode === "TEST") {
          warnings.push(
            "토스페이먼츠 TEST 모드입니다. 실제 청구는 발생하지 않으며, 라이브 오픈 전 LIVE 키와 웹훅을 별도로 점검해야 합니다."
          );
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  for (const key of [
    "API_TOKEN_SECRET",
    "IDENTITY_MATCH_SECRET",
    "ARENA_INTEGRITY_SECRET",
    "PAYBACK_ACCOUNT_ENCRYPTION_KEY",
    "NICKNAME_CHECK_SECRET",
  ]) {
    if (!valueOf(environment, key)) {
      warnings.push(`${key}가 없어 현재 SECRET을 함께 사용합니다. 출시 후 키 분리 전에는 데이터 이관 검토가 필요합니다.`);
    }
  }

  return { production, errors, warnings };
}

function assertRuntimeEnvironment(environment = process.env) {
  const report = runtimeEnvironmentReport(environment);
  if (report.errors.length) {
    const error = new Error(
      `운영 환경변수 검증 실패:\n- ${report.errors.join("\n- ")}`
    );
    error.code = "RUNTIME_ENVIRONMENT_INVALID";
    error.details = report.errors;
    throw error;
  }
  return report;
}

module.exports = {
  assertRuntimeEnvironment,
  hasCloudinaryConfig,
  hasR2Config,
  runtimeEnvironmentReport,
  validHttpsUrl,
};

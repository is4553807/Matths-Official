const DEFAULT_BASE_URL = "https://www.matths.kr";
const DEFAULT_CONTACT_EMAIL = "dltkddbs4553@matths.kr";
const DEFAULT_FORBIDDEN_EMAILS = [
  "admin@lsbproduction.com",
  "dltnqls7297@matths.kr",
];

function positiveNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} 값은 0 이상의 숫자여야 합니다.`);
  }
  return parsed;
}

function parseArguments(argv = process.argv.slice(2), env = process.env) {
  const options = {
    baseUrl: env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL,
    expectedContact:
      env.EXPECTED_PUBLIC_CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL,
    forbiddenContacts: [...DEFAULT_FORBIDDEN_EMAILS],
    waitSeconds: positiveNumber(env.PRODUCTION_VERIFY_WAIT_SECONDS || 0, "wait"),
    intervalSeconds: positiveNumber(
      env.PRODUCTION_VERIFY_INTERVAL_SECONDS || 15,
      "interval"
    ),
    timeoutSeconds: positiveNumber(
      env.PRODUCTION_VERIFY_TIMEOUT_SECONDS || 10,
      "timeout"
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length || argv[index].startsWith("--")) {
        throw new Error(`${flag} 값이 필요합니다.`);
      }
      return argv[index];
    };
    if (flag === "--base-url") options.baseUrl = next();
    else if (flag === "--expected-contact") options.expectedContact = next();
    else if (flag === "--forbidden-contact") {
      options.forbiddenContacts.push(next());
    } else if (flag === "--wait-seconds") {
      options.waitSeconds = positiveNumber(next(), flag);
    } else if (flag === "--interval-seconds") {
      options.intervalSeconds = positiveNumber(next(), flag);
    } else if (flag === "--timeout-seconds") {
      options.timeoutSeconds = positiveNumber(next(), flag);
    } else {
      throw new Error(`알 수 없는 옵션입니다: ${flag}`);
    }
  }

  const baseUrl = new URL(options.baseUrl);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(
    baseUrl.hostname
  );
  if (baseUrl.protocol !== "https:" && !localHost) {
    throw new Error("운영 검증 주소는 HTTPS여야 합니다.");
  }
  options.baseUrl = baseUrl.toString().replace(/\/$/, "");
  options.expectedContact = String(options.expectedContact).trim().toLowerCase();
  options.forbiddenContacts = [...new Set(
    options.forbiddenContacts
      .map((email) => String(email).trim().toLowerCase())
      .filter((email) => email && email !== options.expectedContact)
  )];
  return options;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseBody(response) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    // HTML and empty bodies are valid for redirect/legal checks.
  }
  return { text, json };
}

async function runProductionChecks(options, fetchImpl = globalThis.fetch) {
  requireCondition(typeof fetchImpl === "function", "fetch 구현이 필요합니다.");
  const results = [];
  const request = async (pathname, init = {}) => {
    const response = await fetchImpl(new URL(pathname, `${options.baseUrl}/`), {
      redirect: "manual",
      ...init,
      headers: {
        "user-agent": "matths-production-launch-verifier/1.0",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
    });
    return { response, ...(await responseBody(response)) };
  };
  const check = async (name, action) => {
    try {
      const detail = await action();
      results.push({ name, ok: true, detail: detail || "통과" });
    } catch (error) {
      results.push({ name, ok: false, detail: error.message });
    }
  };

  await check("liveness", async () => {
    const { response, json } = await request("api/v1/health");
    requireCondition(response.status === 200, `HTTP ${response.status}`);
    requireCondition(
      ["ok", "ready"].includes(json?.status),
      "status=ok/ready 응답이 아닙니다."
    );
    return `200 status=${json.status}`;
  });

  await check("readiness and security headers", async () => {
    const { response, json } = await request("api/v1/ready");
    requireCondition(response.status === 200, `HTTP ${response.status}`);
    requireCondition(json?.status === "ready", "status=ready 응답이 아닙니다.");
    for (const [header, expected] of [
      ["x-content-type-options", "nosniff"],
      ["x-frame-options", "DENY"],
    ]) {
      requireCondition(
        response.headers.get(header) === expected,
        `${header}=${expected}가 아닙니다.`
      );
    }
    requireCondition(
      response.headers.get("strict-transport-security")?.includes("max-age="),
      "HSTS가 없습니다."
    );
    return "200 status=ready + security headers";
  });

  await check("configured auth providers", async () => {
    const { response, json } = await request("api/v1/auth/providers");
    requireCondition(response.status === 200, `HTTP ${response.status}`);
    requireCondition(Array.isArray(json?.providers), "providers 배열이 없습니다.");
    const providers = new Map(json.providers.map((item) => [item.key, item]));
    for (const key of ["google", "kakao", "apple"]) {
      requireCondition(providers.get(key)?.configured === true, `${key} 비활성`);
    }
    requireCondition(providers.get("apple")?.revocable === true, "Apple 폐기 불가");
    return "Google/Kakao/Apple configured, Apple revocable";
  });

  const redirectCheck = async (pathname, expectedHost, expectedRedirectUri) => {
    const { response } = await request(pathname);
    requireCondition([301, 302, 303, 307, 308].includes(response.status), `HTTP ${response.status}`);
    const location = response.headers.get("location");
    requireCondition(location, "Location 헤더가 없습니다.");
    const target = new URL(location);
    requireCondition(target.hostname === expectedHost, `예상하지 못한 호스트: ${target.hostname}`);
    requireCondition(Boolean(target.searchParams.get("state")), "OAuth state가 없습니다.");
    requireCondition(
      target.searchParams.get("redirect_uri") === expectedRedirectUri,
      "운영 redirect_uri가 일치하지 않습니다."
    );
    const cookie = response.headers.get("set-cookie") || "";
    requireCondition(/HttpOnly/i.test(cookie), "OAuth 세션 쿠키에 HttpOnly가 없습니다.");
    requireCondition(/Secure/i.test(cookie), "OAuth 세션 쿠키에 Secure가 없습니다.");
    return `${response.status} ${expectedHost}`;
  };

  await check("Google web OAuth redirect", () => redirectCheck(
    "auth/google",
    "accounts.google.com",
    `${options.baseUrl}/auth/google/callback`
  ));
  await check("Kakao web OAuth redirect", () => redirectCheck(
    "auth/kakao",
    "kauth.kakao.com",
    `${options.baseUrl}/auth/kakao/callback`
  ));
  await check("Kakao app OAuth redirect", () => redirectCheck(
    `auth/kakao/app?code_challenge=${"a".repeat(43)}`,
    "kauth.kakao.com",
    `${options.baseUrl}/auth/kakao/callback`
  ));

  const safeReject = async (pathname, allowedStatuses, body = {}) => {
    const { response, json } = await request(pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    requireCondition(response.status !== 404, "route가 404입니다.");
    requireCondition(response.status < 500, `HTTP ${response.status}`);
    requireCondition(allowedStatuses.includes(response.status), `예상하지 못한 HTTP ${response.status}`);
    return `${response.status}${json?.code ? ` ${json.code}` : ""}`;
  };

  await check("social exchange route", () => safeReject(
    "api/v1/auth/social/exchange", [400, 401, 422]
  ));
  await check("Google legacy exchange route", () => safeReject(
    "api/v1/auth/google/exchange", [400, 401, 422]
  ));
  await check("Apple exchange route", () => safeReject(
    "api/v1/auth/apple/exchange", [400, 401, 422]
  ));

  await check("commerce storefront auth boundary", async () => {
    const { response, json } = await request("api/v1/commerce/storefront");
    requireCondition(response.status === 401, `HTTP ${response.status}`);
    requireCondition(json?.code === "UNAUTHORIZED", "UNAUTHORIZED 응답이 아닙니다.");
    return "401 UNAUTHORIZED";
  });
  await check("App Store notification route", () => safeReject(
    "api/v1/commerce/apple/notifications", [400]
  ));

  for (const legalPath of ["privacy", "terms"]) {
    await check(`${legalPath} public contact`, async () => {
      const { response, text } = await request(legalPath);
      requireCondition(response.status === 200, `HTTP ${response.status}`);
      const normalized = text.toLowerCase();
      requireCondition(
        normalized.includes(options.expectedContact),
        `${options.expectedContact}가 없습니다.`
      );
      for (const forbidden of options.forbiddenContacts) {
        requireCondition(!normalized.includes(forbidden), `${forbidden}가 노출됩니다.`);
      }
      return options.expectedContact;
    });
  }

  return results;
}

function printResults(results) {
  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.detail}`);
  }
}

async function verifyWithRetry(options) {
  const deadline = Date.now() + options.waitSeconds * 1000;
  let attempt = 0;
  let results;
  do {
    attempt += 1;
    results = await runProductionChecks(options);
    if (results.every((result) => result.ok)) {
      printResults(results);
      console.log(`Production launch verification passed (${attempt} attempt(s)).`);
      return results;
    }
    if (Date.now() >= deadline) break;
    const failed = results.filter((result) => !result.ok).map((result) => result.name);
    console.log(`운영 반영 대기 ${attempt}: ${failed.join(", ")}`);
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.max(1, options.intervalSeconds) * 1000
    ));
  } while (Date.now() <= deadline);

  printResults(results);
  throw new Error("Production launch verification failed.");
}

async function main() {
  const options = parseArguments();
  await verifyWithRetry(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_CONTACT_EMAIL,
  parseArguments,
  runProductionChecks,
  verifyWithRetry,
};

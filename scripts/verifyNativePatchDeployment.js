"use strict";
// Public, non-mutating probes: no credentials, valid registration data or provider authorization is sent.
const base = "https://www.matths.kr";
const probes = [
  { path: "/api/v1/ready", status: 200 },
  { path: "/api/v1/auth/portal/exchange", method: "POST", status: 400, code: "PORTAL_AUTH_EXPIRED" },
  { path: "/api/v1/parent-native/login", method: "POST", status: 400 },
  { path: "/api/v1/auth/academy/register", method: "POST", status: 400 },
  { path: "/api/v1/auth/native-social/kakao/start", method: "POST", status: 400, code: "NATIVE_SOCIAL_PKCE_REQUIRED" },
  { path: "/auth/portal-app/unsupported", status: 302, callback: true },
];
async function main() {
  let failed = 0;
  for (const probe of probes) {
    try {
      const response = await fetch(base + probe.path, { method: probe.method || "GET", redirect: "manual",
        signal: AbortSignal.timeout(15000), ...(probe.method ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}) });
      let valid = response.status === probe.status;
      if (probe.code) valid = valid && (await response.json()).code === probe.code;
      if (probe.callback) {
        const callback = new URL(response.headers.get("location") || "https://invalid.invalid");
        valid = valid && callback.protocol === "matths:" && callback.host === "portal-auth" && callback.pathname === "/callback" && callback.searchParams.has("error");
      }
      console.log(`${valid ? "PASS" : "FAIL"} ${probe.method || "GET"} ${probe.path}: HTTP ${response.status}`);
      if (!valid) failed += 1;
    } catch { failed += 1; console.log(`FAIL ${probe.path}: request did not complete`); }
  }
  console.log(failed ? "Native patch is not verified in production. Do not submit the dependent app update." : "Public deployment probes passed. Role-account and email end-to-end checks are still required.");
  process.exitCode = failed ? 1 : 0;
}
main();

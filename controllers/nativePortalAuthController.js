"use strict";
const { beginSocialAuthorization } = require("../services/socialAuthService");
const { beginAppleWebAuthorization } = require("../services/appleWebAuthService");
const portal = require("../services/nativePortalSocialService");
function callback(values) {
  const url = new URL("matths://portal-auth/callback");
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url.toString();
}
exports.callback = callback;
exports.start = async (req, res) => {
  res.set("Cache-Control", "no-store"); res.set("Referrer-Policy", "no-referrer");
  try {
    const provider = req.params.provider, accountType = req.query.accountType, codeChallenge = req.query.code_challenge;
    if (!["google", "kakao", "apple"].includes(provider) || !["parent", "academy"].includes(accountType) ||
        typeof codeChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new Error("Invalid portal request");
    const context = { accountType, codeChallenge, nativePortal: true };
    const url = provider === "apple" ? beginAppleWebAuthorization(context) : beginSocialAuthorization(req, provider, context);
    if (provider !== "apple") await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    return res.redirect(url);
  } catch { return res.redirect(callback({ error: "소셜 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." })); }
};
exports.exchange = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { return res.json(await portal.exchangePortalProof(req.body.ticket, req.body.codeVerifier)); }
  catch (error) { return next(error); }
};
exports.register = async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { return res.status(202).json(await portal.completePortalRegistration(req.body || {})); }
  catch (error) { return next(error); }
};

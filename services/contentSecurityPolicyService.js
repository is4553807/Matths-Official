const {
  serviceOrigins,
} = require("./serviceUrlService");

const INICIS_FORM_ACTION_SOURCE = "https://*.inicis.com";

function formActionDirective(environment = process.env) {
  const matthsServiceOrigins = Object.values(serviceOrigins(environment))
    .filter(Boolean);
  const allowedSources = [
    "'self'",
    ...new Set(matthsServiceOrigins),
    INICIS_FORM_ACTION_SOURCE,
  ];

  return `form-action ${allowedSources.join(" ")}`;
}

function sameOriginFramePolicy(policy = "") {
  const directives = String(policy).split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .filter((directive) => !/^frame-ancestors(?:\s|$)/i.test(directive));
  directives.push("frame-ancestors 'self'");
  return directives.join("; ");
}

// Only protected resources intentionally embedded by our own pages use this.
// Ordinary HTML pages retain DENY / frame-ancestors 'none'.
function allowSameOriginFraming(res) {
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Content-Security-Policy", sameOriginFramePolicy(res.get("Content-Security-Policy")));
}

module.exports = {
  allowSameOriginFraming,
  INICIS_FORM_ACTION_SOURCE,
  formActionDirective,
  sameOriginFramePolicy,
};

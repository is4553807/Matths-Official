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

module.exports = {
  INICIS_FORM_ACTION_SOURCE,
  formActionDirective,
};

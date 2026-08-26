const {
  normalizeLocale,
  translate,
} = require("../services/localizationService");

const LANGUAGE_COOKIE = "matths_language";
const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
const LOCALIZED_PAGE_PATHS = new Set([
  "/visual-learning",
  "/learning-flow",
  "/curriculum",
  "/intro",
  "/pricing",
  "/faq",
  "/goat-arena/rules/sub",
  "/goat-arena/rules/main",
]);

function normalizedRequestPath(req) {
  const rawPath = String(
    req.path ||
      new URL(
        String(req.originalUrl || req.url || "/"),
        "https://matths.local"
      ).pathname
  );
  return rawPath.length > 1
    ? rawPath.replace(/\/+$/, "")
    : rawPath;
}

function supportsLocalization(req) {
  return LOCALIZED_PAGE_PATHS.has(normalizedRequestPath(req));
}

function parseCookieHeader(header) {
  return String(header || "")
    .split(";")
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const key = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch (_error) {
        cookies[key] = rawValue;
      }
      return cookies;
    }, {});
}

function requestedLocale(req) {
  const queryLocale = String(req.query?.lang || "").trim();
  if (queryLocale) return normalizeLocale(queryLocale);

  const cookies = parseCookieHeader(req.headers.cookie);
  if (cookies[LANGUAGE_COOKIE]) {
    return normalizeLocale(cookies[LANGUAGE_COOKIE]);
  }
  if (req.session?.locale) return normalizeLocale(req.session.locale);

  const primaryBrowserLocale = String(req.headers["accept-language"] || "")
    .split(",")[0];
  return normalizeLocale(primaryBrowserLocale, "ko");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function languageUrl(req, locale) {
  const url = new URL(String(req.originalUrl || req.url || "/"), "https://matths.local");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

function languageSwitcher(req, locale) {
  const label = locale === "en" ? "Language" : "언어";
  return `
    <details class="matths-language-switcher" data-i18n-skip>
      <summary aria-label="${escapeHtml(label)}">
        <span aria-hidden="true">文</span><b>${locale.toUpperCase()}</b>
      </summary>
      <nav aria-label="${escapeHtml(label)}">
        <a href="${escapeHtml(languageUrl(req, "ko"))}" lang="ko" hreflang="ko"${locale === "ko" ? ' aria-current="page"' : ""}>한국어</a>
        <a href="${escapeHtml(languageUrl(req, "en"))}" lang="en" hreflang="en"${locale === "en" ? ' aria-current="page"' : ""}>English</a>
      </nav>
    </details>`;
}

function injectLocalization(html, req, res, locale) {
  if (!/<html\b/i.test(html) || html.includes("data-matths-localization")) {
    return html;
  }
  const assetVersion = encodeURIComponent(
    String(res.app?.locals?.assetVersion || "")
  );
  const versionQuery = assetVersion ? `?v=${assetVersion}` : "";
  return String(html)
    .replace(
      /<html\b([^>]*)\blang\s*=\s*(["'])[^"']*\2([^>]*)>/i,
      `<html$1lang="${locale}"$3 data-matths-localization>`
    )
    .replace(
      /<head([^>]*)>/i,
      `<head$1><link rel="stylesheet" href="/css/language-switcher.css${versionQuery}">`
    )
    .replace(
      /<body([^>]*)>/i,
      `<body$1>${languageSwitcher(req, locale)}`
    )
    .replace(
      /<\/body>/i,
      `<script src="/js/i18n.js${versionQuery}" defer data-locale="${locale}" data-asset-version="${assetVersion}"></script></body>`
    );
}

function localizationMiddleware(req, res, next) {
  const localizedPage = supportsLocalization(req);
  const locale = localizedPage ? requestedLocale(req) : "ko";
  const explicitLocale = String(req.query?.lang || "").trim();

  if (localizedPage && req.session && explicitLocale) {
    req.session.locale = locale;
  }
  if (localizedPage && explicitLocale) {
    res.cookie(LANGUAGE_COOKIE, locale, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: LANGUAGE_COOKIE_MAX_AGE,
      path: "/",
    });
  }

  res.locals.locale = locale;
  res.locals.htmlLang = locale;
  res.locals.t = (source, fallback) => translate(locale, source, fallback);

  const originalSend = res.send.bind(res);
  res.send = function localizedSend(body) {
    const isHtml = typeof body === "string" && /<html\b/i.test(body);
    if (isHtml) {
      res.set("Content-Language", locale);
      res.vary("Accept-Language");
      res.vary("Cookie");
    }
    const localizedBody = isHtml && localizedPage
      ? injectLocalization(body, req, res, locale)
      : body;
    return originalSend(localizedBody);
  };

  next();
}

module.exports = {
  LANGUAGE_COOKIE,
  LOCALIZED_PAGE_PATHS,
  injectLocalization,
  localizationMiddleware,
  requestedLocale,
  supportsLocalization,
};

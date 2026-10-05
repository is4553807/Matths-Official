"use strict";

const DEFAULT_GOOGLE_TAG_MANAGER_ID = "GTM-T9FC8Z4B";
const GOOGLE_TAG_MANAGER_ID_PATTERN = /^GTM-[A-Z0-9]+$/;
const COOKIE_CONSENT_VERSION = "2026-09-23";

function resolveGoogleTagManagerId(value = process.env.GOOGLE_TAG_MANAGER_ID) {
  const containerId = String(value || DEFAULT_GOOGLE_TAG_MANAGER_ID).trim();
  if (!GOOGLE_TAG_MANAGER_ID_PATTERN.test(containerId)) {
    throw new Error(
      "GOOGLE_TAG_MANAGER_ID must be a valid Google Tag Manager container ID (for example, GTM-XXXXXXX)."
    );
  }
  return containerId;
}

/*
 * GTM is intentionally loaded by the local consent controller instead of an
 * unconditional inline loader. This is Google Consent Mode's basic setup:
 * optional tags are not requested until the visitor has opted in.
 */
function googleTagManagerSnippets(
  containerId = resolveGoogleTagManagerId(),
  { analyticsEnabled = true } = {}
) {
  const id = resolveGoogleTagManagerId(containerId);
  const enabled = analyticsEnabled === true ? "true" : "false";
  return {
    head: `<!-- Matths cookie consent and consent-managed Google Tag Manager -->
<link rel="stylesheet" href="/css/cookie-consent.css" />
<script src="/js/cookie-consent.js" data-gtm-container="${id}" data-consent-version="${COOKIE_CONSENT_VERSION}" data-analytics-enabled="${enabled}"></script>
<!-- End Matths cookie consent and consent-managed Google Tag Manager -->`,
    body: `<!-- Matths cookie consent -->
<section class="cookie-consent-banner" data-cookie-consent-banner hidden role="dialog" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description">
  <div class="cookie-consent-banner__content">
    <div class="cookie-consent-banner__copy">
      <strong id="cookie-consent-title">쿠키 사용 안내</strong>
      <p id="cookie-consent-description">맵쓰는 로그인과 보안에 필요한 필수 쿠키를 사용합니다. 동의하시면 서비스 이용 현황을 분석하고 개선하기 위한 분석 쿠키를 추가로 사용합니다. 선택 쿠키를 거부해도 핵심 기능은 이용할 수 있습니다.</p>
      <a href="/privacy#privacy-6">자세히 보기</a>
    </div>
    <div class="cookie-consent-banner__actions">
      <button type="button" class="cookie-consent-button cookie-consent-button--secondary" data-cookie-consent-reject>필수 쿠키만 사용</button>
      <button type="button" class="cookie-consent-button cookie-consent-button--primary" data-cookie-consent-accept>모두 허용</button>
      <button type="button" class="cookie-consent-button cookie-consent-button--text" data-cookie-settings-open>설정</button>
    </div>
  </div>
</section>

<div class="cookie-settings" data-cookie-settings hidden>
  <button type="button" class="cookie-settings__backdrop" data-cookie-settings-close tabindex="-1" aria-label="쿠키 설정 닫기"></button>
  <section class="cookie-settings__dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title" aria-describedby="cookie-settings-description">
    <button type="button" class="cookie-settings__close" data-cookie-settings-close aria-label="쿠키 설정 닫기">×</button>
    <div class="cookie-settings__heading">
      <span>개인정보 선택</span>
      <h2 id="cookie-settings-title">쿠키 설정</h2>
      <p id="cookie-settings-description">서비스 운영에 꼭 필요한 항목은 항상 사용됩니다. 분석 쿠키는 직접 허용한 경우에만 사용합니다.</p>
    </div>
    <div class="cookie-settings__categories">
      <div class="cookie-settings__category">
        <div>
          <strong>필수 쿠키</strong>
          <p>로그인 유지, 보안, 결제 흐름 등 서비스 제공에 필요합니다.</p>
        </div>
        <span class="cookie-settings__required">항상 사용</span>
      </div>
      <label class="cookie-settings__category" for="cookie-analytics-consent">
        <div>
          <strong>분석 쿠키</strong>
          <p>Google Analytics 등으로 방문·이용 흐름을 통계로 파악해 서비스를 개선합니다.</p>
        </div>
        <span class="cookie-settings__switch">
          <input type="checkbox" id="cookie-analytics-consent" data-cookie-analytics-consent />
          <span aria-hidden="true"></span>
        </span>
      </label>
    </div>
    <div class="cookie-settings__actions">
      <button type="button" class="cookie-consent-button cookie-consent-button--secondary" data-cookie-settings-essential>필수 쿠키만 사용</button>
      <button type="button" class="cookie-consent-button cookie-consent-button--primary" data-cookie-settings-save>선택 저장</button>
    </div>
  </section>
</div>
<!-- End Matths cookie consent -->`,
  };
}

function injectGoogleTagManager(
  html,
  containerId = resolveGoogleTagManagerId(),
  options = {}
) {
  const id = resolveGoogleTagManagerId(containerId);
  const snippets = googleTagManagerSnippets(id, options);
  let document = String(html);

  if (!/<head\b[^>]*>/i.test(document) || !/<body\b[^>]*>/i.test(document)) {
    return document;
  }

  if (!document.includes("<!-- Matths cookie consent and consent-managed Google Tag Manager -->")) {
    document = document.replace(/<head\b[^>]*>/i, `$&\n${snippets.head}`);
  }
  if (!document.includes("<!-- Matths cookie consent -->")) {
    document = document.replace(/<\/body>/i, `${snippets.body}\n</body>`);
  }

  return document;
}

module.exports = {
  COOKIE_CONSENT_VERSION,
  DEFAULT_GOOGLE_TAG_MANAGER_ID,
  googleTagManagerSnippets,
  injectGoogleTagManager,
  resolveGoogleTagManagerId,
};

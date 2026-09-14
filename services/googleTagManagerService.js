"use strict";

const DEFAULT_GOOGLE_TAG_MANAGER_ID = "GTM-T9FC8Z4B";
const GOOGLE_TAG_MANAGER_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function resolveGoogleTagManagerId(value = process.env.GOOGLE_TAG_MANAGER_ID) {
  const containerId = String(value || DEFAULT_GOOGLE_TAG_MANAGER_ID).trim();
  if (!GOOGLE_TAG_MANAGER_ID_PATTERN.test(containerId)) {
    throw new Error(
      "GOOGLE_TAG_MANAGER_ID must be a valid Google Tag Manager container ID (for example, GTM-XXXXXXX)."
    );
  }
  return containerId;
}

function googleTagManagerSnippets(containerId = resolveGoogleTagManagerId()) {
  const id = resolveGoogleTagManagerId(containerId);
  return {
    head: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>
<!-- End Google Tag Manager -->`,
    body: `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
  };
}

function injectGoogleTagManager(html, containerId = resolveGoogleTagManagerId()) {
  const id = resolveGoogleTagManagerId(containerId);
  const snippets = googleTagManagerSnippets(id);
  let document = String(html);

  if (!document.includes("<!-- Google Tag Manager -->")) {
    document = document.replace(/<head\b[^>]*>/i, `$&\n${snippets.head}`);
  }
  if (!document.includes("<!-- Google Tag Manager (noscript) -->")) {
    document = document.replace(/<body\b[^>]*>/i, `$&\n${snippets.body}`);
  }

  return document;
}

module.exports = {
  DEFAULT_GOOGLE_TAG_MANAGER_ID,
  googleTagManagerSnippets,
  injectGoogleTagManager,
  resolveGoogleTagManagerId,
};

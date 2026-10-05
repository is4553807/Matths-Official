(function initializeMatthsCookieConsent() {
  "use strict";

  var controllerScript = document.currentScript;
  var containerId = controllerScript
    ? String(controllerScript.getAttribute("data-gtm-container") || "")
    : "";
  var consentVersion = controllerScript
    ? String(controllerScript.getAttribute("data-consent-version") || "")
    : "";
  var analyticsEnabled = Boolean(
    controllerScript &&
      controllerScript.getAttribute("data-analytics-enabled") === "true"
  );
  var storageKey = "matths.cookie-consent";
  var preferenceLifetimeMs = 180 * 24 * 60 * 60 * 1000;
  var lastFocusedElement = null;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  // Advertising consent remains denied because the current control only asks
  // for product analytics. Essential storage is handled by the Matths server.
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    personalization_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500,
  });
  window.gtag("set", "ads_data_redaction", true);
  window.gtag("set", "url_passthrough", false);

  function readPreference() {
    try {
      var value = JSON.parse(window.localStorage.getItem(storageKey));
      var updatedAt = Date.parse(value && value.updatedAt);
      var age = Date.now() - updatedAt;
      if (
        !value ||
        value.version !== consentVersion ||
        typeof value.analytics !== "boolean" ||
        !Number.isFinite(updatedAt) ||
        age < 0 ||
        age > preferenceLifetimeMs
      ) {
        return null;
      }
      return value;
    } catch (error) {
      return null;
    }
  }

  function writePreference(analytics) {
    var value = {
      version: consentVersion,
      analytics: analytics === true,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      // A private browser may block localStorage. The current-page choice still
      // applies, and the visitor will be asked again on a later page.
    }
    return value;
  }

  function updateGoogleConsent(analytics) {
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: analytics ? "granted" : "denied",
      personalization_storage: "denied",
    });
  }

  function loadGoogleTagManager() {
    if (
      !analyticsEnabled ||
      !/^GTM-[A-Z0-9]+$/.test(containerId) ||
      window.__matthsGoogleTagManagerLoaded
    ) {
      return;
    }

    window.__matthsGoogleTagManagerLoaded = true;
    window.dataLayer.push({
      "gtm.start": Date.now(),
      event: "gtm.js",
    });

    var tag = document.createElement("script");
    tag.async = true;
    tag.id = "matths-google-tag-manager";
    tag.src =
      "https://www.googletagmanager.com/gtm.js?id=" +
      encodeURIComponent(containerId);
    var firstScript = document.getElementsByTagName("script")[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(tag, firstScript);
    } else {
      document.head.appendChild(tag);
    }
  }

  function removeGoogleAnalyticsCookies() {
    var cookieNames = String(document.cookie || "")
      .split(";")
      .map(function getCookieName(cookie) {
        return cookie.split("=")[0].trim();
      })
      .filter(function isGoogleAnalyticsCookie(name) {
        return /^_(?:ga(?:_|$)|gid$|gat(?:_|$)|gac_)/.test(name);
      });
    var hostnameParts = String(window.location.hostname || "").split(".");
    var domains = [""];

    for (var index = 0; index < hostnameParts.length - 1; index += 1) {
      domains.push("." + hostnameParts.slice(index).join("."));
    }

    cookieNames.forEach(function removeCookie(name) {
      domains.forEach(function removeCookieFromDomain(domain) {
        document.cookie =
          name +
          "=; Max-Age=0; path=/; SameSite=Lax" +
          (domain ? "; domain=" + domain : "");
      });
    });
  }

  var initialPreference = readPreference();
  if (initialPreference && initialPreference.analytics) {
    updateGoogleConsent(true);
    loadGoogleTagManager();
  }

  function setupControls() {
    var banner = document.querySelector("[data-cookie-consent-banner]");
    var settings = document.querySelector("[data-cookie-settings]");
    var analyticsToggle = document.querySelector(
      "[data-cookie-analytics-consent]"
    );
    if (!banner || !settings || !analyticsToggle) return;

    var settingsDialog = settings.querySelector(".cookie-settings__dialog");

    function setHidden(element, hidden) {
      element.hidden = hidden;
      element.setAttribute("aria-hidden", hidden ? "true" : "false");
    }

    function hideSettings() {
      setHidden(settings, true);
      document.documentElement.classList.remove("cookie-settings-open");
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    function openSettings(event) {
      if (event) event.preventDefault();
      var currentPreference = readPreference();
      analyticsToggle.checked = Boolean(
        currentPreference && currentPreference.analytics
      );
      lastFocusedElement = document.activeElement;
      setHidden(settings, false);
      document.documentElement.classList.add("cookie-settings-open");
      var closeButton = settings.querySelector(".cookie-settings__close");
      if (closeButton) closeButton.focus();
    }

    function finishChoice(analytics) {
      var previousPreference = readPreference();
      var wasLoaded = Boolean(window.__matthsGoogleTagManagerLoaded);
      var nextPreference = writePreference(analytics);
      updateGoogleConsent(nextPreference.analytics);

      if (nextPreference.analytics) {
        loadGoogleTagManager();
      } else {
        removeGoogleAnalyticsCookies();
      }

      setHidden(banner, true);
      hideSettings();
      window.dispatchEvent(
        new CustomEvent("matths:cookie-consent-changed", {
          detail: { analytics: nextPreference.analytics },
        })
      );

      // Once a GTM container has executed it cannot be unloaded reliably.
      // Reload after revocation so the next document starts without GTM.
      if (
        previousPreference &&
        previousPreference.analytics &&
        !nextPreference.analytics &&
        wasLoaded
      ) {
        window.location.reload();
      }
    }

    document.querySelectorAll("[data-cookie-settings-open]").forEach(function bindOpen(button) {
      button.addEventListener("click", openSettings);
    });
    document.querySelectorAll("[data-cookie-settings-close]").forEach(function bindClose(button) {
      button.addEventListener("click", hideSettings);
    });

    var acceptButton = document.querySelector("[data-cookie-consent-accept]");
    var rejectButton = document.querySelector("[data-cookie-consent-reject]");
    var essentialButton = document.querySelector("[data-cookie-settings-essential]");
    var saveButton = document.querySelector("[data-cookie-settings-save]");

    if (acceptButton) {
      acceptButton.addEventListener("click", function acceptAll() {
        finishChoice(true);
      });
    }
    if (rejectButton) {
      rejectButton.addEventListener("click", function rejectOptional() {
        finishChoice(false);
      });
    }
    if (essentialButton) {
      essentialButton.addEventListener("click", function chooseEssential() {
        finishChoice(false);
      });
    }
    if (saveButton) {
      saveButton.addEventListener("click", function saveSettings() {
        finishChoice(analyticsToggle.checked);
      });
    }

    document.addEventListener("keydown", function handleSettingsKeyboard(event) {
      if (settings.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        hideSettings();
        return;
      }
      if (event.key !== "Tab" || !settingsDialog) return;

      var focusable = settingsDialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), a[href]'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    setHidden(banner, Boolean(readPreference()));
    setHidden(settings, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupControls, { once: true });
  } else {
    setupControls();
  }
})();

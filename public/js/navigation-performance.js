(() => {
  if (window.__matthsNavigationPerformance) return;
  window.__matthsNavigationPerformance = true;

  const prefetched = new Set();
  const pending = new WeakMap();
  const prefetchPaths = new Set([
    "/",
    "/intro",
    "/visual-learning",
    "/learning-flow",
    "/curriculum",
    "/faq",
    "/community",
    "/main",
    "/my-learning",
    "/log-curriculum",
    "/quick-practice",
    "/coach-suggestions",
  ]);
  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  const prefetchAllowed =
    !connection?.saveData &&
    !["slow-2g", "2g"].includes(
      String(connection?.effectiveType || "")
    );

  const style = document.createElement("style");
  style.textContent = `
    .matths-navigation-progress {
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 100000;
      width: 0;
      height: 3px;
      pointer-events: none;
      opacity: 0;
      background: linear-gradient(90deg, #3157f6, #7c5cff, #20a078);
      box-shadow: 0 0 14px rgba(49, 87, 246, 0.45);
      transition: opacity 120ms ease, width 180ms ease;
    }
    html.matths-is-navigating .matths-navigation-progress {
      width: 76%;
      opacity: 1;
      animation: matths-navigation-progress 1.1s ease-in-out infinite alternate;
    }
    @keyframes matths-navigation-progress {
      from { transform: translateX(-12%); }
      to { transform: translateX(32%); }
    }
    @media (prefers-reduced-motion: reduce) {
      html.matths-is-navigating .matths-navigation-progress { animation: none; }
    }
  `;
  document.head.append(style);

  const progress = document.createElement("div");
  progress.className = "matths-navigation-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);

  function navigationUrl(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return null;
    if (
      anchor.target &&
      anchor.target !== "_self"
    ) return null;
    if (anchor.hasAttribute("download")) return null;
    if (anchor.dataset.noPrefetch !== undefined) return null;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash
    ) return null;
    if (
      /^(?:\/api\/|\/auth\/|\/payments\/)/.test(
        url.pathname
      )
    ) return null;
    return url;
  }

  function navigationAnchor(target) {
    const anchor = target?.closest?.("nav a[href]");
    return navigationUrl(anchor) ? anchor : null;
  }

  function prefetch(anchor) {
    if (!prefetchAllowed || prefetched.size >= 3) return;
    const url = navigationUrl(anchor);
    if (
      !url ||
      !prefetchPaths.has(url.pathname) ||
      prefetched.has(url.href)
    ) return;

    prefetched.add(url.href);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = url.href;
    link.fetchPriority = "low";
    document.head.append(link);
  }

  function schedulePrefetch(anchor, delay = 140) {
    if (!anchor || pending.has(anchor)) return;
    const timer = window.setTimeout(() => {
      pending.delete(anchor);
      prefetch(anchor);
    }, delay);
    pending.set(anchor, timer);
  }

  function cancelPrefetch(anchor) {
    const timer = anchor && pending.get(anchor);
    if (!timer) return;
    window.clearTimeout(timer);
    pending.delete(anchor);
  }

  function beginNavigation() {
    document.documentElement.classList.add(
      "matths-is-navigating"
    );
    document.documentElement.setAttribute(
      "aria-busy",
      "true"
    );
  }

  function resetNavigation() {
    document.documentElement.classList.remove(
      "matths-is-navigating"
    );
    document.documentElement.removeAttribute(
      "aria-busy"
    );
  }

  document.addEventListener("pointerover", (event) => {
    schedulePrefetch(navigationAnchor(event.target));
  });
  document.addEventListener("pointerout", (event) => {
    const anchor = navigationAnchor(event.target);
    if (
      anchor &&
      !anchor.contains(event.relatedTarget)
    ) {
      cancelPrefetch(anchor);
    }
  });
  document.addEventListener("focusin", (event) => {
    schedulePrefetch(
      navigationAnchor(event.target),
      0
    );
  });
  document.addEventListener(
    "touchstart",
    (event) => {
      schedulePrefetch(
        navigationAnchor(event.target),
        0
      );
    },
    { passive: true }
  );
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;
    if (!navigationAnchor(event.target)) return;
    beginNavigation();
    window.setTimeout(resetNavigation, 8_000);
  });
  window.addEventListener("pageshow", resetNavigation);
})();

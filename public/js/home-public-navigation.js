document.addEventListener("DOMContentLoaded", () => {
  const clusters = Array.from(
    document.querySelectorAll("[data-public-nav-cluster]")
  );
  const mobileMenu = document.querySelector(
    "[data-public-mobile-menu]"
  );
  const mobileToggle = mobileMenu?.querySelector(
    "[data-public-mobile-toggle]"
  );

  const syncCluster = (cluster) => {
    const toggle = cluster.querySelector(
      "[data-public-nav-toggle]"
    );
    toggle?.setAttribute(
      "aria-expanded",
      String(cluster.open)
    );
  };

  const closeCluster = (cluster) => {
    if (cluster.open) cluster.open = false;
    syncCluster(cluster);
  };

  const closeClusters = (except = null) => {
    clusters.forEach((cluster) => {
      if (cluster !== except) closeCluster(cluster);
    });
  };

  const syncMobileMenu = () => {
    if (!mobileMenu || !mobileToggle) return;
    mobileToggle.setAttribute(
      "aria-expanded",
      String(mobileMenu.open)
    );
    mobileToggle.setAttribute(
      "aria-label",
      mobileMenu.open ? "메뉴 닫기" : "메뉴 열기"
    );
    document.documentElement.classList.toggle(
      "public-menu-open",
      mobileMenu.open
    );
  };

  const closeMobileMenu = () => {
    if (!mobileMenu) return;
    if (mobileMenu.open) mobileMenu.open = false;
    syncMobileMenu();
  };

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) closeMobileMenu();
  });

  clusters.forEach((cluster) => {
    const toggle = cluster.querySelector(
      "[data-public-nav-toggle]"
    );

    toggle?.addEventListener("click", () => {
      if (!cluster.open) closeClusters(cluster);
      closeMobileMenu();
    });

    cluster.addEventListener("toggle", () => {
      if (cluster.open) {
        closeClusters(cluster);
        closeMobileMenu();
      }
      syncCluster(cluster);
    });

    syncCluster(cluster);
  });

  mobileMenu?.addEventListener("toggle", () => {
    if (mobileMenu.open) closeClusters();
    syncMobileMenu();
  });
  syncMobileMenu();

  document.addEventListener("focusin", (event) => {
    const focusedCluster = event.target.closest?.(
      "[data-public-nav-cluster]"
    );

    if (focusedCluster) {
      closeClusters(focusedCluster);
      return;
    }

    if (!event.target.closest?.("[data-public-mobile-menu]")) {
      closeClusters();
      closeMobileMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-public-nav-cluster]")) {
      return;
    }
    if (event.target.closest?.("[data-public-mobile-menu]")) {
      return;
    }

    closeClusters();
    closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    const openToggle = clusters
      .find((cluster) => cluster.open)
      ?.querySelector("[data-public-nav-toggle]");
    const wasMobileOpen = Boolean(mobileMenu?.open);

    closeClusters();
    closeMobileMenu();

    if (openToggle instanceof HTMLElement) {
      openToggle.focus();
    } else if (
      wasMobileOpen &&
      mobileToggle instanceof HTMLElement
    ) {
      mobileToggle.focus();
    }
  });
});

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const roots = [
      ...document.querySelectorAll(
        "[data-tier-ranking-root]"
      ),
    ];

    function centerCurrentRank(
      panel
    ) {
      const scroll =
        panel?.querySelector(
          "[data-ranking-scroll]"
        );
      const current =
        panel?.querySelector(
          "[data-current-ranker]"
        );

      if (!scroll || !current) {
        return;
      }

      requestAnimationFrame(
        () => {
          scroll.scrollTop =
            Math.max(
              0,
              current.offsetTop -
                scroll.clientHeight /
                  2 +
                current.clientHeight /
                  2
            );
        }
      );
    }

    roots.forEach((root) => {
      const poolTabs = [
        ...root.querySelectorAll(
          "[data-pool-tab]"
        ),
      ];
      const poolPanels = [
        ...root.querySelectorAll(
          "[data-pool-panel]"
        ),
      ];

      function activatePool(
        poolKey,
        focus = false
      ) {
        poolTabs.forEach(
          (tab) => {
            const active =
              tab.dataset
                .poolTab ===
              poolKey;

            tab.setAttribute(
              "aria-selected",
              String(active)
            );
            tab.tabIndex =
              active ? 0 : -1;

            if (
              active &&
              focus
            ) {
              tab.focus();
            }
          }
        );

        poolPanels.forEach(
          (panel) => {
            const active =
              panel.dataset
                .poolPanel ===
              poolKey;

            panel.hidden =
              !active;

            if (active) {
              centerCurrentRank(
                panel.querySelector(
                  "[data-tier-panel]:not([hidden])"
                )
              );
            }
          }
        );
      }

      poolTabs.forEach(
        (tab, index) => {
          tab.addEventListener(
            "click",
            () =>
              activatePool(
                tab.dataset.poolTab
              )
          );

          tab.addEventListener(
            "keydown",
            (event) => {
              let nextIndex =
                index;

              if (
                event.key ===
                "ArrowRight"
              ) {
                nextIndex =
                  (
                    index + 1
                  ) %
                  poolTabs.length;
              } else if (
                event.key ===
                "ArrowLeft"
              ) {
                nextIndex =
                  (
                    index -
                    1 +
                    poolTabs.length
                  ) %
                  poolTabs.length;
              } else {
                return;
              }

              event.preventDefault();
              activatePool(
                poolTabs[
                  nextIndex
                ].dataset
                  .poolTab,
                true
              );
            }
          );
        }
      );

      root
        .querySelectorAll(
          "[data-tier-select]"
        )
        .forEach(
          (select) => {
            select.addEventListener(
              "change",
              () => {
                const poolKey =
                  select.dataset
                    .tierSelect;
                const panelKey =
                  `${poolKey}:${select.value}`;
                const poolPanel =
                  root.querySelector(
                    `[data-pool-panel="${poolKey}"]`
                  );

                poolPanel
                  ?.querySelectorAll(
                    "[data-tier-panel]"
                  )
                  .forEach(
                    (panel) => {
                      panel.hidden =
                        panel.dataset
                          .tierPanel !==
                        panelKey;

                      if (
                        !panel.hidden
                      ) {
                        centerCurrentRank(
                          panel
                        );
                      }
                    }
                  );
              }
            );
          }
        );

      const selectedTab =
        poolTabs.find(
          (tab) =>
            tab.getAttribute(
              "aria-selected"
            ) === "true"
        ) || poolTabs[0];

      if (selectedTab) {
        activatePool(
          selectedTab.dataset
            .poolTab
        );
      }
    });
  }
);

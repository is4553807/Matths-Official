document.addEventListener(
  "DOMContentLoaded",
  () => {
    function escapeMarkup(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function centerCurrentRank(
      container
    ) {
      const scroll =
        container?.matches?.(
          "[data-ranking-scroll]"
        )
          ? container
          : container?.querySelector(
              "[data-ranking-scroll]"
            );
      const current =
        scroll?.querySelector(
          "[data-current-ranker]"
        );

      if (
        !scroll ||
        !current ||
        scroll.closest("[hidden]")
      ) {
        return;
      }

      requestAnimationFrame(
        () => {
          requestAnimationFrame(
            () => {
              const scrollRect =
                scroll.getBoundingClientRect();
              const currentRect =
                current.getBoundingClientRect();
              const currentCenter =
                scroll.scrollTop +
                currentRect.top -
                scrollRect.top +
                currentRect.height / 2;
              const maximumScroll =
                Math.max(
                  0,
                  scroll.scrollHeight -
                    scroll.clientHeight
                );

              scroll.scrollTop =
                Math.min(
                  maximumScroll,
                  Math.max(
                    0,
                    currentCenter -
                      scroll.clientHeight /
                        2
                  )
                );
            }
          );
        }
      );
    }

    function scrollRowToCenter(scroll, row) {
      if (!scroll || !row || row.hidden) return;
      const scrollRect = scroll.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const rowCenter =
        scroll.scrollTop +
        rowRect.top -
        scrollRect.top +
        rowRect.height / 2;
      const target = Math.max(
        0,
        Math.min(
          scroll.scrollHeight - scroll.clientHeight,
          rowCenter - scroll.clientHeight / 2
        )
      );
      scroll.scrollTo({ top: target, behavior: "smooth" });
      row.classList.add("is-ranking-target");
      window.setTimeout(() => row.classList.remove("is-ranking-target"), 1400);
    }

    function enhanceRankingScroll(scroll) {
      if (!scroll || scroll.dataset.rankingEnhanced === "true") return;
      const rows = [...scroll.querySelectorAll("[data-ranking-row]")];
      if (!rows.length) return;
      scroll.dataset.rankingEnhanced = "true";
      const current = scroll.querySelector("[data-current-ranker]");
      const filterMode = scroll.dataset.rankingFilters || "full";
      const useDivisionFilter = filterMode === "full";
      const useSchoolFilter = useDivisionFilter && Boolean(scroll.dataset.currentSchool);
      const toolbar = document.createElement("div");
      toolbar.className = "ranking-list-tools";
      toolbar.dataset.filterMode = filterMode;
      toolbar.innerHTML = `
        <label><span>순위·이름 찾기</span><input type="search" inputmode="search" placeholder="예: 25 또는 닉네임" data-ranking-query /></label>
        ${useDivisionFilter ? `<label><span>Division</span><select data-ranking-division><option value="">전체</option><option value="SUB">Unranked</option><option value="MAIN">Ranked</option></select></label>` : ""}
        ${useSchoolFilter ? `<label><span>소속</span><select data-ranking-school><option value="">전체</option><option value="${escapeMarkup(scroll.dataset.currentSchool)}">내 학교</option></select></label>` : ""}
        <button type="button" data-ranking-find>찾기</button>
        <button type="button" class="ranking-my-position" data-ranking-my-position ${current ? "" : "disabled"}>내 순위로 이동</button>
        <output data-ranking-tool-status aria-live="polite"></output>
      `;
      scroll.before(toolbar);

      if (current) {
        const rank = current.dataset.rank || "-";
        const name = current.dataset.name || "나";
        const delta = Number(current.dataset.rankDelta || 0);
        const mini = document.createElement("button");
        mini.type = "button";
        mini.className = "ranking-sticky-me";
        mini.innerHTML = `<span>내 현재 위치</span><strong>${escapeMarkup(rank)}위 · ${escapeMarkup(name)}</strong><em>${delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : "변동 없음"}</em>`;
        mini.addEventListener("click", () => scrollRowToCenter(scroll, current));
        toolbar.after(mini);
      }

      const query = toolbar.querySelector("[data-ranking-query]");
      const division = toolbar.querySelector("[data-ranking-division]");
      const school = toolbar.querySelector("[data-ranking-school]");
      const status = toolbar.querySelector("[data-ranking-tool-status]");
      const myPosition = toolbar.querySelector("[data-ranking-my-position]");
      const visibleRows = () => rows.filter((row) => !row.hidden);
      if (school) {
        const schools = [...new Set(rows.map((row) => row.dataset.school).filter(Boolean))]
          .sort((left, right) => left.localeCompare(right, "ko"));
        schools.forEach((schoolName) => {
          if ([...school.options].some((option) => option.value === schoolName)) return;
          const option = document.createElement("option");
          option.value = schoolName;
          option.textContent = schoolName;
          school.append(option);
        });
        try {
          const savedSchool = window.localStorage.getItem(
            `matths-ranking-school:${scroll.dataset.rankingKind || "ranking"}`
          );
          if (savedSchool && [...school.options].some((option) => option.value === savedSchool)) {
            school.value = savedSchool;
          }
        } catch (_error) {}
      }

      function applyFilters() {
        rows.forEach((row) => {
          const divisionMatch = !division?.value || row.dataset.division === division.value;
          const schoolMatch = !school?.value || row.dataset.school === school.value;
          row.hidden = !(divisionMatch && schoolMatch);
        });
        const count = visibleRows().length;
        if (status) status.value = `${count}명 표시`;
        const head = scroll.querySelector(".tier-ranking-head, .arena-final-ranking-head");
        if (head) head.hidden = count === 0;
      }

      function findRanking() {
        const value = String(query?.value || "").trim().toLocaleLowerCase("ko-KR");
        if (!value) {
          if (status) status.value = "순위 또는 이름을 입력해 주세요.";
          query?.focus();
          return;
        }
        const byRank = /^\d+$/.test(value);
        const row = visibleRows().find((candidate) =>
          byRank
            ? candidate.dataset.rank === value
            : String(candidate.dataset.name || "").toLocaleLowerCase("ko-KR").includes(value)
        );
        if (!row) {
          if (status) status.value = "현재 목록에서 찾지 못했습니다.";
          return;
        }
        if (status) status.value = `${row.dataset.rank}위 ${row.dataset.name} 위치로 이동했습니다.`;
        scrollRowToCenter(scroll, row);
      }

      division?.addEventListener("change", applyFilters);
      school?.addEventListener("change", () => {
        try {
          window.localStorage.setItem(
            `matths-ranking-school:${scroll.dataset.rankingKind || "ranking"}`,
            school.value
          );
        } catch (_error) {}
        applyFilters();
      });
      toolbar.querySelector("[data-ranking-find]")?.addEventListener("click", findRanking);
      query?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          findRanking();
        }
      });
      myPosition?.addEventListener("click", () => scrollRowToCenter(scroll, current));
      if (current) {
        scroll.addEventListener(
          "scroll",
          () => {
            const distance = Math.abs(
              current.offsetTop + current.offsetHeight / 2 -
                (scroll.scrollTop + scroll.clientHeight / 2)
            );
            myPosition?.classList.toggle("is-away", distance > scroll.clientHeight * 0.7);
          },
          { passive: true }
        );
      }
      applyFilters();
    }

    document.querySelectorAll("[data-ranking-freshness]").forEach((status) => {
      const updatedAt = new Date(status.dataset.updatedAt || 0).getTime();
      if (!updatedAt || Date.now() - updatedAt > 15 * 60 * 1000) {
        status.classList.add("is-stale");
        status.insertAdjacentHTML(
          "afterbegin",
          "<b>갱신 지연 가능</b>"
        );
      }
    });
    document.querySelectorAll("[data-ranking-retry]").forEach((button) => {
      button.addEventListener("click", () => window.location.reload());
    });

    const roots = [
      ...document.querySelectorAll(
        "[data-tier-ranking-root]"
      ),
    ];

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

    const finalRankingRoots = [
      ...document.querySelectorAll(
        "[data-final-ranking-tabs]"
      ),
    ];

    finalRankingRoots.forEach(
      (root) => {
        const tabs = [
          ...root.querySelectorAll(
            "[data-final-ranking-tab]"
          ),
        ];
        const panels = [
          ...root.querySelectorAll(
            "[data-final-ranking-panel]"
          ),
        ];

        function activateFinalRanking(
          panelKey
        ) {
          tabs.forEach(
            (tab) => {
              const active =
                tab.dataset
                  .finalRankingTab ===
                panelKey;
              tab.setAttribute(
                "aria-selected",
                String(active)
              );
              tab.tabIndex =
                active ? 0 : -1;
            }
          );

          panels.forEach(
            (panel) => {
              panel.hidden =
                panel.dataset
                  .finalRankingPanel !==
                panelKey;

              if (!panel.hidden) {
                panel
                  .querySelectorAll(
                    "[data-ranking-scroll]"
                  )
                  .forEach(
                    centerCurrentRank
                  );
              }
            }
          );
        }

        tabs.forEach(
          (tab) => {
            tab.addEventListener(
              "click",
              () =>
                activateFinalRanking(
                  tab.dataset
                    .finalRankingTab
                )
            );
          }
        );

        const selectedTab =
          tabs.find(
            (tab) =>
              tab.getAttribute(
                "aria-selected"
              ) === "true"
          ) || tabs[0];

        if (selectedTab) {
          activateFinalRanking(
            selectedTab.dataset
              .finalRankingTab
          );
        }
      }
    );

    document
      .querySelectorAll(
        "[data-ranking-scroll]"
      )
      .forEach((scroll) => {
        enhanceRankingScroll(scroll);
        centerCurrentRank(scroll);
      });
    document.documentElement.classList.add("ranking-ui-ready");
  }
);

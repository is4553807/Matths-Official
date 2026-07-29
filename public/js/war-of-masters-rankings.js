document.addEventListener(
  "DOMContentLoaded",
  () => {
    const tabs = [
      ...document.querySelectorAll(
        "[data-ranking-tab]"
      ),
    ];
    const panels = [
      ...document.querySelectorAll(
        "[data-ranking-panel]"
      ),
    ];
    const boardTitle =
      document.getElementById(
        "ranking-board-title"
      );
    const labels = {
      overall: "전체 랭킹",
      "same-school":
        "학교 내 학생 랭킹",
      schools: "고등학교 랭킹",
      cities: "도시·지역 랭킹",
    };

    tabs.forEach((tab) => {
      tab.addEventListener(
        "click",
        () => {
          const target =
            tab.dataset
              .rankingTab;

          tabs.forEach(
            (item) => {
              item.setAttribute(
                "aria-selected",
                String(
                  item === tab
                )
              );
            }
          );
          panels.forEach(
            (panel) => {
              panel.hidden =
                panel.dataset
                  .rankingPanel !==
                target;
            }
          );

          if (boardTitle) {
            boardTitle.textContent =
              labels[target] ||
              "랭킹";
          }
        }
      );
    });
  }
);

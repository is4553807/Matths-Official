(() => {
  const toggle =
    document.querySelector(
      "[data-archive-selection-toggle]"
    );
  const bulkButton =
    document.querySelector(
      "[data-archive-bulk-delete]"
    );
  const count =
    document.querySelector(
      "[data-archive-selected-count]"
    );
  const list =
    document.querySelector(
      ".archive-list"
    );
  const form =
    document.querySelector(
      "[data-archive-bulk-form]"
    );
  const moveButton =
    document.querySelector(
      "[data-archive-bulk-move]"
    );
  const moveCount =
    document.querySelector(
      "[data-archive-move-count]"
    );
  const selectAll =
    document.querySelector(
      "[data-archive-select-all]"
    );
  const bulkControls = [
    ...document.querySelectorAll(
      "[data-archive-bulk-control]"
    ),
  ];

  if (
    !toggle ||
    !bulkButton ||
    !list
  ) {
    return;
  }

  const checkboxes = [
    ...document.querySelectorAll(
      '.archive-file-select input[type="checkbox"]'
    ),
  ];

  const refresh = () => {
    const selected =
      checkboxes.filter(
        (checkbox) =>
          checkbox.checked
      ).length;

    count.textContent =
      String(selected);
    if (moveCount) {
      moveCount.textContent =
        String(selected);
    }
    bulkButton.disabled =
      selected === 0;
    if (moveButton) {
      moveButton.disabled =
        selected === 0;
    }
    if (selectAll) {
      selectAll.checked =
        selected > 0 &&
        selected ===
          checkboxes.length;
      selectAll.indeterminate =
        selected > 0 &&
        selected <
          checkboxes.length;
    }
  };

  toggle.addEventListener(
    "click",
    () => {
      const active =
        document.body.classList.toggle(
          "archive-selection-mode"
        );

      toggle.textContent =
        active
          ? "선택 취소"
          : "선택";
      bulkButton.hidden =
        !active;
      if (moveButton) {
        moveButton.hidden =
          !active;
      }
      bulkControls.forEach(
        (control) => {
          control.hidden =
            !active;
        }
      );

      if (!active) {
        checkboxes.forEach(
          (checkbox) => {
            checkbox.checked =
              false;
          }
        );
      }
      refresh();
    }
  );

  checkboxes.forEach(
    (checkbox) =>
      checkbox.addEventListener(
        "change",
        refresh
      )
  );

  selectAll?.addEventListener(
    "change",
    () => {
      checkboxes.forEach(
        (checkbox) => {
          checkbox.checked =
            selectAll.checked;
        }
      );
      refresh();
    }
  );

  form?.addEventListener(
    "submit",
    (event) => {
      const selected =
        checkboxes.filter(
          (checkbox) =>
            checkbox.checked
        ).length;

      if (!selected) {
        event.preventDefault();
        return;
      }

      if (
        event.submitter ===
          bulkButton &&
        !window.confirm(
          "선택한 자료를 휴지통으로 이동할까요? 30일 동안 복구할 수 있습니다."
        )
      ) {
        event.preventDefault();
      }
    }
  );

  refresh();
})();

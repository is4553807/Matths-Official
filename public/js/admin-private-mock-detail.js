(() => {
  const form =
    document.querySelector(
      "[data-answer-correction-form]"
    );
  if (!form) return;

  const rows =
    form.querySelector(
      "[data-answer-correction-rows]"
    );
  const addButton =
    form.querySelector(
      "[data-add-correction]"
    );

  const refresh = () => {
    const items = [
      ...rows.querySelectorAll(
        "[data-answer-correction-row]"
      ),
    ];
    items.forEach(
      (item, index) => {
        item.querySelector(
          "legend"
        ).textContent =
          `정정 문항 ${index + 1}`;
        const remove =
          item.querySelector(
            "[data-remove-correction]"
          );
        remove.hidden =
          items.length === 1;
      }
    );
  };

  addButton.addEventListener(
    "click",
    () => {
      const template =
        rows.querySelector(
          "[data-answer-correction-row]"
        );
      const clone =
        template.cloneNode(true);
      clone
        .querySelectorAll(
          "input, textarea"
        )
        .forEach(
          (field) => {
            field.value = "";
          }
        );
      rows.appendChild(clone);
      refresh();
      clone
        .querySelector(
          "input"
        )
        .focus();
    }
  );

  rows.addEventListener(
    "click",
    (event) => {
      const remove =
        event.target.closest(
          "[data-remove-correction]"
        );
      if (!remove) return;
      remove
        .closest(
          "[data-answer-correction-row]"
        )
        .remove();
      refresh();
    }
  );

  form.addEventListener(
    "submit",
    (event) => {
      const confirmed =
        window.confirm(
          "정답을 저장하면 전체 응시 기록과 시즌 MMR을 다시 계산하고 모든 응시자에게 안내합니다. 실행할까요?"
        );
      if (!confirmed) {
        event.preventDefault();
      }
    }
  );

  refresh();
})();

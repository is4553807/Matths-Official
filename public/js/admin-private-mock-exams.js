(() => {
  const list =
    document.querySelector(
      "[data-private-mock-batch-list]"
    );
  const addButton =
    document.querySelector(
      "[data-private-mock-add]"
    );
  const form =
    document.querySelector(
      "[data-private-mock-batch-form]"
    );
  const uploadStatus =
    document.querySelector(
      "[data-private-mock-upload-status]"
    );
  const scheduleLabels = {
    A: "오후 3:00 ~ 오후 4:40",
    B: "오후 6:00 ~ 오후 7:40",
    C: "오후 9:00 ~ 오후 10:40",
    CUSTOM:
      "운영자 지정 시간 · 100분",
  };
  const formCodes = [
    "A",
    "B",
    "C",
  ];

  if (!list || !addButton) {
    return;
  }

  const nextSundayDate = (
    dateValue
  ) => {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(
        String(dateValue || "")
      );

    if (!match) return "";

    const date = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]) + 7
      )
    );

    return Number.isNaN(
      date.getTime()
    )
      ? ""
      : date
          .toISOString()
          .slice(0, 10);
  };

  const updateScheduleLabel = (
    row
  ) => {
    const formCode =
      row.querySelector(
        "[data-private-mock-form-code]"
      )?.value || "A";
    const target =
      row.querySelector(
        "[data-private-mock-fixed-time]"
      );
    const dateInput =
      row.querySelector(
        "[data-private-mock-exam-date]"
      );
    const dateGuide =
      row.querySelector(
        "[data-private-mock-date-guide]"
      );
    const officialDateLabel =
      row.querySelector(
        "[data-private-mock-official-date]"
      );
    const customTimeLabel =
      row.querySelector(
        "[data-private-mock-custom-time]"
      );
    const customReleaseInput =
      row.querySelector(
        "[data-private-mock-custom-release]"
      );
    const timeTitle =
      row.querySelector(
        "[data-private-mock-time-title]"
      );
    const timeNote =
      row.querySelector(
        "[data-private-mock-time-note]"
      );
    const isCustom =
      formCode === "CUSTOM";

    if (dateInput) {
      row.dataset.officialDate =
        dateInput.value;
      dateInput.required = !isCustom;
    }
    if (officialDateLabel) {
      officialDateLabel.hidden = isCustom;
    }
    if (customTimeLabel) {
      customTimeLabel.hidden = !isCustom;
    }
    if (customReleaseInput) {
      customReleaseInput.disabled = false;
      customReleaseInput.required = isCustom;
    }
    if (dateGuide) {
      dateGuide.textContent =
        "한국시간 기준 일요일만 등록할 수 있습니다.";
    }
    if (timeTitle) {
      timeTitle.textContent = isCustom
        ? "CUSTOM 응시 시간"
        : "고정 응시 시간";
    }
    if (timeNote) {
      timeNote.textContent = isCustom
        ? "100분 · 한국시간 · 날짜와 시작 시각 직접 지정"
        : "100분 · 한국시간 · 수정할 수 없음";
    }

    if (target) {
      target.textContent =
        scheduleLabels[
          formCode
        ] ||
        scheduleLabels.A;
    }
  };

  const refreshRows = () => {
    const rows = [
      ...list.querySelectorAll(
        "[data-private-mock-batch-row]"
      ),
    ];

    rows.forEach(
      (row, index) => {
        const number =
          row.querySelector(
            "[data-private-mock-batch-number]"
          );
        const remove =
          row.querySelector(
            "[data-private-mock-remove]"
          );

        if (number) {
          number.textContent =
            String(index + 1);
        }
        if (remove) {
          remove.hidden =
            rows.length === 1;
        }
        updateScheduleLabel(row);
      }
    );
    addButton.disabled =
      rows.length >= 10;
  };

  addButton.addEventListener(
    "click",
    () => {
      const rows = [
        ...list.querySelectorAll(
          "[data-private-mock-batch-row]"
        ),
      ];

      if (rows.length >= 10) {
        return;
      }

      const previous =
        rows[rows.length - 1];
      const clone =
        previous.cloneNode(true);
      const previousCode =
        previous.querySelector(
          '[name="formCodes"]'
        )?.value || "A";
      const previousDate =
        previous.querySelector(
          '[name="examDates"]'
        )?.value || "";
      const previousOfficialDate =
        previous.dataset
          .officialDate ||
        previousDate;
      const nextIndex =
        (
          formCodes.indexOf(
            previousCode
          ) + 1
        ) %
        formCodes.length;
      const nextCode =
        formCodes[nextIndex];

      clone
        .querySelectorAll(
          "input"
        )
        .forEach((input) => {
          if (
            input.name ===
            "examDates"
          ) {
            input.value =
              previousCode === "C"
                ? nextSundayDate(
                    previousOfficialDate
                  )
                : previousOfficialDate;
          } else {
            input.value = "";
          }
        });

      const formSelect =
        clone.querySelector(
          '[name="formCodes"]'
        );
      if (formSelect) {
        formSelect.value =
          nextCode;
      }

      list.appendChild(clone);
      refreshRows();
    }
  );

  list.addEventListener(
    "change",
    (event) => {
      if (
        event.target.matches(
          "[data-private-mock-form-code]"
        )
      ) {
        updateScheduleLabel(
          event.target.closest(
            "[data-private-mock-batch-row]"
          )
        );
      }
    }
  );

  form?.addEventListener(
    "invalid",
    () => {
      if (!uploadStatus) {
        return;
      }
      uploadStatus.hidden =
        false;
      uploadStatus.textContent =
        "등록할 모든 회차의 이름·날짜·시험형·문제지 PDF·답지 JSON을 확인해 주세요.";
      uploadStatus.classList.add(
        "error"
      );
    },
    true
  );

  form?.addEventListener(
    "submit",
    (event) => {
      if (
        !form.checkValidity()
      ) {
        event.preventDefault();
        form.reportValidity();
        return;
      }

      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );
      if (submitButton) {
        submitButton.disabled =
          true;
        submitButton.textContent =
          "파일 검증 및 업로드 중…";
      }
      if (uploadStatus) {
        uploadStatus.hidden =
          false;
        uploadStatus.textContent =
          "파일을 업로드하고 답지 JSON을 검증하고 있습니다. 완료될 때까지 창을 닫지 마세요.";
        uploadStatus.classList.remove(
          "error"
        );
      }
      form.setAttribute(
        "aria-busy",
        "true"
      );
    }
  );

  list.addEventListener(
    "click",
    (event) => {
      const remove =
        event.target.closest(
          "[data-private-mock-remove]"
        );

      if (!remove) return;

      remove
        .closest(
          "[data-private-mock-batch-row]"
        )
        ?.remove();
      refreshRows();
    }
  );

  refreshRows();
})();

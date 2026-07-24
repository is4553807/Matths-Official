(function () {
  "use strict";

  function initPasswordToggles() {
    const buttons = document.querySelectorAll(
      "[data-password-toggle]"
    );

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const inputId =
          button.dataset.passwordToggle;

        const input =
          document.getElementById(inputId);

        if (!input) {
          return;
        }

        const shouldShow =
          input.type === "password";

        input.type = shouldShow
          ? "text"
          : "password";

        button.textContent = shouldShow
          ? "숨기기"
          : "보기";

        button.setAttribute(
          "aria-pressed",
          String(shouldShow)
        );
      });
    });
  }

  function initPasswordConfirmation() {
    const form =
      document.querySelector(
        "[data-register-form]"
      );

    if (!form) {
      return;
    }

    const password =
      document.getElementById("password");

    const confirmation =
      document.getElementById(
        "passwordConfirm"
      );

    const message =
      document.getElementById(
        "password-match"
      );

    if (
      !password ||
      !confirmation ||
      !message
    ) {
      return;
    }

    function validatePasswords() {
      if (!confirmation.value) {
        confirmation.setCustomValidity("");
        message.textContent = "";
        message.className = "field-guide";
        return;
      }

      const matches =
        password.value === confirmation.value;

      confirmation.setCustomValidity(
        matches
          ? ""
          : "비밀번호가 일치하지 않습니다."
      );

      message.textContent = matches
        ? "비밀번호가 일치합니다."
        : "비밀번호가 일치하지 않습니다.";

      message.className = matches
        ? "field-guide valid"
        : "field-guide invalid";
    }

    password.addEventListener(
      "input",
      validatePasswords
    );

    confirmation.addEventListener(
      "input",
      validatePasswords
    );
  }

  function initSubmitState() {
    const forms =
      document.querySelectorAll(".auth-form");

    forms.forEach((form) => {
      form.addEventListener("submit", () => {
        if (!form.checkValidity()) {
          return;
        }

        const button =
          form.querySelector(
            ".submit-button"
          );

        if (!button) {
          return;
        }

        button.disabled = true;
        button.textContent = "처리 중...";
      });
    });
  }

  function init() {
    initPasswordToggles();
    initPasswordConfirmation();
    initSchoolSelector();
    initSubmitState();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();

function initSchoolSelector() {
  const dataElement =
    document.getElementById(
      "school-data"
    );

  const regionSelect =
    document.getElementById(
      "schoolRegion"
    );

  const schoolSearch =
    document.getElementById(
      "schoolSearch"
    );

  const schoolSelect =
    document.getElementById(
      "schoolCode"
    );

  const resultCount =
    document.getElementById(
      "schoolResultCount"
    );

  if (
    !dataElement ||
    !regionSelect ||
    !schoolSearch ||
    !schoolSelect
  ) {
    return;
  }

  let schoolsByRegion = {};

  try {
    schoolsByRegion =
      JSON.parse(
        dataElement.textContent
      );
  } catch (error) {
    schoolSelect.innerHTML = "";

    schoolSelect.add(
      new Option(
        "학교 데이터를 불러오지 못했습니다.",
        ""
      )
    );

    return;
  }

  let selectedSchoolCode =
    schoolSelect.dataset
      .selectedSchool || "";

  function getCurrentSchools() {
    return (
      schoolsByRegion[
        regionSelect.value
      ] || []
    );
  }

  function normalizeSearch(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g, "");
  }

  function createSchoolLabel(school) {
    if (school.roadAddress) {
      return [
        school.name,
        school.roadAddress,
      ].join(" · ");
    }

    return school.name;
  }

  function renderSchools() {
    const schools =
      getCurrentSchools();

    const searchValue =
      normalizeSearch(
        schoolSearch.value
      );

    const filteredSchools =
      schools.filter((school) => {
        if (!searchValue) {
          return true;
        }

        const searchableText =
          normalizeSearch(
            [
              school.name,
              school.roadAddress,
              school.highSchoolType,
            ].join(" ")
          );

        return searchableText.includes(
          searchValue
        );
      });

    schoolSelect.innerHTML = "";

    const placeholder =
      new Option(
        filteredSchools.length
          ? "학교를 선택해 주세요"
          : "검색 결과가 없습니다.",
        ""
      );

    schoolSelect.add(placeholder);

    filteredSchools.forEach(
      (school) => {
        const option =
          new Option(
            createSchoolLabel(school),
            school.code
          );

        if (
          school.code ===
          selectedSchoolCode
        ) {
          option.selected = true;
        }

        schoolSelect.add(option);
      }
    );

    schoolSelect.disabled =
      !regionSelect.value ||
      filteredSchools.length === 0;

    if (resultCount) {
      resultCount.textContent =
        regionSelect.value
          ? `${filteredSchools.length}개 학교`
          : "";
    }
  }

  function handleRegionChange() {
    selectedSchoolCode = "";
    schoolSearch.value = "";

    schoolSearch.disabled =
      !regionSelect.value;

    renderSchools();

    if (regionSelect.value) {
      schoolSearch.focus();
    }
  }

  regionSelect.addEventListener(
    "change",
    handleRegionChange
  );

  schoolSearch.addEventListener(
    "input",
    () => {
      selectedSchoolCode = "";
      renderSchools();
    }
  );

  schoolSelect.addEventListener(
    "change",
    () => {
      selectedSchoolCode =
        schoolSelect.value;
    }
  );

  if (regionSelect.value) {
    schoolSearch.disabled = false;
    renderSchools();
  }
}
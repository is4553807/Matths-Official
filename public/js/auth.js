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
    initUniversitySelector();
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

function usesEnglishInterface() {
  return String(document.documentElement.lang || "")
    .toLowerCase()
    .startsWith("en");
}

function localizedInstitutionRegion(region) {
  if (!usesEnglishInterface()) return region;
  const regions = {
    서울: "Seoul",
    부산: "Busan",
    대구: "Daegu",
    인천: "Incheon",
    광주: "Gwangju",
    대전: "Daejeon",
    울산: "Ulsan",
    세종: "Sejong",
    경기: "Gyeonggi",
    강원: "Gangwon",
    충북: "North Chungcheong",
    충남: "South Chungcheong",
    전북: "North Jeolla",
    전남: "South Jeolla",
    경북: "North Gyeongsang",
    경남: "South Gyeongsang",
    제주: "Jeju",
    해외: "Overseas",
  };
  return regions[region] || region;
}

function localizedCampus(campus) {
  if (!usesEnglishInterface()) return campus;
  if (campus === "본교") return "Main Campus";
  const numberedCampus = String(campus || "").match(/^제(\d+)캠퍼스$/u);
  return numberedCampus ? `Campus ${numberedCampus[1]}` : campus;
}

function initSchoolSelector() {
  const overseasOptionCode = "OVERSEAS_HIGH_SCHOOL";
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

  const schoolSearchField = document.querySelector(
    "[data-school-search-field]"
  );

  const schoolSelect =
    document.getElementById(
      "schoolCode"
    );

  const resultCount =
    document.getElementById(
      "schoolResultCount"
    );

  const gradeSelect =
    document.getElementById(
      "schoolGrade"
    );

  const schoolFieldset =
    document.querySelector(
      "[data-school-selector]"
    );

  const overseasField = document.querySelector(
    "[data-overseas-school-field]"
  );
  const overseasNameInput = document.getElementById(
    "overseasSchoolName"
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

  function usesHighSchool() {
    return [10, 11, 12].includes(
      Number(gradeSelect?.value)
    );
  }

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
    if (school.code === overseasOptionCode && usesEnglishInterface()) {
      return "High school outside Korea";
    }
    if (school.roadAddress) {
      return [
        school.name,
        school.roadAddress,
      ].join(" · ");
    }

    return school.name;
  }

  function renderSchools() {
    if (!usesHighSchool()) {
      schoolSelect.innerHTML = "";
      schoolSelect.add(
        new Option(
          "현재 학습자 구분은 고등학교 입력을 사용하지 않습니다.",
          ""
        )
      );
      schoolSelect.disabled = true;
      return;
    }

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

        option.setAttribute("data-i18n-skip", "");

        if (
          school.code ===
          selectedSchoolCode
        ) {
          option.selected = true;
        }

        schoolSelect.add(option);
      }
    );

    if (
      regionSelect.value === "해외" &&
      filteredSchools.some((school) => school.code === overseasOptionCode)
    ) {
      selectedSchoolCode = overseasOptionCode;
      schoolSelect.value = overseasOptionCode;
    }

    schoolSelect.disabled =
      !regionSelect.value ||
      filteredSchools.length === 0;

    if (resultCount) {
      resultCount.textContent =
        regionSelect.value
          ? `${filteredSchools.length}개 학교`
          : "";
    }

    applyOverseasMode();
  }

  function applyOverseasMode() {
    const active =
      usesHighSchool() && schoolSelect.value === overseasOptionCode;
    if (overseasField) overseasField.hidden = !active;
    if (overseasNameInput) {
      overseasNameInput.required = active;
      overseasNameInput.disabled = !active;
    }
  }

  function handleRegionChange() {
    selectedSchoolCode = "";
    schoolSearch.value = "";

    const overseasRegion = regionSelect.value === "해외";
    schoolSearch.disabled = !regionSelect.value || overseasRegion;
    if (schoolSearchField) schoolSearchField.hidden = overseasRegion;

    renderSchools();

    if (regionSelect.value && !overseasRegion) {
      schoolSearch.focus();
    }
  }

  function applyGradeMode() {
    const highSchoolActive = usesHighSchool();

    if (schoolFieldset) {
      schoolFieldset.hidden = !highSchoolActive;
    }

    regionSelect.required = highSchoolActive;
    schoolSelect.required = highSchoolActive;
    regionSelect.disabled = !highSchoolActive;

    if (!highSchoolActive) {
      schoolSearch.disabled = true;
      schoolSelect.disabled = true;
      if (resultCount) {
        resultCount.textContent = "";
      }
      applyOverseasMode();
      return;
    }

    schoolSearch.disabled =
      !regionSelect.value || regionSelect.value === "해외";
    if (schoolSearchField) {
      schoolSearchField.hidden = regionSelect.value === "해외";
    }
    renderSchools();
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
      applyOverseasMode();
    }
  );

  if (gradeSelect) {
    gradeSelect.addEventListener(
      "change",
      applyGradeMode
    );
  }

  if (
    regionSelect.value &&
    usesHighSchool()
  ) {
    schoolSearch.disabled = false;
  }
  applyGradeMode();
}

function initUniversitySelector() {
  const overseasOptionCode = "OVERSEAS_UNIVERSITY";
  const dataElement = document.getElementById("university-data");
  const gradeSelect = document.getElementById("schoolGrade");
  const fieldset = document.querySelector("[data-university-selector]");
  const searchInput = document.getElementById("universitySearch");
  const universitySelect = document.getElementById("universityCode");
  const resultCount = document.getElementById("universityResultCount");
  const overseasField = document.querySelector("[data-overseas-university-field]");
  const overseasNameInput = document.getElementById("overseasUniversityName");
  if (!dataElement || !gradeSelect || !fieldset || !searchInput || !universitySelect) return;

  let universities = [];
  try {
    universities = JSON.parse(dataElement.textContent);
  } catch (_error) {
    universitySelect.innerHTML = '<option value="">대학교 데이터를 불러오지 못했습니다.</option>';
    return;
  }
  let selectedCode = universitySelect.dataset.selectedUniversity || "";
  const normalize = (value) => String(value || "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "");
  const isUniversity = () => Number(gradeSelect.value) === 14;

  function applyOverseasMode() {
    const active = isUniversity() && universitySelect.value === overseasOptionCode;
    if (overseasField) overseasField.hidden = !active;
    if (overseasNameInput) {
      overseasNameInput.required = active;
      overseasNameInput.disabled = !active;
    }
  }

  function render() {
    const query = normalize(searchInput.value);
    const rows = universities.filter((university) =>
      !query || normalize(
        `${university.name} ${university.campus} ${university.region}`
      ).includes(query)
    );
    universitySelect.innerHTML = "";
    universitySelect.add(new Option(
      rows.length ? "대학교를 선택해 주세요" : "검색 결과가 없습니다.",
      ""
    ));
    rows.forEach((university) => {
      const suffix = [
        localizedCampus(university.campus),
        localizedInstitutionRegion(university.region),
      ]
        .filter(Boolean)
        .join(" · ");
      const universityName =
        university.code === overseasOptionCode && usesEnglishInterface()
          ? "University outside Korea"
          : university.name;
      const option = new Option(
        `${universityName}${suffix ? ` · ${suffix}` : ""}`,
        university.code
      );
      option.setAttribute("data-i18n-skip", "");
      option.selected = String(university.code) === String(selectedCode);
      universitySelect.add(option);
    });
    universitySelect.disabled = !isUniversity() || rows.length === 0;
    if (resultCount) {
      resultCount.textContent = isUniversity()
        ? `${rows.length}개 공시대상 대학·캠퍼스`
        : "";
    }
    applyOverseasMode();
  }

  function applyMode() {
    const active = isUniversity();
    fieldset.hidden = !active;
    searchInput.disabled = !active;
    universitySelect.required = active;
    universitySelect.disabled = !active;
    if (active) render();
    else applyOverseasMode();
  }
  searchInput.addEventListener("input", () => {
    selectedCode = "";
    render();
  });
  universitySelect.addEventListener("change", () => {
    selectedCode = universitySelect.value;
    applyOverseasMode();
  });
  gradeSelect.addEventListener("change", applyMode);
  render();
  applyMode();
}

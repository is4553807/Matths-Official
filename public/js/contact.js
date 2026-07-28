(function () {
  "use strict";

  const form =
    document.querySelector(
      "[data-inquiry-form]"
    );
  const subject =
    document.getElementById(
      "inquiry-subject"
    );
  const content =
    document.getElementById(
      "inquiry-content"
    );
  const subjectCount =
    document.getElementById(
      "subject-count"
    );
  const contentCount =
    document.getElementById(
      "content-count"
    );

  function updateCount(
    field,
    output
  ) {
    if (!field || !output) return;
    output.textContent = String(
      field.value.length
    );
  }

  subject?.addEventListener(
    "input",
    () =>
      updateCount(
        subject,
        subjectCount
      )
  );
  content?.addEventListener(
    "input",
    () =>
      updateCount(
        content,
        contentCount
      )
  );

  updateCount(
    subject,
    subjectCount
  );
  updateCount(
    content,
    contentCount
  );

  form?.addEventListener(
    "submit",
    () => {
      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );

      if (!submitButton) return;

      submitButton.disabled = true;
      submitButton.textContent =
        "문의 접수 중";
    }
  );
})();

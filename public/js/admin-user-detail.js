(function () {
  "use strict";

  function initAccountRetentionChoice() {
    const statusSelect =
      document.querySelector(
        "[data-account-status-select]"
      );
    const retentionChoice =
      document.querySelector(
        "[data-account-retention-choice]"
      );

    if (
      !statusSelect ||
      !retentionChoice
    ) {
      return;
    }

    const checkbox =
      retentionChoice.querySelector(
        'input[name="retainAnonymousData"]'
      );

    function syncRetentionChoice() {
      const withdrawing =
        statusSelect.value ===
        "withdrawn";

      retentionChoice.hidden =
        !withdrawing;

      if (checkbox) {
        checkbox.disabled =
          !withdrawing;
      }
    }

    statusSelect.addEventListener(
      "change",
      syncRetentionChoice
    );
    syncRetentionChoice();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initAccountRetentionChoice,
      { once: true }
    );
  } else {
    initAccountRetentionChoice();
  }
})();

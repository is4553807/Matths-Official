(function () {
  "use strict";

  function initPasswordConfirmation() {
    const form = document.querySelector(
      "[data-password-form]"
    );

    if (!form) {
      return;
    }

    const password =
      document.getElementById("newPassword");
    const confirmation =
      document.getElementById(
        "newPasswordConfirm"
      );
    const message =
      document.getElementById(
        "new-password-match"
      );

    if (
      !password ||
      !confirmation ||
      !message
    ) {
      return;
    }

    const defaultMessage =
      message.textContent.trim();

    function validatePasswords() {
      if (!confirmation.value) {
        confirmation.setCustomValidity("");
        message.textContent = defaultMessage;
        message.className = "field-guide";
        return;
      }

      const matches =
        password.value === confirmation.value;

      confirmation.setCustomValidity(
        matches
          ? ""
          : "새 비밀번호가 일치하지 않습니다."
      );

      message.textContent = matches
        ? "새 비밀번호가 일치합니다."
        : "새 비밀번호가 일치하지 않습니다.";
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

  function initSubmitStates() {
    const forms = document.querySelectorAll(
      "[data-settings-form]"
    );

    forms.forEach((form) => {
      form.addEventListener("submit", () => {
        if (!form.checkValidity()) {
          return;
        }

        const button =
          form.querySelector(".save-button");

        if (!button) {
          return;
        }

        button.disabled = true;
        button.textContent = "저장 중...";
      });
    });
  }

  function initProfileAvatarPicker() {
    const form = document.querySelector(
      "[data-profile-avatar-form]"
    );
    if (!form) return;

    const uploader = form.querySelector(
      "[data-profile-avatar-uploader]"
    );
    const fileInput = form.querySelector(
      "[data-profile-avatar-file]"
    );
    const preview = form.querySelector(
      "[data-profile-avatar-preview]"
    );
    const fileName = form.querySelector(
      "[data-profile-avatar-filename]"
    );
    const saveButton = form.querySelector(
      "[data-profile-avatar-save]"
    );
    const dialog = document.querySelector(
      "[data-profile-avatar-crop-dialog]"
    );
    const canvas = dialog?.querySelector(
      "[data-profile-avatar-crop-canvas]"
    );
    const zoomInput = dialog?.querySelector(
      "[data-profile-avatar-crop-zoom]"
    );
    const rotateButton = dialog?.querySelector(
      "[data-profile-avatar-crop-rotate]"
    );
    const applyButton = dialog?.querySelector(
      "[data-profile-avatar-crop-apply]"
    );
    const cancelButtons = dialog
      ? Array.from(
          dialog.querySelectorAll("[data-profile-avatar-crop-cancel]")
        )
      : [];
    if (
      !uploader ||
      !fileInput ||
      !preview ||
      !saveButton ||
      !dialog ||
      !canvas ||
      !zoomInput ||
      !rotateButton ||
      !applyButton
    ) return;

    const originalPreview = preview.src;
    const currentCustom = uploader.dataset.currentCustom === "true";
    const context = canvas.getContext("2d", { alpha: false });
    const cropImage = new Image();
    const canvasSize = canvas.width;
    let appliedFile = null;
    let sourceUrl = "";
    let previewUrl = "";
    let rotation = 0;
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;

    function assignInputFile(file) {
      const transfer = new DataTransfer();
      if (file) transfer.items.add(file);
      fileInput.files = transfer.files;
    }

    function clearPreviewUrl() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    }

    function clearSourceUrl() {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceUrl = "";
    }

    function rotatedImageSize() {
      const quarterTurn = Math.abs(rotation % 180) === 90;
      return {
        width: quarterTurn ? cropImage.naturalHeight : cropImage.naturalWidth,
        height: quarterTurn ? cropImage.naturalWidth : cropImage.naturalHeight,
      };
    }

    function imageScale() {
      const rotated = rotatedImageSize();
      return Math.max(
        canvasSize / rotated.width,
        canvasSize / rotated.height
      ) * zoom;
    }

    function clampOffsets() {
      const rotated = rotatedImageSize();
      const scale = imageScale();
      const horizontalLimit = Math.max(
        0,
        (rotated.width * scale - canvasSize) / 2
      );
      const verticalLimit = Math.max(
        0,
        (rotated.height * scale - canvasSize) / 2
      );
      offsetX = Math.max(-horizontalLimit, Math.min(horizontalLimit, offsetX));
      offsetY = Math.max(-verticalLimit, Math.min(verticalLimit, offsetY));
    }

    function drawCrop() {
      if (!context || !cropImage.naturalWidth) return;
      clampOffsets();
      context.save();
      context.fillStyle = "#090a0c";
      context.fillRect(0, 0, canvasSize, canvasSize);
      context.translate(
        canvasSize / 2 + offsetX,
        canvasSize / 2 + offsetY
      );
      context.rotate((rotation * Math.PI) / 180);
      const scale = imageScale();
      context.scale(scale, scale);
      context.drawImage(
        cropImage,
        -cropImage.naturalWidth / 2,
        -cropImage.naturalHeight / 2
      );
      context.restore();
    }

    function restoreAppliedFile() {
      if (appliedFile) assignInputFile(appliedFile);
      else fileInput.value = "";
    }

    function closeCropper({ restoreFile = false } = {}) {
      if (restoreFile) restoreAppliedFile();
      if (dialog.open) dialog.close();
      clearSourceUrl();
      cropImage.onload = null;
      cropImage.onerror = null;
      cropImage.removeAttribute("src");
    }

    function reportFileError(message) {
      fileInput.setCustomValidity(message);
      fileInput.reportValidity();
      restoreAppliedFile();
      fileInput.setCustomValidity("");
      clearSourceUrl();
    }

    function openCropper(file) {
      clearSourceUrl();
      sourceUrl = URL.createObjectURL(file);
      cropImage.onload = () => {
        if (
          !cropImage.naturalWidth ||
          !cropImage.naturalHeight ||
          cropImage.naturalWidth * cropImage.naturalHeight > 25_000_000
        ) {
          reportFileError("사진 해상도가 너무 큽니다. 2,500만 화소 이하의 사진을 선택해 주세요.");
          return;
        }
        rotation = 0;
        zoom = 1;
        offsetX = 0;
        offsetY = 0;
        zoomInput.value = "1";
        drawCrop();
        dialog.showModal();
        canvas.focus();
      };
      cropImage.onerror = () => {
        reportFileError("사진을 불러올 수 없습니다. 다른 사진을 선택해 주세요.");
      };
      cropImage.src = sourceUrl;
    }

    fileInput.addEventListener("change", () => {
      fileInput.setCustomValidity("");
      const file = fileInput.files?.[0];
      if (!file) {
        restoreAppliedFile();
        return;
      }

      const allowedTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);
      if (!allowedTypes.has(file.type)) {
        reportFileError("JPG, PNG 또는 WEBP 사진을 선택해 주세요.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reportFileError("프로필 사진은 5MB 이하로 선택해 주세요.");
        return;
      }

      openCropper(file);
    });

    zoomInput.addEventListener("input", () => {
      zoom = Math.max(1, Math.min(3, Number(zoomInput.value) || 1));
      drawCrop();
    });

    rotateButton.addEventListener("click", () => {
      rotation = (rotation + 90) % 360;
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      zoomInput.value = "1";
      drawCrop();
    });

    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = canvasSize / rect.width;
      offsetX += (event.clientX - pointerX) * ratio;
      offsetY += (event.clientY - pointerY) * ratio;
      pointerX = event.clientX;
      pointerY = event.clientY;
      drawCrop();
    });

    function endDrag(event) {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("keydown", (event) => {
      const directions = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const distance = event.shiftKey ? 36 : 12;
      offsetX += direction[0] * distance;
      offsetY += direction[1] * distance;
      drawCrop();
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoom = Math.max(1, Math.min(3, zoom - event.deltaY * 0.0015));
      zoomInput.value = zoom.toFixed(2);
      drawCrop();
    }, { passive: false });

    cancelButtons.forEach((button) => {
      button.addEventListener("click", () => {
        closeCropper({ restoreFile: true });
      });
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeCropper({ restoreFile: true });
    });

    applyButton.addEventListener("click", () => {
      applyButton.disabled = true;
      canvas.toBlob((blob) => {
        applyButton.disabled = false;
        if (!blob) {
          reportFileError("사진을 자를 수 없습니다. 다시 시도해 주세요.");
          closeCropper({ restoreFile: true });
          return;
        }
        const croppedFile = new File(
          [blob],
          "profile-avatar-crop.webp",
          {
            type: "image/webp",
            lastModified: Date.now(),
          }
        );
        appliedFile = croppedFile;
        assignInputFile(croppedFile);
        clearPreviewUrl();
        previewUrl = URL.createObjectURL(croppedFile);
        preview.src = previewUrl;
        if (fileName) fileName.textContent = "자르기 적용 완료 · 저장 대기 중";
        uploader.classList.add("is-ready");
        saveButton.disabled = false;
        closeCropper();
      }, "image/webp", 0.9);
    });

    window.addEventListener("pagehide", () => {
      clearSourceUrl();
      clearPreviewUrl();
    }, { once: true });

    if (!currentCustom) {
      preview.src = originalPreview;
    }
  }

  function initWithdrawalForm() {
    const form = document.querySelector(
      "[data-withdraw-form]"
    );

    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      if (!form.checkValidity()) {
        return;
      }

      const confirmed = window.confirm(
        "탈퇴하면 개인정보와 로그인 정보는 즉시 제거되며 계정을 복구할 수 없습니다. 계속할까요?"
      );

      if (!confirmed) {
        event.preventDefault();
        return;
      }

      const button = form.querySelector(
        ".withdrawal-button"
      );

      if (button) {
        button.disabled = true;
        button.textContent =
          "개인정보 제거 중...";
      }
    });
  }

  function init() {
    initPasswordConfirmation();
    initProfileAvatarPicker();
    initSubmitStates();
    initWithdrawalForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();

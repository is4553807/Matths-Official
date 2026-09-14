"use strict";

// Server-side guards also reject preview mutations; this only communicates it.
document.querySelectorAll("form").forEach((form) => {
  if (String(form.method).toLowerCase() !== "post") return;
  form.querySelectorAll("input, button, select, textarea").forEach((control) => {
    control.disabled = true;
    control.title = "관리자 미리보기는 읽기 전용입니다.";
  });
});

(function () {
  "use strict";

  function init() {
    const root = document.querySelector("[data-portal-registration]");
    if (!root) return;
    const form = root.querySelector("[data-portal-form]");
    const parent = root.dataset.accountType === "parent";
    const locked = root.dataset.invitationLocked === "true";
    const stages = [...form.querySelectorAll("[data-registration-stage]")];
    const flowInput = form.elements.namedItem("registrationFlow");
    const tokenInput = form.querySelector("[data-invite-token]");
    const linkInput = form.querySelector("[data-invite-link]");
    const preview = form.querySelector("[data-invite-preview]");
    const errorMessage = form.querySelector("[data-invite-error]");
    const lookupButton = form.querySelector("[data-invite-lookup]");
    const next = form.querySelector("[data-registration-next]");
    const back = form.querySelector("[data-registration-back]");
    const submit = form.querySelector("[data-registration-submit]");
    const later = form.querySelector("[data-connect-later]");
    const progress = root.querySelector("[data-registration-progress]");
    const status = root.querySelector("[data-step-status]");
    let step = 0;
    let requestVersion = 0;
    let invitation = locked ? { token: tokenInput.value, email: form.elements.namedItem("email").value, name: preview.querySelector("[data-invite-name]").textContent } : null;
    if (!locked) tokenInput.value = "";
    form.noValidate = true;

    function order() { return parent ? ["account", "child"] : ["account", flowInput.value === "staff" ? "staff" : "institution", "review"]; }
    function stageFor(key) { return stages.find(stage => stage.dataset.registrationStage === key); }
    function showError(message) { errorMessage.textContent = message; errorMessage.hidden = !message; }

    function updateSocialLinks() {
      root.querySelectorAll("[data-social-provider]").forEach(link => {
        const href = link.getAttribute("href");
        if (!href || href === "#") return;
        const [pathname, query = ""] = href.split("?");
        const params = new URLSearchParams(query);
        if (!parent && flowInput.value === "staff") params.set("path", "staff"); else params.delete("path");
        if (invitation?.token) params.set("invite", invitation.token); else params.delete("invite");
        link.setAttribute("href", `${pathname}${params.size ? "?" + params : ""}`);
      });
    }

    function updateChildConsent() {
      if (!parent) return;
      const container = form.querySelector("[data-child-consent]");
      container.hidden = !invitation;
      [...container.querySelectorAll("input, select")].forEach(control => { control.disabled = !invitation; control.required = Boolean(invitation); });
    }

    function renderReview() {
      const review = form.querySelector("[data-registration-review]");
      if (!review) return;
      const read = name => form.elements.namedItem(name)?.value || "";
      const rows = [["담당자", read("displayName")], ["이메일", read("email")]];
      if (flowInput.value === "staff") rows.push(["참여 학원", invitation?.name || "초대를 확인해 주세요"], ["요청 권한", "교사 · 원장 승인 필요"]);
      else rows.push(["학원", read("academyName")], ["지점", read("branchName") || "미입력"], ["주소", read("address")], ["연락처", read("contactPhone")]);
      review.replaceChildren(...rows.map(([label, value]) => {
        const row = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd");
        term.textContent = label; detail.textContent = value; row.append(term, detail); return row;
      }));
      review.hidden = false;
    }

    function render(focus = false) {
      const sequence = order();
      step = Math.min(step, sequence.length - 1);
      stages.forEach(stage => { stage.hidden = stage.dataset.registrationStage !== sequence[step]; });
      progress.hidden = false;
      const labels = { account: parent ? "계정 만들기" : "담당자 계정", institution: "학원 정보", staff: "초대 확인", review: "확인·신청", child: "자녀 연결" };
      progress.replaceChildren(...sequence.map((key, index) => {
        const item = document.createElement("li"); item.textContent = `${index + 1} ${labels[key]}`;
        item.classList.toggle("is-current", index === step); item.classList.toggle("is-complete", index < step);
        if (index === step) item.setAttribute("aria-current", "step"); return item;
      }));
      back.hidden = step === 0;
      next.hidden = step === sequence.length - 1;
      next.textContent = `다음 · ${labels[sequence[step + 1]] || "확인"} →`;
      submit.hidden = !next.hidden;
      submit.textContent = parent ? invitation ? "가입하고 자녀 연결하기 →" : "학부모 계정 만들기 →" : flowInput.value === "staff" ? "교사 참여 신청 →" : "학원 등록 신청 →";
      if (later) later.hidden = sequence[step] !== "child";
      status.hidden = false; status.textContent = `${step + 1} / ${sequence.length} 단계 · ${labels[sequence[step]]}`;
      if (sequence[step] === "review") renderReview();
      updateChildConsent();
      updateSocialLinks();
      if (focus) stageFor(sequence[step]).querySelector("legend").focus();
    }

    function checkPasswords() {
      const password = form.elements.namedItem("password"), confirm = form.elements.namedItem("passwordConfirm");
      if (!password || !confirm) return;
      const secret = password.value;
      password.setCustomValidity(secret && (secret.length < 8 || !/[A-Za-z]/.test(secret) || !/\d/.test(secret)) ? "영문과 숫자를 포함해 8자 이상 입력해 주세요." : secret && new TextEncoder().encode(secret).length > 72 ? "비밀번호는 UTF-8 기준 72바이트 이하로 입력해 주세요." : "");
      confirm.setCustomValidity(confirm.value && secret !== confirm.value ? "비밀번호가 일치하지 않습니다." : "");
    }

    function validateStage(key) {
      checkPasswords();
      if (key === "institution") {
        const phone = form.elements.namedItem("contactPhone");
        phone.setCustomValidity(phone.value && (!/^[+\d() .-]{7,30}$/.test(phone.value.trim()) || phone.value.replace(/\D/g, "").length < 7) ? "학원 연락처를 다시 확인해 주세요." : "");
      }
      const invalid = [...stageFor(key).querySelectorAll("input, select")].find(control => control.willValidate && !control.checkValidity());
      if (invalid) { step = order().indexOf(key); render(); invalid.reportValidity(); return false; }
      return true;
    }

    function validateInvite() {
      if (!parent && flowInput.value !== "staff") return true;
      if (!invitation && (flowInput.value === "staff" || linkInput?.value.trim())) {
        step = order().indexOf(parent ? "child" : "staff"); render(); showError("초대 확인 버튼을 눌러 유효한 초대를 먼저 확인해 주세요."); linkInput?.focus(); return false;
      }
      if (invitation && invitation.email.toLowerCase() !== form.elements.namedItem("email").value.trim().toLowerCase()) {
        step = order().indexOf(parent ? "child" : "staff"); render(); showError("로그인 이메일과 초대받은 이메일이 다릅니다. 이전 단계에서 이메일을 확인해 주세요."); return false;
      }
      showError(""); return true;
    }

    function advance() {
      const key = order()[step];
      if (!validateStage(key) || (key === "staff" && !validateInvite())) return;
      step++; render(true);
    }
    next.addEventListener("click", advance);
    back.addEventListener("click", () => { step = Math.max(0, step - 1); render(true); });
    form.elements.namedItem("password")?.addEventListener("input", checkPasswords);
    form.elements.namedItem("passwordConfirm")?.addEventListener("input", checkPasswords);

    function clearInvitation() {
      requestVersion++; invitation = null; tokenInput.value = ""; preview.hidden = true; showError(""); updateChildConsent();
      if (parent) { form.elements.namedItem("relationship").value = ""; form.elements.namedItem("linkConsent").checked = false; }
      if (lookupButton) { lookupButton.disabled = false; lookupButton.textContent = "초대 확인"; }
    }
    linkInput?.addEventListener("input", () => { clearInvitation(); render(); });
    lookupButton?.addEventListener("click", async () => {
      const version = ++requestVersion;
      showError(""); lookupButton.disabled = true; lookupButton.textContent = "확인 중…";
      try {
        const endpoint = parent ? "/parent/register/invite" : "/academy/register/invite";
        const response = await fetch(`${endpoint}?${new URLSearchParams({ token: linkInput.value.trim() })}`, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
        const data = await response.json();
        if (version !== requestVersion) return;
        if (!response.ok) throw new Error(data.error || "초대를 확인할 수 없습니다.");
        invitation = data; tokenInput.value = data.token;
        preview.querySelector("[data-invite-name]").textContent = data.name;
        preview.querySelector("[data-invite-email]").textContent = data.email;
        preview.querySelector("[data-invite-expiry]").textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.expiresAt)) + " (한국시간)";
        preview.hidden = false; render(); validateInvite();
      } catch (error) {
        if (version !== requestVersion) return;
        invitation = null; tokenInput.value = ""; preview.hidden = true; updateChildConsent();
        showError(error instanceof SyntaxError ? "초대를 확인하지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요." : error.message);
      } finally { if (version === requestVersion) { lookupButton.disabled = false; lookupButton.textContent = "초대 확인"; } }
    });

    root.querySelectorAll("[data-registration-path]").forEach(link => link.addEventListener("click", event => {
      if (locked) return; // A confirmed email-bound invitation keeps its own route.
      event.preventDefault(); flowInput.value = link.dataset.registrationPath; step = 0; clearInvitation();
      const staff = flowInput.value === "staff";
      stageFor("institution").disabled = staff; stageFor("staff").disabled = !staff;
      const authority = form.elements.namedItem("authorityConfirmed"); authority.disabled = staff; authority.required = !staff;
      root.querySelectorAll("[data-new-only]").forEach(element => { element.hidden = staff; });
      root.querySelectorAll("[data-staff-only]").forEach(element => { element.hidden = !staff; });
      root.querySelectorAll("[data-registration-path]").forEach(element => { element.classList.toggle("is-selected", element === link); });
      root.querySelector("[data-flow-title]").textContent = staff ? "초대받은 학원에 합류하세요." : "학원 운영을 시작하세요.";
      render(true);
    }));
    form.addEventListener("submit", event => {
      if (step < order().length - 1) { event.preventDefault(); advance(); return; }
      if (!order().every(validateStage) || !validateInvite()) event.preventDefault();
    });
    later?.addEventListener("click", () => { clearInvitation(); if (linkInput) linkInput.value = ""; form.elements.namedItem("relationship").value = ""; form.elements.namedItem("linkConsent").checked = false; render(); form.requestSubmit(submit); });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();

"use strict";

function statusError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function accepted(value) {
  return value === true || ["1", "true", "on"].includes(String(value || ""));
}

function validateAccount({ displayName, email, password, passwordConfirm, termsAccepted }, { nameLabel, nameMaximum = 40 }) {
  const name = normalizedText(displayName);
  const cleanEmail = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (name.length < 2 || name.length > nameMaximum) {
    throw statusError(400, `${nameLabel}은 2자 이상 ${nameMaximum}자 이하로 입력해주세요.`);
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw statusError(400, "올바른 이메일 주소를 입력해주세요.");
  }
  if (secret.length < 8 || !/[A-Za-z]/.test(secret) || !/\d/.test(secret)) {
    throw statusError(400, "비밀번호는 영문과 숫자를 포함해 8자 이상으로 입력해주세요.");
  }
  if (Buffer.byteLength(secret, "utf8") > 72) throw statusError(400, "비밀번호가 너무 깁니다.");
  if (secret !== String(passwordConfirm || "")) throw statusError(400, "비밀번호 확인이 일치하지 않습니다.");
  if (!accepted(termsAccepted)) throw statusError(400, "이용약관과 개인정보처리방침에 동의해주세요.");
  return { displayName: name, email: cleanEmail, password: secret };
}

function validateInstitution({ academyName, branchName, address, contactPhone, authorityConfirmed }) {
  const fields = Object.fromEntries(Object.entries({ academyName, branchName, address, contactPhone }).map(([key, value]) => [key, normalizedText(value)]));
  if (fields.academyName.length < 2 || fields.academyName.length > 80) throw statusError(400, "학원 이름은 2자 이상 80자 이하로 입력해주세요.");
  if (fields.branchName.length > 80) throw statusError(400, "지점 이름은 80자 이하로 입력해주세요.");
  if (fields.address.length < 5 || fields.address.length > 200) throw statusError(400, "학원 주소는 5자 이상 200자 이하로 입력해주세요.");
  if (!/^[+\d() .-]{7,30}$/.test(fields.contactPhone) || fields.contactPhone.replace(/\D/g, "").length < 7) throw statusError(400, "학원 연락처를 다시 확인해주세요.");
  if (!accepted(authorityConfirmed)) throw statusError(400, "학원 운영 권한이 있는 담당자임을 확인해주세요.");
  return fields;
}

function validateChildConsent({ relationship, linkConsent }) {
  if (!["FATHER", "MOTHER", "GUARDIAN"].includes(String(relationship || ""))) throw statusError(400, "자녀와의 관계를 선택해주세요.");
  if (!accepted(linkConsent)) throw statusError(400, "자녀와 공유 범위를 확인한 뒤 연결에 동의해주세요.");
  return { relationship: String(relationship), linkConsentAt: new Date() };
}

function inviteTokenFrom(value, pathPrefix) {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(raw)) return raw;
  try {
    const url = new URL(raw, "https://www.matths.kr");
    const token = url.pathname.startsWith(pathPrefix) ? url.pathname.slice(pathPrefix.length) : "";
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) return token;
  } catch (_error) { /* Only parse locally; never fetch an arbitrary submitted URL. */ }
  throw statusError(400, "Matths에서 받은 초대 링크를 다시 확인해주세요.");
}

module.exports = { accepted, inviteTokenFrom, normalizedText, statusError, validateAccount, validateChildConsent, validateInstitution };

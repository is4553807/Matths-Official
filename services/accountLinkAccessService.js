function signedInIdentity(session) {
  if (session?.user?.id) {
    const role = session.user.role;
    return {
      id: String(session.user.id),
      accountType: role === "teacher" ? "academy" : role === "admin" ? "admin" : "student",
      email: session.user.email || "",
    };
  }
  if (session?.parent?.id) {
    return { id: String(session.parent.id), accountType: "parent", email: session.parent.email || "" };
  }
  return null;
}

function mismatchError() {
  const error = new Error("현재 로그인된 계정은 이 이메일 링크의 대상 계정이 아니므로 이 페이지를 열람할 권한이 없습니다. 로그아웃한 뒤 메일을 받은 계정으로 다시 로그인해 주세요.");
  error.status = 403;
  error.code = "ACCOUNT_LINK_SESSION_MISMATCH";
  return error;
}

function accountLinkMismatch(session, target) {
  const current = signedInIdentity(session);
  if (!current || (current.id === String(target.userId) && current.accountType === target.accountType)) return null;
  return mismatchError();
}

function accountEmailLinkMismatch(session, targetEmail, accountType) {
  const current = signedInIdentity(session);
  if (!current) return null;
  if (current.accountType === accountType && current.email.trim().toLowerCase() === String(targetEmail || "").trim().toLowerCase()) return null;
  return mismatchError();
}

module.exports = { accountEmailLinkMismatch, accountLinkMismatch, signedInIdentity };

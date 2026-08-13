const auditPage = document.querySelector("[data-arena-audit]");
const refreshButton = document.querySelector("[data-audit-refresh]");
const pollStatus = document.querySelector("[data-audit-poll-status]");

function auditSignature(audit) {
  return [
    audit.health,
    audit.summary.criticalCount,
    audit.summary.warningCount,
    audit.summary.pendingOutboxCount,
    audit.summary.checkedCycles,
    audit.summary.checkedMatches,
    audit.summary.checkedInvitations,
    audit.summary.checkedLocks,
    audit.scope.truncated,
    ...audit.issues.map((issue) => [
      issue.severity,
      issue.category,
      issue.entityId,
      issue.title,
      issue.observedAt ? new Date(issue.observedAt).toISOString() : "",
    ].join("~")),
  ].join(":");
}

async function checkArenaAudit() {
  if (!auditPage || document.hidden) return;
  if (pollStatus) pollStatus.textContent = "변경 여부 확인 중";
  try {
    const response = await fetch("/api/admin/arena-audit", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("감사 결과를 불러오지 못했습니다.");
    const payload = await response.json();
    const nextSignature = auditSignature(payload.audit);
    if (nextSignature !== auditPage.dataset.auditSignature) {
      window.location.reload();
      return;
    }
    if (pollStatus) pollStatus.textContent = "변경 없음 · 30초마다 확인";
  } catch (_error) {
    if (pollStatus) pollStatus.textContent = "자동 확인 실패 · 직접 다시 검사해 주세요";
  }
}

if (refreshButton) {
  refreshButton.addEventListener("click", () => window.location.reload());
}

if (auditPage) {
  window.setInterval(checkArenaAudit, 30 * 1000);
}

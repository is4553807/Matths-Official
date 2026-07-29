const ROLE_LABELS = {
  student: "학생",
  teacher: "교사",
  admin: "관리자",
};

const STATUS_LABELS = {
  active: "활성",
  inactive: "비활성",
  suspended: "정지",
  withdrawn: "탈퇴",
};

function activationChanged({
  active,
  reason,
}) {
  const statusLabel =
    active
      ? "활성화"
      : "비활성화";

  return {
    title:
      `계정이 ${statusLabel}되었습니다.`,
    message: [
      `계정 상태: ${statusLabel}`,
      `처리 사유: ${reason}`,
      active
        ? "이제 Matths에 다시 로그인해 서비스를 이용할 수 있습니다."
        : "계정이 다시 활성화될 때까지 Matths 기능을 이용할 수 없습니다.",
    ].join("\n"),
  };
}

function roleChanged({
  previousRole,
  nextRole,
  reason,
}) {
  return {
    title:
      "계정 역할이 변경되었습니다.",
    message: [
      `계정 역할: ${ROLE_LABELS[previousRole] || previousRole} → ${ROLE_LABELS[nextRole] || nextRole}`,
      `변경 사유: ${reason}`,
      "새 역할의 권한은 다음 로그인부터 적용됩니다.",
    ].join("\n"),
  };
}

function withdrawn({
  reason,
  keepAnonymousData,
}) {
  return {
    title:
      "계정이 탈퇴 처리되었습니다.",
    message: [
      "계정 상태: 탈퇴",
      `처리 사유: ${reason}`,
      keepAnonymousData
        ? "개인정보는 제거되며 학습 데이터는 익명 상태로 보존됩니다."
        : "개인정보와 사용자 활동 데이터가 제거됩니다.",
    ].join("\n"),
  };
}

function statusChanged({
  status,
  reason,
  suspendedUntilText = "",
}) {
  const statusLabel =
    STATUS_LABELS[status] ||
    status;

  return {
    title:
      `계정 상태가 ${statusLabel} 상태로 변경되었습니다.`,
    message: [
      `계정 상태: ${statusLabel}`,
      `처리 사유: ${reason}`,
      suspendedUntilText,
      status === "active"
        ? "현재 계정으로 Matths 서비스를 정상 이용할 수 있습니다."
        : "해당 상태가 유지되는 동안 Matths 서비스 이용이 제한됩니다.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function warningChanged({
  count,
  previousCount,
  reason,
  autoSuspended,
}) {
  return {
    title:
      autoSuspended
        ? "경고 누적으로 계정이 정지되었습니다."
        : "계정 경고 기록이 변경되었습니다.",
    message: [
      `현재 누적 경고: ${count}회`,
      `처리 사유: ${reason}`,
      autoSuspended
        ? "경고가 3회 이상 누적되어 계정 이용이 정지되었습니다."
        : count > previousCount
          ? "서비스 이용 규칙을 다시 확인해주세요."
          : "운영자가 경고 기록을 조정했습니다.",
    ].join("\n"),
  };
}

module.exports = {
  activationChanged,
  roleChanged,
  statusChanged,
  warningChanged,
  withdrawn,
};

const ERROR_COPY = {
  400: {
    eyebrow: "요청 확인",
    title: "요청 내용을 다시 확인해주세요.",
    fallbackMessage:
      "입력한 내용이나 요청 형식이 올바르지 않아 처리하지 못했습니다.",
  },
  401: {
    eyebrow: "로그인 필요",
    title: "로그인 후 이용할 수 있습니다.",
    fallbackMessage:
      "안전한 서비스 이용을 위해 로그인 상태를 먼저 확인해주세요.",
  },
  403: {
    eyebrow: "이용 권한 확인",
    title: "이 페이지를 이용할 권한이 없습니다.",
    fallbackMessage:
      "현재 계정의 역할, 이용권 또는 Division 권한으로는 이 기능을 사용할 수 없습니다.",
  },
  404: {
    eyebrow: "페이지 없음",
    title: "요청한 페이지를 찾을 수 없습니다.",
    fallbackMessage:
      "주소가 바뀌었거나 더 이상 제공하지 않는 페이지일 수 있습니다.",
  },
  409: {
    eyebrow: "상태 확인",
    title: "현재 상태에서는 진행할 수 없습니다.",
    fallbackMessage:
      "다른 작업이 진행 중이거나 이용 상태가 변경되었습니다. 현재 상태를 다시 확인해주세요.",
  },
  410: {
    eyebrow: "이용 종료",
    title: "더 이상 이용할 수 없는 페이지입니다.",
    fallbackMessage:
      "이 요청의 이용 기간이 끝났거나 이미 처리되었습니다.",
  },
  413: {
    eyebrow: "파일 확인",
    title: "업로드 파일이 허용 범위를 넘었습니다.",
    fallbackMessage:
      "파일 개수와 용량을 확인한 뒤 다시 업로드해주세요.",
  },
  422: {
    eyebrow: "입력 확인",
    title: "입력 내용을 처리할 수 없습니다.",
    fallbackMessage:
      "필수 항목과 입력 형식을 확인한 뒤 다시 시도해주세요.",
  },
  423: {
    eyebrow: "이용 잠금",
    title: "현재 이 기능의 이용이 잠겨 있습니다.",
    fallbackMessage:
      "이용 가능 시간, 계정 상태 또는 진행 중인 검토를 확인해주세요.",
  },
  429: {
    eyebrow: "요청 한도",
    title: "잠시 후 다시 시도해주세요.",
    fallbackMessage:
      "짧은 시간에 요청이 많이 발생해 일시적으로 제한했습니다.",
  },
  501: {
    eyebrow: "준비 중",
    title: "아직 준비 중인 기능입니다.",
    fallbackMessage:
      "안전한 이용을 위한 다음 화면을 준비하고 있습니다.",
  },
  500: {
    eyebrow: "일시적 오류",
    title: "요청을 처리하는 중 문제가 발생했습니다.",
    fallbackMessage:
      "잠시 뒤 다시 시도해주세요. 같은 문제가 반복되면 문의를 남겨주세요.",
  },
};

function normalizedStatus(value) {
  const status = Number(value);
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    return 500;
  }
  return status;
}

function cleanMessage(value, fallback) {
  const message = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return message ? message.slice(0, 500) : fallback;
}

function actionSet(status, user, errorCode = "") {
  const signedIn = Boolean(user);
  if (status === 401) {
    return {
      primaryAction: { href: "/login", label: "로그인하기" },
      secondaryAction: { href: "/", label: "Matths 홈" },
    };
  }
  if (status === 403) {
    if (errorCode === "ADMIN_ACCESS_REQUIRED") {
      return {
        primaryAction: { href: "/main", label: "대시보드로 돌아가기" },
        secondaryAction: { href: "/faq", label: "도움말 보기" },
      };
    }
    return {
      primaryAction: {
        href: signedIn ? "/main" : "/login",
        label: signedIn ? "대시보드로 돌아가기" : "로그인하기",
      },
      secondaryAction: { href: "/pricing", label: "이용권 확인" },
    };
  }
  if (status === 501) {
    return {
      primaryAction: { href: "/pricing", label: "이용권으로 돌아가기" },
      secondaryAction: { href: signedIn ? "/main" : "/", label: "Matths로 돌아가기" },
    };
  }
  if (status === 404 || status >= 500) {
    return {
      primaryAction: {
        href: signedIn ? "/main" : "/",
        label: signedIn ? "대시보드로 이동" : "Matths 홈으로 이동",
      },
      secondaryAction: { href: "/faq", label: "도움말 보기" },
    };
  }
  return {
    primaryAction: {
      href: signedIn ? "/main" : "/",
      label: signedIn ? "현재 상태 확인" : "Matths 홈으로 이동",
    },
    secondaryAction: { href: "/faq", label: "도움말 보기" },
  };
}

function buildErrorViewModel({ error = null, req, status }) {
  const user = req.session?.user || null;
  const copy = ERROR_COPY[status] || {
    eyebrow: "요청 처리 안내",
    title: "요청을 완료하지 못했습니다.",
    fallbackMessage: "현재 상태를 확인한 뒤 다시 시도해주세요.",
  };
  const safeMessage =
    status >= 500 || error?.expose === false
      ? copy.fallbackMessage
      : cleanMessage(error?.message, copy.fallbackMessage);

  return {
    user,
    activePage: "",
    statusCode: status,
    eyebrow: copy.eyebrow,
    title: copy.title,
    message: safeMessage,
    ...actionSet(status, user, error?.code),
  };
}

function renderErrorPage(req, res, { error = null, status = 500 } = {}) {
  const normalized = normalizedStatus(status);
  res.set("Cache-Control", "no-store");
  return res
    .status(normalized)
    .render(
      "error",
      buildErrorViewModel({ error, req, status: normalized })
    );
}

function notFoundHandler(req, res, next) {
  const error = new Error("요청한 주소에 해당하는 페이지가 없습니다.");
  error.status = 404;
  return next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const status = normalizedStatus(error?.status);
  if (status >= 500 && status !== 501) console.error(error);
  else console.warn(`[HTTP ${status}] ${error?.message || "요청 처리 실패"}`);

  if (String(req.originalUrl || "").startsWith("/api/")) {
    return res.status(status).json({
      message:
        status >= 500
          ? ERROR_COPY[500].fallbackMessage
          : cleanMessage(
              error?.message,
              (ERROR_COPY[status] || ERROR_COPY[500]).fallbackMessage
            ),
    });
  }

  return renderErrorPage(req, res, { error, status });
}

module.exports = {
  buildErrorViewModel,
  errorHandler,
  notFoundHandler,
  renderErrorPage,
};

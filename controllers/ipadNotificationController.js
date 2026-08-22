const {
  getNotificationInbox,
  getNotificationDetail,
  markAllNotificationsRead,
} = require("../services/notificationService");

/**
 * iPad 알림함 전용 읽기·읽음 경계.
 *
 * 왜 새로 여는가. 알림함은 서버에 **이미 완성돼 있었다**(UserNotification 스키마,
 * notificationService, /notifications 웹 페이지). 그런데 앱이 쓰는 Bearer 통로에는
 * 알림 경로가 하나도 없어서, 앱에서는 경고·전체 공지·관리자 개별 안내를 볼 방법이
 * 없었다. 웹 세션 라우트를 앱이 그대로 부를 수는 없다(쿠키가 아니라 Bearer 다).
 *
 * 그래서 **서비스 계층을 그대로 재사용**하고 HTTP 경계만 하나 더 낸다. 알림을 만드는
 * 규칙·읽음 규칙·긴급 분류는 웹과 앱이 같은 함수를 쓴다 — 두 벌이 되는 순간 갈린다.
 *
 * 응답을 서비스 반환값 그대로 내보내지 않는 이유는 두 가지다.
 *   ① lean 문서를 그대로 뿌리면 userId·createdBy·dedupeKey 같은 내부 필드가 앱으로
 *      새어 나간다. 앱이 쓰지 않는 값을 굳이 기기까지 보낼 이유가 없다.
 *   ② href 는 반드시 **정제된 값**(targetHref)을 보내야 한다. 서비스의 safeInternalHref
 *      가 외부 URL 을 /main 으로 눌러 주는데, 원본 href 를 보내면 앱이 그 방어를
 *      우회하게 된다.
 */

const APP_FIELDS = [
  "id",
  "kind",
  "title",
  "message",
  "tone",
  "sourceType",
  "createdAt",
  "readAt",
];

/** 앱이 읽는 필드만 남긴다. href 는 정제본을 쓴다. */
function serializeNotification(notification) {
  const output = {};
  for (const field of APP_FIELDS) {
    const value = notification[field];
    output[field] = value === undefined ? null : value;
  }
  // 앱 모델의 키 이름은 href 다. 값은 정제된 targetHref 를 넣는다.
  output.href = notification.targetHref || "/main";
  return output;
}

/**
 * GET /api/v1/notifications?page=1
 *
 * 응답 모양은 웹 알림함이 쓰는 getNotificationInbox 반환값과 같다
 * (notifications / stats / pagination). 앱이 이 모양에 맞춰 이미 구현돼 있다.
 */
exports.getInbox = async (req, res, next) => {
  try {
    const inbox = await getNotificationInbox({
      userId: req.apiUser._id,
      page: req.query.page,
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      notifications: inbox.notifications.map(serializeNotification),
      stats: inbox.stats,
      pagination: inbox.pagination,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/v1/notifications/:notificationId/read
 *
 * getNotificationDetail 은 조회와 동시에 읽음 처리한다(findOneAndUpdate).
 * userId 를 조건에 함께 걸어서 **남의 알림은 404 로 떨어진다** — 소유권 검사를
 * 컨트롤러가 따로 하지 않는 이유다.
 */
exports.markRead = async (req, res, next) => {
  try {
    const notification = await getNotificationDetail({
      userId: req.apiUser._id,
      notificationId: req.params.notificationId,
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      notification: serializeNotification(notification),
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /api/v1/notifications/read-all */
exports.markAllRead = async (req, res, next) => {
  try {
    const result = await markAllNotificationsRead(req.apiUser._id);
    res.set("Cache-Control", "no-store");
    return res.json({ updated: result.updated });
  } catch (error) {
    return next(error);
  }
};

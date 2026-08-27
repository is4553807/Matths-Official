const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { UserNotification } = require("../models/matthsModel");
const controller = require("../controllers/ipadNotificationController");

function invoke(handler, request) {
  return new Promise((resolve, reject) => {
    const response = {
      headers: {},
      set(name, value) {
        this.headers[String(name).toLowerCase()] = String(value);
        return this;
      },
      json(body) {
        resolve({ body, headers: this.headers });
        return this;
      },
    };
    Promise.resolve(handler(request, response, reject)).catch(reject);
  });
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "이 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);
  const userId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  try {
    const baseTime = Date.now() - 100_000;
    const documents = Array.from({ length: 25 }, (_, index) => ({
      userId,
      title: `iPad 알림 ${index + 1}`,
      message: `iPad 알림 DB 검증 메시지 ${index + 1}`,
      href: index === 24 ? "https://attacker.example/path" : `/notifications/${index + 1}`,
      kind: index < 3 ? "warning" : "system",
      tone: index < 3 ? "urgent" : "",
      sourceType: "IPAD_NOTIFICATION_DB_AUDIT",
      dedupeKey: `ipad-notification-db-audit-${userId}-${index}`,
      createdAt: new Date(baseTime + index * 1000),
      updatedAt: new Date(baseTime + index * 1000),
    }));
    const inserted = await UserNotification.insertMany([
      ...documents,
      {
        userId: otherUserId,
        title: "다른 사용자 알림",
        message: "소유권 검증용",
        href: "/main",
        kind: "account",
      },
    ]);

    const firstPage = await invoke(controller.getInbox, {
      apiUser: { _id: userId },
      query: { page: "1" },
    });
    assert.equal(firstPage.headers["cache-control"], "no-store");
    assert.equal(firstPage.body.notifications.length, 20);
    assert.deepEqual(firstPage.body.stats, {
      total: 25,
      unread: 25,
      urgentUnread: 3,
      read: 0,
    });
    assert.deepEqual(firstPage.body.pagination, {
      page: 1,
      totalPages: 2,
      hasPrevious: false,
      hasNext: true,
    });
    const newest = firstPage.body.notifications[0];
    assert.equal(newest.title, "iPad 알림 25");
    assert.equal(newest.href, "/main", "외부 href가 앱 응답으로 통과했습니다.");
    for (const forbidden of ["_id", "userId", "createdBy", "dedupeKey"]) {
      assert.equal(Object.hasOwn(newest, forbidden), false, `${forbidden}가 앱 응답에 노출됩니다.`);
    }

    const secondPage = await invoke(controller.getInbox, {
      apiUser: { _id: userId },
      query: { page: "999" },
    });
    assert.equal(secondPage.body.notifications.length, 5);
    assert.equal(secondPage.body.pagination.page, 2);
    assert.equal(secondPage.body.pagination.hasPrevious, true);
    assert.equal(secondPage.body.pagination.hasNext, false);

    const selected = inserted.find((item) => String(item.userId) === String(userId));
    const readResult = await invoke(controller.markRead, {
      apiUser: { _id: userId },
      params: { notificationId: String(selected._id) },
    });
    assert.equal(readResult.headers["cache-control"], "no-store");
    assert.equal(readResult.body.notification.id, String(selected._id));
    assert.ok(readResult.body.notification.readAt);

    const foreign = inserted.find((item) => String(item.userId) === String(otherUserId));
    await assert.rejects(
      invoke(controller.markRead, {
        apiUser: { _id: userId },
        params: { notificationId: String(foreign._id) },
      }),
      (error) => error?.status === 404
    );

    const allRead = await invoke(controller.markAllRead, {
      apiUser: { _id: userId },
    });
    assert.equal(allRead.body.updated, 24);
    assert.equal(
      await UserNotification.countDocuments({ userId, readAt: null }),
      0
    );
    assert.equal(
      await UserNotification.countDocuments({ userId: otherUserId, readAt: null }),
      1,
      "전체 읽음이 다른 사용자 알림까지 변경했습니다."
    );

    console.log(
      "iPad notification isolated DB verification passed: 25-row pagination, stats, " +
        "serializer boundary, external href sanitization, ownership, single read, and read-all."
    );
  } finally {
    await UserNotification.deleteMany({ userId: { $in: [userId, otherUserId] } });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

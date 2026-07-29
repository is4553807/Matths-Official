const {
  UserNotification,
} = require("../models/matthsModel");
const mongoose =
  require("mongoose");

const NOTIFICATIONS_PER_PAGE = 20;

function safePage(value) {
  return Math.max(
    1,
    Number.parseInt(value, 10) || 1
  );
}

function safeInternalHref(value) {
  const href = String(
    value || ""
  ).trim();

  return /^\/(?!\/)/.test(href)
    ? href
    : "/main";
}

async function getNotificationInbox({
  userId,
  page,
}) {
  const currentPage =
    safePage(page);
  const filter = { userId };
  const [total, unread, urgentUnread] =
    await Promise.all([
      UserNotification.countDocuments(
        filter
      ),
      UserNotification.countDocuments({
        ...filter,
        readAt: null,
      }),
      UserNotification.countDocuments({
        ...filter,
        readAt: null,
        kind: {
          $in: [
            "warning",
            "account",
            "nickname",
            "integrity",
          ],
        },
      }),
    ]);
  const totalPages = Math.max(
    1,
    Math.ceil(
      total /
        NOTIFICATIONS_PER_PAGE
    )
  );
  const safeCurrentPage =
    Math.min(
      currentPage,
      totalPages
    );
  const notifications =
    await UserNotification.find(
      filter
    )
      .sort({ createdAt: -1 })
      .skip(
        (safeCurrentPage - 1) *
          NOTIFICATIONS_PER_PAGE
      )
      .limit(
        NOTIFICATIONS_PER_PAGE
      )
      .lean();

  return {
    notifications:
      notifications.map(
        (notification) => ({
          ...notification,
          id: String(
            notification._id
          ),
          targetHref:
            safeInternalHref(
              notification.href
            ),
          openHref:
            `/notifications/${notification._id}`,
        })
      ),
    stats: {
      total,
      unread,
      urgentUnread,
      read: Math.max(
        0,
        total - unread
      ),
    },
    pagination: {
      page: safeCurrentPage,
      totalPages,
      hasPrevious:
        safeCurrentPage > 1,
      hasNext:
        safeCurrentPage <
        totalPages,
    },
  };
}

async function getNotificationDetail({
  userId,
  notificationId,
}) {
  if (
    !mongoose.isValidObjectId(
      notificationId
    )
  ) {
    const error =
      new Error(
        "알림을 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  const notification =
    await UserNotification.findOneAndUpdate(
      {
        _id:
          notificationId,
        userId,
      },
      {
        $set: {
          readAt: new Date(),
          dashboardDismissedAt:
            new Date(),
        },
      },
      {
        returnDocument: "after",
      }
    ).lean();

  if (!notification) {
    const error =
      new Error(
        "알림을 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  return {
    ...notification,
    id:
      String(
        notification._id
      ),
    targetHref:
      safeInternalHref(
        notification.href
      ),
  };
}

async function markAllNotificationsRead(
  userId
) {
  const result =
    await UserNotification.updateMany(
      {
        userId,
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
          dashboardDismissedAt:
            new Date(),
        },
      }
    );

  return {
    updated:
      Number(
        result.modifiedCount
      ) || 0,
  };
}

async function dismissDashboardAnnouncement({
  userId,
  announcementId,
}) {
  if (
    !mongoose.isValidObjectId(
      announcementId
    )
  ) {
    const error =
      new Error(
        "공지를 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  const notification =
    await UserNotification.findOneAndUpdate(
      {
        userId,
        announcementId,
      },
      {
        $set: {
          dashboardDismissedAt:
            new Date(),
        },
      },
      {
        returnDocument: "after",
      }
    ).lean();

  if (!notification) {
    const error =
      new Error(
        "닫을 수 있는 공지를 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  return {
    dismissed: true,
    announcementId:
      String(announcementId),
  };
}

async function dismissDashboardNotification({
  userId,
  notificationId,
}) {
  if (
    !mongoose.isValidObjectId(
      notificationId
    )
  ) {
    const error =
      new Error(
        "알림을 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  const notification =
    await UserNotification.findOneAndUpdate(
      {
        _id:
          notificationId,
        userId,
        kind: {
          $in: [
            "warning",
            "account",
            "nickname",
            "integrity",
          ],
        },
      },
      {
        $set: {
          dashboardDismissedAt:
            new Date(),
        },
      },
      {
        returnDocument: "after",
      }
    ).lean();

  if (!notification) {
    const error =
      new Error(
        "닫을 수 있는 중요 알림을 찾을 수 없습니다."
      );
    error.status = 404;
    throw error;
  }

  return {
    dismissed: true,
    notificationId:
      String(
        notification._id
      ),
  };
}

module.exports = {
  NOTIFICATIONS_PER_PAGE,
  dismissDashboardAnnouncement,
  dismissDashboardNotification,
  getNotificationInbox,
  getNotificationDetail,
  markAllNotificationsRead,
};

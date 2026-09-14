const {
  ParentAccount,
  ParentChildLink,
} = require("../models/parentModel");
const { User } = require("../models/matthsModel");

const CHILD_SELECT_FIELDS = [
  "name",
  "realName",
  "schoolGrade",
  "school",
  "university",
  "educationStatus",
  "totalStudySeconds",
  "currentStreak",
  "lastStudyDate",
  "lastLoginAt",
  "createdAt",
  "isActive",
  "accountStatus",
].join(" ");

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function ensureParentAccountIndexes() {
  let indexes = [];
  try {
    indexes = await ParentAccount.collection.indexes();
  } catch (error) {
    if (Number(error?.code) !== 26 && error?.codeName !== "NamespaceNotFound") throw error;
  }

  const legacyChildIndex = indexes.find((index) => (
    index?.unique === true &&
    index?.key?.childUserId === 1 &&
    Object.keys(index.key || {}).length === 1 &&
    !index.partialFilterExpression
  ));
  if (legacyChildIndex?.name) {
    try {
      await ParentAccount.collection.dropIndex(legacyChildIndex.name);
    } catch (error) {
      if (Number(error?.code) !== 27 && error?.codeName !== "IndexNotFound") throw error;
    }
  }
  await ParentAccount.createIndexes();
  return { removedLegacyChildIndex: legacyChildIndex?.name || "" };
}

async function ensureLegacyParentChildLink(parent) {
  if (!parent?.childUserId) return null;
  return ParentChildLink.findOneAndUpdate(
    {
      parentAccountId: parent._id,
      childUserId: parent.childUserId,
    },
    {
      $setOnInsert: {
        parentAccountId: parent._id,
        childUserId: parent.childUserId,
        status: "ACTIVE",
        linkedAt: parent.createdAt || new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
}

async function linkChildToParent({ parentAccountId, childUserId, relationship = null, linkConsentAt = null }) {
  const parent = await ParentAccount.findById(parentAccountId);
  if (!parent || !parent.isActive) {
    throw statusError(403, "학부모 계정 이용 상태를 확인해주세요.");
  }

  const [otherActiveLink, otherLegacyParent] = await Promise.all([
    ParentChildLink.exists({
      childUserId,
      status: "ACTIVE",
      parentAccountId: { $ne: parent._id },
    }),
    ParentAccount.exists({
      _id: { $ne: parent._id },
      childUserId,
      isActive: true,
    }),
  ]);
  if (otherActiveLink || otherLegacyParent) {
    throw statusError(409, "이 자녀는 이미 다른 학부모 계정과 연결되어 있습니다.");
  }

  const link = await ParentChildLink.findOneAndUpdate(
    { parentAccountId: parent._id, childUserId },
    {
      $set: {
        status: "ACTIVE",
        linkedAt: new Date(),
        ...(relationship && linkConsentAt ? { relationship, linkConsentAt } : {}),
      },
      $setOnInsert: {
        parentAccountId: parent._id,
        childUserId,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  );

  if (!parent.childUserId) {
    parent.childUserId = childUserId;
    await parent.save();
  }
  return link;
}

async function getParentFamily({ parentId, selectedChildUserId = null, readOnly = false }) {
  const parent = await ParentAccount.findById(parentId).lean();
  if (!parent || (!readOnly && !parent.isActive)) {
    throw statusError(403, "학부모 계정 이용 상태를 확인해주세요.");
  }

  if (!readOnly) await ensureLegacyParentChildLink(parent);
  const links = await ParentChildLink.find({
    parentAccountId: parent._id,
    status: "ACTIVE",
  })
    .sort({ linkedAt: 1, _id: 1 })
    .populate("childUserId", CHILD_SELECT_FIELDS)
    .lean();
  // Preview legacy records without creating links as a side effect of a GET.
  if (readOnly && parent.childUserId && !links.some(link => String(link.childUserId?._id) === String(parent.childUserId))) {
    const existingLink = await ParentChildLink.exists({ parentAccountId: parent._id, childUserId: parent.childUserId });
    // A revoked link must stay revoked, including in the legacy view.
    if (!existingLink) {
      const child = await User.findById(parent.childUserId).select(CHILD_SELECT_FIELDS).lean();
      if (child) links.push({ _id: null, childUserId: child, linkedAt: parent.createdAt, notificationSettings: {} });
    }
  }

  const children = links
    .filter((link) => {
      const child = link.childUserId;
      return child && (readOnly || (child.isActive !== false && child.accountStatus !== "withdrawn"));
    })
    .map((link) => ({
      linkId: String(link._id),
      childId: String(link.childUserId._id),
      child: link.childUserId,
      notificationSettings: link.notificationSettings || {},
      linkedAt: link.linkedAt,
    }));

  if (!children.length) {
    throw statusError(
      404,
      "연결된 자녀 계정을 찾을 수 없습니다.",
      "PARENT_CHILD_LINK_REQUIRED"
    );
  }

  const requestedId = String(selectedChildUserId || "");
  const selected = children.find((entry) => entry.childId === requestedId) || children[0];
  return {
    parent,
    children,
    selected,
    child: selected.child,
  };
}

function normalizeChoice(value, allowed, fallback) {
  const number = Number(value);
  return allowed.includes(number) ? number : fallback;
}

async function updateParentNotificationSettings({
  parentAccountId,
  childUserId,
  input,
  now = new Date(),
}) {
  const link = await ParentChildLink.findOne({
    parentAccountId,
    childUserId,
    status: "ACTIVE",
  });
  if (!link) {
    throw statusError(404, "알림을 설정할 자녀 연결을 찾을 수 없습니다.");
  }

  link.notificationSettings = {
    emailEnabled: input.emailEnabled === "1" || input.emailEnabled === true,
    lowLearning: {
      enabled: input.lowLearningEnabled === "1" || input.lowLearningEnabled === true,
      minimumMinutesPerDay: normalizeChoice(
        input.minimumMinutesPerDay,
        [10, 20, 30, 45, 60],
        20
      ),
      consecutiveDays: normalizeChoice(
        input.lowLearningConsecutiveDays,
        [2, 3, 5, 7],
        3
      ),
    },
    inactivity: {
      enabled: input.inactivityEnabled === "1" || input.inactivityEnabled === true,
      days: normalizeChoice(input.inactivityDays, [3, 5, 7, 14, 30], 7),
    },
    updatedAt: now,
  };
  await link.save();
  return link.toObject();
}

module.exports = {
  CHILD_SELECT_FIELDS,
  ensureParentAccountIndexes,
  ensureLegacyParentChildLink,
  getParentFamily,
  linkChildToParent,
  updateParentNotificationSettings,
};

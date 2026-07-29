const {
  User,
} = require("../models/matthsModel");

const TIME_ZONE = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UPDATE_RETRIES = 4;

function getKoreanDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  );

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(
        (part) =>
          part.type !== "literal"
      )
      .map((part) => [
        part.type,
        Number(part.value),
      ])
  );
}

function getKoreanDateKey(date = new Date()) {
  const {
    year,
    month,
    day,
  } = getKoreanDateParts(date);

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function dateKeyToDayNumber(dateKey) {
  const [year, month, day] = String(
    dateKey || ""
  )
    .split("-")
    .map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return Math.floor(
    Date.UTC(year, month - 1, day) /
      DAY_MS
  );
}

function getDateGapInDays(
  earlierDate,
  laterDate = new Date()
) {
  if (!earlierDate) return null;

  const earlierDay =
    dateKeyToDayNumber(
      getKoreanDateKey(earlierDate)
    );
  const laterDay =
    dateKeyToDayNumber(
      getKoreanDateKey(laterDate)
    );

  if (
    earlierDay === null ||
    laterDay === null
  ) {
    return null;
  }

  return laterDay - earlierDay;
}

function getAcademicYear(date = new Date()) {
  const {
    year,
    month,
  } = getKoreanDateParts(date);

  return month >= 3
    ? year
    : year - 1;
}

function getGradeLabel(schoolGrade) {
  return {
    10: "고등학교 1학년",
    11: "고등학교 2학년",
    12: "고등학교 3학년",
    13: "N수생",
  }[Number(schoolGrade)] || "학년 미설정";
}

function getEffectiveStreak(
  user,
  now = new Date()
) {
  const gap = getDateGapInDays(
    user?.lastStudyDate,
    now
  );

  if (
    gap === null ||
    gap < 0 ||
    gap > 1
  ) {
    return 0;
  }

  return Math.max(
    0,
    Number(user?.currentStreak) || 0
  );
}

function lifecycleSessionView(
  user,
  now = new Date()
) {
  if (!user) return null;

  return {
    schoolGrade:
      Number(user.schoolGrade) || 10,
    currentStreak:
      getEffectiveStreak(user, now),
    longestStreak:
      Number(user.longestStreak) || 0,
    lastStudyDate:
      user.lastStudyDate || null,
    lifecycleDateKey:
      getKoreanDateKey(now),
  };
}

async function synchronizeUserLifecycle(
  userId,
  now = new Date()
) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error(
      "사용자 정보를 찾을 수 없습니다."
    );
    error.status = 404;
    throw error;
  }

  const currentAcademicYear =
    getAcademicYear(now);
  const baseAcademicYear =
    user.lastGradePromotionYear !==
      null &&
    user.lastGradePromotionYear !==
      undefined &&
    Number.isInteger(
      Number(
        user.lastGradePromotionYear
      )
    )
      ? Number(user.lastGradePromotionYear)
      : getAcademicYear(
          user.createdAt || now
        );
  const promotions = Math.max(
    0,
    currentAcademicYear -
      baseAcademicYear
  );

  if (promotions > 0) {
    user.schoolGrade = Math.min(
      13,
      Math.max(
        10,
        Number(user.schoolGrade) || 10
      ) + promotions
    );
  }

  user.lastGradePromotionYear =
    currentAcademicYear;

  if (
    getEffectiveStreak(user, now) === 0 &&
    Number(user.currentStreak) !== 0
  ) {
    user.currentStreak = 0;
  }

  await user.save();
  return user;
}

async function recordStudyActivity(
  userId,
  now = new Date()
) {
  for (
    let attempt = 0;
    attempt < MAX_UPDATE_RETRIES;
    attempt += 1
  ) {
    const user = await User.findById(
      userId
    ).lean();

    if (!user) {
      const error = new Error(
        "사용자 정보를 찾을 수 없습니다."
      );
      error.status = 404;
      throw error;
    }

    const gap = getDateGapInDays(
      user.lastStudyDate,
      now
    );
    const previousStreak = Math.max(
      0,
      Number(user.currentStreak) || 0
    );

    let nextStreak = 1;

    if (gap === 0) {
      nextStreak = Math.max(
        1,
        previousStreak
      );
    } else if (gap === 1) {
      nextStreak =
        previousStreak + 1;
    }

    const previousLastStudyDate =
      user.lastStudyDate || null;

    const updated =
      await User.findOneAndUpdate(
        {
          _id: user._id,
          lastStudyDate:
            previousLastStudyDate,
        },
        {
          $set: {
            currentStreak:
              nextStreak,
            longestStreak: Math.max(
              Number(
                user.longestStreak
              ) || 0,
              nextStreak
            ),
            lastStudyDate: now,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      );

    if (updated) {
      return updated;
    }
  }

  const error = new Error(
    "연속 학습 기록을 갱신하지 못했습니다. 잠시 후 다시 시도해주세요."
  );
  error.status = 409;
  throw error;
}

module.exports = {
  TIME_ZONE,
  getKoreanDateParts,
  getKoreanDateKey,
  getDateGapInDays,
  getAcademicYear,
  getGradeLabel,
  getEffectiveStreak,
  lifecycleSessionView,
  synchronizeUserLifecycle,
  recordStudyActivity,
};

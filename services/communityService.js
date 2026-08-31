const mongoose = require("mongoose");
const crypto = require("crypto");
const fs = require("fs");
const {
  AdminActionLog,
  Announcement,
  CommunityBoardNotice,
  CommunityComment,
  CommunityPost,
  CommunityPostingQuota,
  CommunityReport,
  CommunityUserBlock,
  CommunityVote,
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  deliverModerationNotice,
} = require("./moderationNoticeService");
const {
  completeAdminTodoBySource,
  createAdminTodo,
} = require("./adminTodoService");
const communityEmailCopy =
  require("../content/email/community");
const {
  COMMUNITY_ATTACHMENT_LIMIT,
  COMMUNITY_ATTACHMENT_TOTAL_MAX_BYTES,
  COMMUNITY_IMAGE_MAX_BYTES,
  communityAttachmentCloudUrl,
  discardCommunityUploads,
  isCommunityImage,
  safeCommunityAttachmentPath,
  serializeCommunityUpload,
} = require("./communityAttachmentService");

const COMMUNITY_PAGE_SIZE = 20;
const ADMIN_COMMUNITY_PAGE_SIZE = 25;
const COMMUNITY_DAILY_POST_LIMIT = 5;
const POPULAR_POST_WINDOW_MS =
  72 * 60 * 60 * 1000;
const POPULAR_POST_UPVOTES =
  100;
const BOARD_LABELS = {
  "high-school":
    "통합 게시판",
  school: "학교 게시판",
  retaker: "N수생 게시판",
  university: "대학교 게시판",
  worker: "직장인 게시판",
  operations: "운영 게시판",
};
const OPERATIONS_CATEGORY_LABELS = {
  notice: "일반 공지",
  rules: "규칙",
  policies: "방침",
  manuals: "설명서",
  "inquiry-rules":
    "문의 규칙",
};
const COMMUNITY_BOARD_RULES = {
  "high-school": {
    eyebrow: "COMMUNITY RULES",
    title:
      "통합 게시판 운영 규칙",
    introduction:
      "소속과 이용자 유형을 넘어 누구나 수학과 학습에 관한 정보를 안전하게 나누는 공간입니다.",
    sections: [
      {
        title: "서로를 존중해주세요",
        content:
          "욕설, 비하, 괴롭힘, 차별, 도배, 허위 사실 유포 및 분쟁을 유도하는 글은 신고 검토 후 숨김·삭제되거나 경고가 부여될 수 있습니다.",
      },
      {
        title: "개인정보와 저작권을 지켜주세요",
        content:
          "본인이나 타인의 연락처, 계정, 얼굴, 학교 식별 정보 등 민감한 개인정보를 올리지 마세요. 첨부하는 자료는 직접 만들었거나 공유할 권한이 있는 자료여야 합니다.",
      },
      {
        title: "게시글은 하루 최대 5개입니다",
        content:
          "모든 게시판을 합산하여 한국 시간 기준 하루에 게시글을 최대 5개까지 작성할 수 있습니다. 댓글 작성 횟수는 이 한도에 포함되지 않습니다.",
      },
      {
        title: "사진·파일 첨부 기준",
        content:
          "게시글 하나에 사진 또는 파일을 최대 5개, 파일당 10MB까지 첨부할 수 있습니다. 경고 횟수가 0회인 계정만 첨부할 수 있으며, 관리자가 경고를 0회로 조정하면 즉시 다시 이용할 수 있습니다.",
      },
    ],
  },
  school: {
    eyebrow: "SCHOOL BOARD RULES",
    title:
      "학교 게시판 운영 규칙",
    introduction:
      "같은 학교 구성원이 학습과 학교생활 정보를 나누는 공간입니다. 친밀한 공간일수록 서로를 특정할 수 있는 표현에 더 주의해주세요.",
    sections: [
      {
        title: "학교 구성원을 보호해주세요",
        content:
          "학생, 교직원 또는 특정 학급을 알아볼 수 있는 실명·사진·연락처·소문을 게시하지 마세요. 비방이나 따돌림을 유도하는 글은 신고 검토 후 제재될 수 있습니다.",
      },
      {
        title: "정확하고 필요한 정보를 나눠주세요",
        content:
          "시험, 수행평가, 학교 일정 등은 확인된 정보만 공유하고 시험 보안이나 부정행위에 해당하는 자료는 게시하지 마세요.",
      },
      {
        title: "게시글은 하루 최대 5개입니다",
        content:
          "통합 게시판을 포함한 전체 게시판에서 한국 시간 기준 하루에 게시글을 최대 5개까지 작성할 수 있습니다.",
      },
      {
        title: "사진·파일 첨부 기준",
        content:
          "게시글 하나에 사진 또는 파일을 최대 5개, 파일당 10MB까지 첨부할 수 있습니다. 경고 횟수가 0회인 계정만 첨부할 수 있으며, 관리자가 경고를 0회로 조정하면 즉시 다시 이용할 수 있습니다.",
      },
    ],
  },
  retaker: {
    eyebrow: "RETAKER BOARD RULES",
    title:
      "N수생 게시판 운영 규칙",
    introduction:
      "현재 N수생으로 등록된 이용자가 입시 준비와 학습 정보를 안전하게 나누는 전용 공간입니다.",
    sections: [
      {
        title: "서로의 상황을 존중해주세요",
        content:
          "재도전 횟수, 성적, 출신 학교나 개인 사정을 이용해 타인을 비하하거나 특정할 수 있는 내용을 올리지 마세요.",
      },
      {
        title: "확인된 입시 정보만 공유해주세요",
        content:
          "원서, 시험, 학원 및 대학 관련 정보는 출처와 기준 시점을 확인하고 허위 정보나 광고성 게시물을 올리지 마세요.",
      },
      {
        title: "게시글은 하루 최대 5개입니다",
        content:
          "다른 게시판의 작성 횟수를 포함해 한국 시간 기준 하루 최대 5개까지 작성할 수 있습니다.",
      },
      {
        title: "사진·파일 첨부 기준",
        content:
          "게시글 하나에 사진 또는 파일을 최대 5개, 파일당 10MB까지 첨부할 수 있습니다. 경고 횟수가 0회인 계정만 첨부할 수 있습니다.",
      },
    ],
  },
  university: {
    eyebrow: "UNIVERSITY BOARD RULES",
    title: "대학교 게시판 운영 규칙",
    introduction: "같은 대학교에 재학 중인 이용자가 대학 생활과 학습 정보를 안전하게 나누는 전용 공간입니다.",
    sections: [
      {
        title: "같은 학교 구성원을 보호해주세요",
        content: "개인을 특정할 수 있는 학과·학번·수업 정보와 연락처를 게시하지 마세요. 비방, 괴롭힘 또는 확인되지 않은 소문은 신고 검토 후 제재될 수 있습니다.",
      },
      {
        title: "확인된 정보만 공유해주세요",
        content: "수업, 시험, 장학금, 편입 및 진로 정보는 기준 시점과 출처를 확인하고 시험 보안이나 부정행위에 해당하는 자료를 올리지 마세요.",
      },
      {
        title: "게시글은 하루 최대 5개입니다",
        content: "다른 게시판의 작성 횟수를 포함해 한국 시간 기준 하루 최대 5개까지 작성할 수 있습니다.",
      },
      {
        title: "사진·파일 첨부 기준",
        content: "게시글 하나에 사진 또는 파일을 최대 5개, 파일당 10MB까지 첨부할 수 있습니다. 경고 횟수가 0회인 계정만 첨부할 수 있습니다.",
      },
    ],
  },
  worker: {
    eyebrow: "WORKER BOARD RULES",
    title: "직장인 게시판 운영 규칙",
    introduction: "직장인으로 등록된 이용자가 업무와 학습을 병행하는 경험, 진로와 수학 학습 정보를 나누는 전용 공간입니다.",
    sections: [
      {
        title: "회사와 개인 정보를 보호해주세요",
        content: "회사명, 부서, 실명, 업무 문서처럼 본인이나 타인을 특정할 수 있는 정보와 회사의 비공개 자료를 게시하지 마세요.",
      },
      {
        title: "광고와 채용 사기를 주의해주세요",
        content: "과도한 홍보, 금전 거래 유도, 허위 채용 정보와 불분명한 외부 링크는 신고 검토 후 삭제되거나 제재될 수 있습니다.",
      },
      {
        title: "게시글은 하루 최대 5개입니다",
        content: "다른 게시판의 작성 횟수를 포함해 한국 시간 기준 하루 최대 5개까지 작성할 수 있습니다.",
      },
      {
        title: "사진·파일 첨부 기준",
        content: "게시글 하나에 사진 또는 파일을 최대 5개, 파일당 10MB까지 첨부할 수 있습니다. 경고 횟수가 0회인 계정만 첨부할 수 있습니다.",
      },
    ],
  },
};
const communityPostingLocks =
  new Map();

function statusError(
  status,
  message
) {
  const error =
    new Error(message);
  error.status = status;
  return error;
}

function getKoreanDayRange(
  value = new Date()
) {
  const koreaOffsetMs =
    9 * 60 * 60 * 1000;
  const koreaTime = new Date(
    value.getTime() +
      koreaOffsetMs
  );
  const start = new Date(
    Date.UTC(
      koreaTime.getUTCFullYear(),
      koreaTime.getUTCMonth(),
      koreaTime.getUTCDate()
    ) - koreaOffsetMs
  );
  const year = String(
    koreaTime.getUTCFullYear()
  );
  const month = String(
    koreaTime.getUTCMonth() + 1
  ).padStart(2, "0");
  const day = String(
    koreaTime.getUTCDate()
  ).padStart(2, "0");

  return {
    start,
    end: new Date(
      start.getTime() +
        24 * 60 * 60 * 1000
    ),
    dayKey:
      `${year}-${month}-${day}`,
  };
}

async function withCommunityPostingLock(
  userId,
  callback
) {
  const key = String(userId);
  const previous =
    communityPostingLocks.get(
      key
    ) || Promise.resolve();
  let release;
  const gate = new Promise(
    (resolve) => {
      release = resolve;
    }
  );
  const tail = previous
    .catch(() => {})
    .then(() => gate);
  communityPostingLocks.set(
    key,
    tail
  );

  await previous.catch(() => {});
  try {
    return await callback();
  } finally {
    release();
    if (
      communityPostingLocks.get(
        key
      ) === tail
    ) {
      communityPostingLocks.delete(
        key
      );
    }
  }
}

function communityDailyLimitError() {
  return statusError(
    429,
    `게시글은 모든 게시판을 합쳐 하루에 최대 ${COMMUNITY_DAILY_POST_LIMIT}개까지 작성할 수 있습니다. 한국 시간 자정 이후 다시 작성해주세요.`
  );
}

async function reserveCommunityPostSlot(
  userId
) {
  const {
    start,
    end,
    dayKey,
  } = getKoreanDayRange();
  const expiresAt = new Date(
    end.getTime() +
      2 * 24 * 60 * 60 * 1000
  );

  for (
    let attempt = 0;
    attempt < 6;
    attempt += 1
  ) {
    const quota =
      await CommunityPostingQuota.findOneAndUpdate(
        {
          userId,
          dayKey,
          count: {
            $lt:
              COMMUNITY_DAILY_POST_LIMIT,
          },
        },
        {
          $inc: {
            count: 1,
          },
          $set: {
            expiresAt,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      ).lean();

    if (quota) {
      return { dayKey };
    }

    const existingPostCount =
      await CommunityPost.countDocuments(
        {
          authorId: userId,
          createdAt: {
            $gte: start,
            $lt: end,
          },
        }
      );
    if (
      existingPostCount >=
      COMMUNITY_DAILY_POST_LIMIT
    ) {
      throw communityDailyLimitError();
    }

    try {
      await CommunityPostingQuota.create({
        userId,
        dayKey,
        count:
          existingPostCount +
          1,
        expiresAt,
      });
      return { dayKey };
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  throw communityDailyLimitError();
}

async function releaseCommunityPostSlot({
  userId,
  dayKey,
}) {
  await CommunityPostingQuota.updateOne(
    {
      userId,
      dayKey,
      count: {
        $gt: 0,
      },
    },
    {
      $inc: {
        count: -1,
      },
    }
  );
}

function getCommunityBoardRules({
  board,
  schoolCode = "",
  schoolName = "",
  universityCode = "",
  universityName = "",
} = {}) {
  const normalizedBoard =
    String(board || "");
  if (
    !Object.prototype
      .hasOwnProperty.call(
        COMMUNITY_BOARD_RULES,
        normalizedBoard
      )
  ) {
    throw statusError(
      404,
      "해당 게시판 운영 규칙을 찾을 수 없습니다."
    );
  }

  const template =
    COMMUNITY_BOARD_RULES[
      normalizedBoard
    ];
  const cleanSchoolCode =
    cleanSingleLine(
      schoolCode,
      100
    );
  const cleanSchoolName =
    cleanSingleLine(
      schoolName,
      120
    );
  const cleanUniversityCode = cleanSingleLine(universityCode, 100);
  const cleanUniversityName = cleanSingleLine(universityName, 160);

  return {
    ...template,
    board:
      normalizedBoard,
    boardLabel:
      normalizedBoard ===
        "school" &&
      cleanSchoolName
        ? `${cleanSchoolName} 게시판`
        : normalizedBoard === "university" && cleanUniversityName
          ? `${cleanUniversityName} 게시판`
        : BOARD_LABELS[
            normalizedBoard
          ],
    schoolCode:
      normalizedBoard ===
      "school"
        ? cleanSchoolCode
        : "",
    schoolName:
      normalizedBoard ===
      "school"
        ? cleanSchoolName
        : "",
    universityCode:
      normalizedBoard === "university" ? cleanUniversityCode : "",
    universityName:
      normalizedBoard === "university" ? cleanUniversityName : "",
    updatedAt: new Date(
      "2026-08-01T00:00:00+09:00"
    ),
  };
}

function createCommunityRulesNotice({
  board,
  selectedSchool,
  selectedUniversity,
}) {
  const rules =
    getCommunityBoardRules({
      board,
      schoolCode:
        selectedSchool?.code ||
        "",
      schoolName:
        selectedSchool?.name ||
        "",
      universityCode:
        selectedUniversity?.code || "",
      universityName:
        selectedUniversity?.name || "",
    });
  const query = new URLSearchParams();
  if (rules.schoolCode) {
    query.set(
      "school",
      rules.schoolCode
    );
  }
  if (rules.universityCode) {
    query.set("university", rules.universityCode);
  }

  return {
    _id:
      `rules-${rules.board}`,
    title:
      `[공지] ${rules.title}`,
    content:
      `${rules.introduction} 게시글 작성과 첨부파일 이용 전에 운영 규칙을 확인해주세요.`,
    authorName:
      "Matths 운영팀",
    isPinned: true,
    isBoardRulesNotice:
      true,
    rulesHref:
      `/community/rules/${rules.board}${
        query.toString()
          ? `?${query.toString()}`
          : ""
      }`,
    createdAt:
      rules.updatedAt,
    publishedAt:
      rules.updatedAt,
    viewCount: 0,
    upvoteCount: 0,
    downvoteCount: 0,
  };
}

let defaultCommunityNoticesPromise;

function rulesNoticeContent(
  rules
) {
  return [
    rules.introduction,
    ...rules.sections.map(
      (section) =>
        `${section.title}\n${section.content}`
    ),
  ].join("\n\n");
}

async function ensureDefaultCommunityNotices() {
  if (
    defaultCommunityNoticesPromise
  ) {
    return defaultCommunityNoticesPromise;
  }

  defaultCommunityNoticesPromise =
    Promise.all(
      [
        "high-school",
        "school",
        "retaker",
        "university",
        "worker",
      ].map((boardType) => {
        const rules =
          getCommunityBoardRules({
            board: boardType,
          });
        return CommunityBoardNotice.updateOne(
          {
            systemKey:
              `default-rules-${boardType}`,
          },
          {
            $setOnInsert: {
              boardType,
              schoolCode: "",
              schoolName: "",
              universityCode: "",
              universityName: "",
              title:
                `[필독] ${rules.title}`,
              content:
                rulesNoticeContent(
                  rules
                ),
              status:
                "published",
              isPinned: true,
              pinnedAt:
                rules.updatedAt,
              systemKey:
                `default-rules-${boardType}`,
            },
          },
          {
            upsert: true,
          }
        );
      })
    ).catch((error) => {
      defaultCommunityNoticesPromise =
        null;
      throw error;
    });

  return defaultCommunityNoticesPromise;
}

function serializeCommunityNotice(
  notice
) {
  return {
    ...notice,
    authorName:
      "Matths 운영팀",
    isCommunityNotice: true,
    noticeHref:
      `/community/notices/${notice._id}`,
    viewCount: 0,
    upvoteCount: 0,
    downvoteCount: 0,
  };
}

async function getCommunityViewer(
  userId
) {
  if (
    !userId ||
    !mongoose.isValidObjectId(
      userId
    )
  ) {
    return null;
  }

  return User.findOne({
    _id: userId,
    isActive: true,
    accountStatus: {
      $in: [
        "active",
        null,
      ],
    },
  })
    .select("school university role schoolGrade educationStatus")
    .lean();
}

async function getCommunityHiddenUserIds(
  viewerId
) {
  if (
    !viewerId ||
    !mongoose.isValidObjectId(viewerId)
  ) {
    return [];
  }

  const relationships =
    await CommunityUserBlock.find({
      $or: [
        { blockerUserId: viewerId },
        { blockedUserId: viewerId },
      ],
    })
      .select("blockerUserId blockedUserId")
      .lean();

  const hiddenIds = new Map();
  for (const relationship of relationships) {
    const blockerId = String(relationship.blockerUserId);
    const otherId = blockerId === String(viewerId)
      ? relationship.blockedUserId
      : relationship.blockerUserId;
    hiddenIds.set(String(otherId), otherId);
  }
  return [...hiddenIds.values()];
}

async function assertNoCommunityBlockBetween(
  firstUserId,
  secondUserId
) {
  if (
    !firstUserId ||
    !secondUserId ||
    String(firstUserId) === String(secondUserId)
  ) {
    return;
  }
  const relationship =
    await CommunityUserBlock.exists({
      $or: [
        {
          blockerUserId: firstUserId,
          blockedUserId: secondUserId,
        },
        {
          blockerUserId: secondUserId,
          blockedUserId: firstUserId,
        },
      ],
    });
  if (relationship) {
    throw statusError(
      404,
      "차단 관계에 있는 사용자의 커뮤니티 콘텐츠는 표시하지 않습니다."
    );
  }
}

function privateBoardForViewer(viewer) {
  return {
    13: "retaker",
    14: "university",
    15: "worker",
  }[Number(viewer?.schoolGrade)] || "school";
}

function assertCommunityBoardAccess(
  resource,
  viewer
) {
  if (
    resource?.boardType ===
    "retaker"
  ) {
    if (
      viewer?.role !== "admin" &&
      Number(viewer?.schoolGrade) !== 13
    ) {
      throw statusError(
        403,
        "N수생 게시판은 현재 N수생으로 등록된 회원만 열람할 수 있습니다."
      );
    }
    return;
  }

  if (resource?.boardType === "worker") {
    if (viewer?.role !== "admin" && Number(viewer?.schoolGrade) !== 15) {
      throw statusError(403, "직장인 게시판은 직장인으로 등록된 회원만 열람할 수 있습니다.");
    }
    return;
  }

  if (resource?.boardType === "university") {
    if (viewer?.role === "admin") return;
    if (Number(viewer?.schoolGrade) !== 14 || !viewer?.university?.code) {
      throw statusError(403, "대학교 게시판은 재학 중인 대학교가 등록된 대학생만 열람할 수 있습니다.");
    }
    if (
      resource.universityCode &&
      String(viewer.university.code) !== String(resource.universityCode)
    ) {
      throw statusError(403, "이 대학교 게시판은 해당 대학교 소속 학생만 열람할 수 있습니다.");
    }
    return;
  }

  if (
    resource?.boardType !==
    "school"
  ) {
    return;
  }

  if (viewer?.role === "admin") {
    return;
  }

  if (![10, 11, 12].includes(Number(viewer?.schoolGrade))) {
    throw statusError(
      403,
      "학교 게시판은 재학 중인 고등학교가 등록된 고등학생만 이용할 수 있습니다."
    );
  }

  if (
    !viewer?.school?.code ||
    (
      resource.schoolCode &&
      String(
        viewer.school.code
      ) !==
        String(
          resource.schoolCode
        )
    )
  ) {
    throw statusError(
      403,
      "이 학교 게시판은 해당 고등학교 소속 학생만 열람할 수 있습니다."
    );
  }
}

function cleanSingleLine(
  value,
  maxLength
) {
  return String(value || "")
    .replace(
      /[\u0000-\u001f\u007f]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(
  value,
  maxLength
) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

const COMMUNITY_OBJECTIONABLE_PATTERNS = [
  /(?:씨|시)[\s._-]*발/i,
  /ㅅ[\s._-]*ㅂ/i,
  /개[\s._-]*새[\s._-]*끼/i,
  /병[\s._-]*신/i,
  /지[\s._-]*랄/i,
  /느[\s._-]*금/i,
  /한[\s._-]*남[\s._-]*충/i,
  /한[\s._-]*녀[\s._-]*충/i,
  /김[\s._-]*치[\s._-]*녀/i,
  /맘[\s._-]*충/i,
  /틀[\s._-]*딱/i,
  /짱[\s._-]*깨/i,
  /쪽[\s._-]*바[\s._-]*리/i,
  /자[\s._-]*살[\s._-]*(?:해|하라)/i,
  /죽[\s._-]*(?:어라|여버|여 버)/i,
];
const COMMUNITY_PERSONAL_CONTACT_PATTERNS = [
  /(?:^|\D)01[016789][\s.-]*\d{3,4}[\s.-]*\d{4}(?:\D|$)/,
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i,
];

function assertCommunityUserContentSafe(
  ...values
) {
  const content = values
    .map((value) =>
      String(value || "").normalize("NFKC")
    )
    .join("\n");
  if (
    COMMUNITY_OBJECTIONABLE_PATTERNS.some(
      (pattern) => pattern.test(content)
    )
  ) {
    throw statusError(
      422,
      "욕설, 혐오 표현, 괴롭힘 또는 위해를 조장하는 내용은 게시할 수 없습니다. 표현을 수정해주세요."
    );
  }
  if (
    COMMUNITY_PERSONAL_CONTACT_PATTERNS.some(
      (pattern) => pattern.test(content)
    )
  ) {
    throw statusError(
      422,
      "개인정보 보호를 위해 전화번호와 이메일 주소는 커뮤니티에 게시할 수 없습니다."
    );
  }
}

function escapeRegex(value) {
  return String(value || "")
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}

function normalizeBoard(value) {
  const board =
    String(value || "");

  return Object.prototype
    .hasOwnProperty.call(
      BOARD_LABELS,
      board
    )
    ? board
    : "high-school";
}

function normalizeOperationsCategory(
  value
) {
  const category =
    String(value || "");
  return Object.prototype
    .hasOwnProperty.call(
      OPERATIONS_CATEGORY_LABELS,
      category
    )
    ? category
    : "";
}

function wantsAnonymousIdentity(value) {
  return [
    "true",
    "1",
    "on",
    "yes",
  ].includes(
    String(value || "")
      .trim()
      .toLowerCase()
  );
}

async function ensureAnonymousNumber(
  user
) {
  if (
    /^\d{6}$/.test(
      String(
        user
          ?.communityAnonymousNumber ||
          ""
      )
    )
  ) {
    return String(
      user.communityAnonymousNumber
    );
  }

  for (
    let attempt = 0;
    attempt < 20;
    attempt += 1
  ) {
    const candidate =
      String(
        crypto.randomInt(
          100000,
          1000000
        )
      );

    try {
      const updated =
        await User.findOneAndUpdate(
          {
            _id: user._id,
            $or: [
              {
                communityAnonymousNumber: {
                  $exists: false,
                },
              },
              {
                communityAnonymousNumber:
                  null,
              },
              {
                communityAnonymousNumber:
                  "",
              },
            ],
          },
          {
            $set: {
              communityAnonymousNumber:
                candidate,
            },
          },
          {
            returnDocument: "after",
            runValidators: true,
          }
        )
          .select(
            "communityAnonymousNumber"
          )
          .lean();

      if (
        updated
          ?.communityAnonymousNumber
      ) {
        return String(
          updated.communityAnonymousNumber
        );
      }

      const current =
        await User.findById(
          user._id
        )
          .select(
            "communityAnonymousNumber"
          )
          .lean();

      if (
        current
          ?.communityAnonymousNumber
      ) {
        return String(
          current.communityAnonymousNumber
        );
      }
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  throw statusError(
    503,
    "익명 번호를 발급하지 못했습니다. 잠시 후 다시 시도해주세요."
  );
}

function safePage(value) {
  return Math.max(
    1,
    Number.parseInt(value, 10) ||
      1
  );
}

function createSearchFilter(
  value
) {
  const search =
    cleanSingleLine(value, 80);

  if (!search) {
    return {
      search,
      filter: {},
    };
  }

  const expression =
    new RegExp(
      escapeRegex(search),
      "i"
    );

  return {
    search,
    filter: {
      $or: [
        { title: expression },
        { content: expression },
        {
          authorName:
            expression,
        },
      ],
    },
  };
}

async function getCommunityBoardData({
  viewer,
  board,
  search,
  page,
  sort,
  category,
}) {
  const normalizedBoard =
    normalizeBoard(board);
  if (
    normalizedBoard ===
    "operations"
  ) {
    const searchData =
      createSearchFilter(
        search
      );
    const selectedCategory =
      normalizeOperationsCategory(
        category
      );
    const filter = {
      isPublished: true,
    };
    if (searchData.search) {
      const expression =
        new RegExp(
          escapeRegex(
            searchData.search
          ),
          "i"
        );
      filter.$or = [
        { title: expression },
        {
          content:
            expression,
        },
      ];
    }
    if (selectedCategory) {
      filter.boardCategory =
        selectedCategory ===
        "notice"
          ? {
              $in: [
                "notice",
                null,
              ],
            }
          : selectedCategory;
    }

    const requestedPage =
      safePage(page);
    const total =
      await Announcement
        .countDocuments(
          filter
        );
    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total /
            COMMUNITY_PAGE_SIZE
        )
      );
    const currentPage =
      Math.min(
        requestedPage,
        totalPages
      );
    const posts =
      await Announcement
        .find(filter)
        .sort({
          publishedAt: -1,
          createdAt: -1,
        })
        .skip(
          (currentPage - 1) *
            COMMUNITY_PAGE_SIZE
        )
        .limit(
          COMMUNITY_PAGE_SIZE
        )
        .lean();

    return {
      board:
        normalizedBoard,
      boardLabel:
        BOARD_LABELS[
          normalizedBoard
        ],
      selectedSchool: null,
      selectedUniversity: null,
      schoolOptions: [],
      posts: posts.map(
        (post) => ({
          ...post,
          isOperationsNotice:
            true,
          boardCategory:
            post.boardCategory ||
            "notice",
          boardCategoryLabel:
            OPERATIONS_CATEGORY_LABELS[
              post.boardCategory ||
                "notice"
            ] ||
            "일반 공지",
          authorName:
            "Matths 운영팀",
        })
      ),
      popularPosts: [],
      search:
        searchData.search,
      sort: "latest",
      operationsCategories:
        OPERATIONS_CATEGORY_LABELS,
      selectedOperationsCategory:
        selectedCategory,
      pagination: {
        page: currentPage,
        totalPages,
        total,
        hasPrevious:
          currentPage > 1,
        hasNext:
          currentPage <
          totalPages,
      },
    };
  }
  await ensureDefaultCommunityNotices();
  const authorizedViewer =
    ["school", "retaker", "university", "worker"].includes(
      normalizedBoard
    )
      ? await getCommunityViewer(
          viewer?.id ||
            viewer?._id ||
            null
        )
      : viewer;
  assertCommunityBoardAccess(
    { boardType: normalizedBoard },
    authorizedViewer
  );
  const viewerSchool =
    authorizedViewer?.school?.code
      ? {
          code:
            cleanSingleLine(
              authorizedViewer.school.code,
              100
            ),
          name:
            cleanSingleLine(
              authorizedViewer.school.name,
              120
            ),
        }
      : null;
  const viewerUniversity =
    authorizedViewer?.university?.code
      ? {
          code: cleanSingleLine(authorizedViewer.university.code, 100),
          name: cleanSingleLine(authorizedViewer.university.name, 160),
        }
      : null;
  const normalizedSchoolCode = normalizedBoard === "school"
    ? viewerSchool?.code || ""
    : "";
  const normalizedUniversityCode = normalizedBoard === "university"
    ? viewerUniversity?.code || ""
    : "";
  const selectedSchool =
    normalizedBoard ===
      "school" &&
    viewerSchool
      ? {
          ...viewerSchool,
          postCount: 0,
        }
      : null;
  const selectedUniversity =
    normalizedBoard === "university" && viewerUniversity
      ? { ...viewerUniversity, postCount: 0 }
      : null;
  const searchData =
    createSearchFilter(search);
  const normalizedSort =
    String(sort || "") ===
    "popular"
      ? "popular"
      : "latest";
  const popularSince =
    new Date(
      Date.now() -
        POPULAR_POST_WINDOW_MS
    );
  const hiddenUserIds =
    await getCommunityHiddenUserIds(
      authorizedViewer?._id ||
        viewer?.id ||
        viewer?._id ||
        null
    );
  const filter = {
    status: "published",
    authorDeletedAt: null,
    boardType:
      normalizedBoard ===
      "high-school"
        ? {
            $in: [
              "high-school",
              "math",
            ],
          }
        : normalizedBoard,
    ...searchData.filter,
  };
  if (hiddenUserIds.length) {
    filter.authorId = {
      $nin: hiddenUserIds,
    };
  }

  if (
    normalizedBoard ===
      "school"
  ) {
    if (
      !normalizedSchoolCode
    ) {
      return {
        board:
          normalizedBoard,
        boardLabel:
          BOARD_LABELS[
            normalizedBoard
          ],
        selectedSchool: null,
        selectedUniversity: null,
        schoolOptions: [],
        schoolAccessRestricted:
          true,
        posts: [],
        popularPosts: [],
        search:
          searchData.search,
        sort:
          normalizedSort,
        pagination: {
          page: 1,
          totalPages: 1,
          total: 0,
          hasPrevious: false,
          hasNext: false,
        },
      };
    }

    filter.schoolCode =
      normalizedSchoolCode;
  }

  if (normalizedBoard === "university") {
    if (!normalizedUniversityCode) {
      return {
        board: normalizedBoard,
        boardLabel: BOARD_LABELS[normalizedBoard],
        selectedSchool: null,
        selectedUniversity: null,
        schoolOptions: [],
        schoolAccessRestricted: true,
        posts: [],
        popularPosts: [],
        search: searchData.search,
        sort: normalizedSort,
        pagination: {
          page: 1,
          totalPages: 1,
          total: 0,
          hasPrevious: false,
          hasNext: false,
        },
      };
    }
    filter.universityCode = normalizedUniversityCode;
  }

  const popularFilter = {
    ...filter,
    createdAt: {
      $gte: popularSince,
    },
    upvoteCount: {
      $gte:
        POPULAR_POST_UPVOTES,
    },
  };
  const listFilter =
    normalizedSort ===
    "popular"
      ? popularFilter
      : filter;
  const requestedPage =
    safePage(page);
  const total =
    await CommunityPost.countDocuments(
      listFilter
    );
  const totalPages = Math.max(
    1,
    Math.ceil(
      total /
        COMMUNITY_PAGE_SIZE
    )
  );
  const currentPage =
    Math.min(
      requestedPage,
      totalPages
    );
  const [
    posts,
    popularPosts,
    notices,
  ] = await Promise.all([
    CommunityPost.find(
      listFilter
    )
      .sort(
        normalizedSort ===
          "popular"
          ? {
              isPinned: -1,
              pinnedAt: -1,
              upvoteCount: -1,
              voteScore: -1,
              createdAt: -1,
            }
          : {
              isPinned: -1,
              pinnedAt: -1,
              createdAt: -1,
            }
      )
      .skip(
        (currentPage - 1) *
          COMMUNITY_PAGE_SIZE
      )
      .limit(
        COMMUNITY_PAGE_SIZE
      )
      .lean(),
    CommunityPost.find(
      popularFilter
    )
      .sort({
        upvoteCount: -1,
        voteScore: -1,
        createdAt: -1,
      })
      .limit(5)
      .lean(),
    currentPage === 1
      ? CommunityBoardNotice.find({
          boardType:
            normalizedBoard,
          status: "published",
          ...(normalizedBoard ===
          "school"
            ? {
                $or: [
                  {
                    schoolCode: "",
                  },
                  {
                    schoolCode:
                      normalizedSchoolCode,
                  },
                ],
              }
            : normalizedBoard === "university"
              ? {
                  $or: [
                    { universityCode: "" },
                    { universityCode: normalizedUniversityCode },
                  ],
                }
              : {}),
        })
          .sort({
            isPinned: -1,
            pinnedAt: -1,
            createdAt: -1,
          })
          .lean()
      : [],
  ]);
  const markPopular =
    (post) => ({
      ...post,
      isPopular:
        post.upvoteCount >=
          POPULAR_POST_UPVOTES &&
        new Date(
          post.createdAt
        ).getTime() >=
          popularSince.getTime(),
    });
  const listedPosts = [
    ...notices.map(
      serializeCommunityNotice
    ),
    ...posts.map(markPopular),
  ].sort((left, right) => {
    if (
      Boolean(left.isPinned) !==
      Boolean(right.isPinned)
    ) {
      return left.isPinned ? -1 : 1;
    }
    if (
      normalizedSort ===
        "popular" &&
      !left.isPinned
    ) {
      const voteDifference =
        Number(
          right.upvoteCount || 0
        ) -
        Number(
          left.upvoteCount || 0
        );
      if (voteDifference) {
        return voteDifference;
      }
    }
    return (
      new Date(
        right.pinnedAt ||
          right.createdAt
      ).getTime() -
      new Date(
        left.pinnedAt ||
          left.createdAt
      ).getTime()
    );
  });

  return {
    board:
      normalizedBoard,
    boardLabel:
      normalizedBoard ===
        "school" &&
      selectedSchool
        ? `${selectedSchool.name} 게시판`
        : normalizedBoard === "university" && selectedUniversity
          ? `${selectedUniversity.name} 게시판`
        : BOARD_LABELS[
            normalizedBoard
          ],
    selectedSchool,
    selectedUniversity,
    schoolOptions: [],
    schoolAccessRestricted:
      false,
    posts: listedPosts,
    popularPosts:
      popularPosts.map(
        markPopular
      ),
    search:
      searchData.search,
    sort:
      normalizedSort,
    pagination: {
      page: currentPage,
      totalPages,
      total,
      hasPrevious:
        currentPage > 1,
      hasNext:
        currentPage <
        totalPages,
    },
  };
}

async function getCommunityAnnouncement(
  announcementId
) {
  if (
    !mongoose.Types.ObjectId
      .isValid(announcementId)
  ) {
    throw statusError(
      404,
      "운영 공지를 찾을 수 없습니다."
    );
  }

  const announcement =
    await Announcement.findOne({
      _id: announcementId,
      isPublished: true,
    }).lean();
  if (!announcement) {
    throw statusError(
      404,
      "운영 공지를 찾을 수 없습니다."
    );
  }

  const boardCategory =
    announcement
      .boardCategory ||
    "notice";
  return {
    ...announcement,
    boardCategory,
    boardCategoryLabel:
      OPERATIONS_CATEGORY_LABELS[
        boardCategory
      ] ||
      "일반 공지",
  };
}

async function getCommunityNotice({
  noticeId,
  viewerId = null,
}) {
  if (
    !mongoose.isValidObjectId(
      noticeId
    )
  ) {
    throw statusError(
      404,
      "게시판 공지를 찾을 수 없습니다."
    );
  }

  const [notice, viewer] =
    await Promise.all([
      CommunityBoardNotice.findOne({
        _id: noticeId,
        status: "published",
      }).lean(),
      getCommunityViewer(
        viewerId
      ),
    ]);

  if (!notice) {
    throw statusError(
      404,
      "게시판 공지를 찾을 수 없습니다."
    );
  }

  assertCommunityBoardAccess(
    notice,
    viewer
  );
  return serializeCommunityNotice(
    notice
  );
}

function cleanCommunityNoticeInput({
  board,
  schoolCode,
  schoolName,
  universityCode,
  universityName,
  title,
  content,
}) {
  const boardType =
    String(board || "");
  if (
    ![
      "high-school",
      "school",
      "retaker",
      "university",
      "worker",
    ].includes(boardType)
  ) {
    throw statusError(
      400,
      "공지 대상 게시판을 선택해주세요."
    );
  }

  const cleanTitle =
    cleanSingleLine(title, 120);
  const cleanContent =
    cleanMultiline(
      content,
      10000
    );
  const cleanSchoolCode =
    boardType === "school"
      ? cleanSingleLine(
          schoolCode,
          100
        )
      : "";
  const cleanSchoolName =
    boardType === "school"
      ? cleanSingleLine(
          schoolName,
          120
        )
      : "";
  const cleanUniversityCode = boardType === "university"
    ? cleanSingleLine(universityCode, 100)
    : "";
  const cleanUniversityName = boardType === "university"
    ? cleanSingleLine(universityName, 160)
    : "";

  if (
    cleanTitle.length < 2 ||
    cleanContent.length < 2
  ) {
    throw statusError(
      400,
      "공지 제목과 내용을 2자 이상 입력해주세요."
    );
  }
  if (Boolean(cleanUniversityCode) !== Boolean(cleanUniversityName)) {
    throw statusError(
      400,
      "특정 대학교 공지라면 대학교 코드와 이름을 모두 입력해주세요. 대학교 게시판 전체 공지라면 둘 다 비워주세요."
    );
  }
  if (
    Boolean(cleanSchoolCode) !==
    Boolean(cleanSchoolName)
  ) {
    throw statusError(
      400,
      "특정 학교 공지라면 학교 코드와 학교 이름을 모두 입력해주세요. 학교 게시판 전체 공지라면 둘 다 비워주세요."
    );
  }

  return {
    boardType,
    schoolCode:
      cleanSchoolCode,
    schoolName:
      cleanSchoolName,
    universityCode: cleanUniversityCode,
    universityName: cleanUniversityName,
    title: cleanTitle,
    content: cleanContent,
  };
}

async function createCommunityNotice({
  adminUserId,
  board,
  schoolCode,
  schoolName,
  universityCode,
  universityName,
  title,
  content,
}) {
  const input =
    cleanCommunityNoticeInput({
      board,
      schoolCode,
      schoolName,
      universityCode,
      universityName,
      title,
      content,
    });
  const notice =
    await CommunityBoardNotice.create({
      ...input,
      status: "published",
      isPinned: true,
      pinnedAt: new Date(),
      createdBy:
        adminUserId,
      updatedBy:
        adminUserId,
    });

  await AdminActionLog.create({
    adminUserId,
    action:
      "community.notice-create",
    detail: notice.title,
    metadata: {
      noticeId:
        String(notice._id),
      boardType:
        notice.boardType,
      schoolCode:
        notice.schoolCode,
    },
  });
  return notice;
}

async function updateCommunityNotice({
  adminUserId,
  noticeId,
  board,
  schoolCode,
  schoolName,
  universityCode,
  universityName,
  title,
  content,
}) {
  if (
    !mongoose.isValidObjectId(
      noticeId
    )
  ) {
    throw statusError(
      404,
      "수정할 게시판 공지를 찾을 수 없습니다."
    );
  }
  const input =
    cleanCommunityNoticeInput({
      board,
      schoolCode,
      schoolName,
      universityCode,
      universityName,
      title,
      content,
    });
  const notice =
    await CommunityBoardNotice.findById(
      noticeId
    );
  if (!notice) {
    throw statusError(
      404,
      "수정할 게시판 공지를 찾을 수 없습니다."
    );
  }

  Object.assign(notice, input, {
    updatedBy: adminUserId,
  });
  await notice.save();
  await AdminActionLog.create({
    adminUserId,
    action:
      "community.notice-update",
    detail: notice.title,
    metadata: {
      noticeId:
        String(notice._id),
    },
  });
  return notice;
}

async function setCommunityNoticePinned({
  adminUserId,
  noticeId,
  pinned,
}) {
  const notice =
    mongoose.isValidObjectId(
      noticeId
    )
      ? await CommunityBoardNotice.findById(
          noticeId
        )
      : null;
  if (!notice) {
    throw statusError(
      404,
      "고정할 게시판 공지를 찾을 수 없습니다."
    );
  }

  notice.isPinned =
    pinned === true;
  notice.pinnedAt =
    notice.isPinned
      ? new Date()
      : null;
  notice.updatedBy =
    adminUserId;
  await notice.save();
  await AdminActionLog.create({
    adminUserId,
    action: notice.isPinned
      ? "community.notice-pin"
      : "community.notice-unpin",
    detail: notice.title,
    metadata: {
      noticeId:
        String(notice._id),
    },
  });
  return notice;
}

async function moderateCommunityNotice({
  adminUserId,
  noticeId,
  action,
}) {
  const normalizedAction =
    String(action || "");
  if (
    ![
      "hide",
      "restore",
      "delete",
    ].includes(normalizedAction)
  ) {
    throw statusError(
      400,
      "공지 처리 방식을 확인해주세요."
    );
  }
  const notice =
    mongoose.isValidObjectId(
      noticeId
    )
      ? await CommunityBoardNotice.findById(
          noticeId
        )
      : null;
  if (!notice) {
    throw statusError(
      404,
      "처리할 게시판 공지를 찾을 수 없습니다."
    );
  }

  if (
    normalizedAction ===
    "delete"
  ) {
    if (notice.systemKey) {
      notice.status = "deleted";
      notice.isPinned = false;
      notice.pinnedAt = null;
      notice.updatedBy =
        adminUserId;
      await notice.save();
    } else {
      await notice.deleteOne();
    }
  } else {
    notice.status =
      normalizedAction ===
      "restore"
        ? "published"
        : "hidden";
    if (
      normalizedAction === "hide"
    ) {
      notice.isPinned = false;
      notice.pinnedAt = null;
    }
    notice.updatedBy =
      adminUserId;
    await notice.save();
  }

  await AdminActionLog.create({
    adminUserId,
    action:
      `community.notice-${normalizedAction}`,
    detail: notice.title,
    metadata: {
      noticeId:
        String(notice._id),
    },
  });
  return notice;
}

async function getCommunityPostingAccess(
  userId
) {
  if (
    !mongoose.isValidObjectId(
      userId
    )
  ) {
    throw statusError(
      403,
      "활성 계정만 게시글을 작성할 수 있습니다."
    );
  }

  const user =
    await User.findOne({
      _id: userId,
      isActive: true,
      accountStatus: {
        $in: [
          "active",
          null,
        ],
      },
    })
      .select(
        "warningCount"
      )
      .lean();

  if (!user) {
    throw statusError(
      403,
      "활성 계정만 게시글을 작성할 수 있습니다."
    );
  }

  const {
    start,
    end,
    dayKey,
  } =
    getKoreanDayRange();
  const [
    persistedPostCount,
    quota,
  ] = await Promise.all([
    CommunityPost.countDocuments({
      authorId: userId,
      createdAt: {
        $gte: start,
        $lt: end,
      },
    }),
    CommunityPostingQuota.findOne({
      userId,
      dayKey,
    })
      .select("count")
      .lean(),
  ]);
  const postsCreatedToday =
    Math.max(
      persistedPostCount,
      Number(quota?.count) || 0
    );
  const warningCount =
    Math.max(
      0,
      Number(
        user.warningCount
      ) || 0
    );

  return {
    warningCount,
    canUploadFiles:
      warningCount === 0,
    dailyLimit:
      COMMUNITY_DAILY_POST_LIMIT,
    postsCreatedToday,
    remainingPosts:
      Math.max(
        0,
        COMMUNITY_DAILY_POST_LIMIT -
          postsCreatedToday
      ),
  };
}

async function createCommunityPost({
  userId,
  board,
  title,
  content,
  isAnonymous,
  files = [],
}) {
  const normalizedBoard =
    normalizeBoard(board);
  if (
    normalizedBoard ===
    "operations"
  ) {
    throw statusError(
      403,
      "운영 게시판에는 관리자 공지만 등록할 수 있습니다."
    );
  }
  const cleanTitle =
    cleanSingleLine(
      title,
      120
    );
  const cleanContent =
    cleanMultiline(
      content,
      10000
    );

  if (
    cleanTitle.length < 2 ||
    cleanContent.length < 2
  ) {
    throw statusError(
      400,
      "제목과 내용을 2자 이상 입력해주세요."
    );
  }
  assertCommunityUserContentSafe(
    cleanTitle,
    cleanContent
  );

  const uploads = Array.isArray(
    files
  )
    ? files
    : [];
  if (
    uploads.length >
    COMMUNITY_ATTACHMENT_LIMIT
  ) {
    throw statusError(
      400,
      `사진과 파일은 게시글 하나에 최대 ${COMMUNITY_ATTACHMENT_LIMIT}개까지 첨부할 수 있습니다.`
    );
  }
  const uploadTotalBytes = uploads.reduce(
    (sum, file) => sum + Math.max(0, Number(file?.size) || 0),
    0
  );
  if (uploadTotalBytes > COMMUNITY_ATTACHMENT_TOTAL_MAX_BYTES) {
    throw statusError(400, "게시글 첨부파일은 전체 합계 50MB 이하로 올려주세요.");
  }
  if (
    uploads.some(
      (file) =>
        String(file?.mimetype || "").startsWith("image/") &&
        Number(file?.size || 0) > COMMUNITY_IMAGE_MAX_BYTES
    )
  ) {
    throw statusError(400, "게시판 이미지는 파일당 10MB 이하로 올려주세요.");
  }
  const attachments = await Promise.all(
    uploads.map((file) => serializeCommunityUpload(file))
  );

  const user =
    await User.findOne({
      _id: userId,
      isActive: true,
      accountStatus: {
        $in: [
          "active",
          null,
        ],
      },
    }).lean();

  if (!user) {
    throw statusError(
      403,
      "활성 계정만 게시글을 작성할 수 있습니다."
    );
  }

  if (
    attachments.length > 0 &&
    Number(
      user.warningCount || 0
    ) > 0
  ) {
    throw statusError(
      403,
      "경고 횟수가 1회 이상인 계정은 게시판에 파일이나 사진을 올릴 수 없습니다. 관리자가 경고를 0회로 조정하면 다시 이용할 수 있습니다."
    );
  }

  assertCommunityBoardAccess(
    { boardType: normalizedBoard },
    user
  );

  if (
    normalizedBoard === "school" &&
    (!user.school?.code ||
      ![10, 11, 12].includes(Number(user.schoolGrade)))
  ) {
    throw statusError(
      400,
      "학교 게시판은 재학 중인 소속 고등학교가 있는 회원만 이용할 수 있습니다."
    );
  }
  if (
    normalizedBoard === "university" &&
    (Number(user.schoolGrade) !== 14 || !user.university?.code)
  ) {
    throw statusError(
      400,
      "대학교 게시판은 재학 중인 소속 대학교가 있는 대학생만 이용할 수 있습니다."
    );
  }

  const anonymous =
    wantsAnonymousIdentity(
      isAnonymous
    );
  const anonymousNumber =
    anonymous
      ? await ensureAnonymousNumber(
          user
        )
      : "";

  return withCommunityPostingLock(
    user._id,
    async () => {
      const reservation =
        await reserveCommunityPostSlot(
          user._id
        );
      try {
        return await CommunityPost.create({
          authorId: user._id,
          authorName: anonymous
            ? `익명(${anonymousNumber})`
            : user.name,
          isAnonymous:
            anonymous,
          anonymousNumber,
          boardType:
            normalizedBoard,
          schoolCode:
            normalizedBoard ===
            "school"
              ? user.school.code
              : "",
          schoolName:
            normalizedBoard === "school" ? user.school?.name || "" : "",
          universityCode:
            normalizedBoard === "university" ? user.university.code : "",
          universityName:
            normalizedBoard === "university" ? user.university.name : "",
          authorRegion:
            normalizedBoard === "university"
              ? user.university?.region || ""
              : user.school?.region || "",
          authorSchoolGrade:
            Number(
              user.schoolGrade
            ) || null,
          title: cleanTitle,
          content:
            cleanContent,
          attachments,
        });
      } catch (error) {
        await releaseCommunityPostSlot({
          userId: user._id,
          dayKey:
            reservation.dayKey,
        }).catch(() => {});
        throw error;
      }
    }
  );
}

async function getCommunityPost(
  postId,
  viewerId = null
) {
  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  const [post, viewer] =
    await Promise.all([
      CommunityPost.findOne({
        _id: postId,
        status:
          "published",
        authorDeletedAt:
          null,
      }).lean(),
      getCommunityViewer(
        viewerId
      ),
    ]);

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }
  assertCommunityBoardAccess(
    post,
    viewer
  );
  await assertNoCommunityBlockBetween(
    viewerId,
    post.authorId
  );
  await CommunityPost.updateOne(
    {
      _id: post._id,
    },
    {
      $inc: {
        viewCount: 1,
      },
    }
  );
  post.viewCount =
    Number(post.viewCount || 0) +
    1;

  const hiddenUserIds =
    await getCommunityHiddenUserIds(
      viewerId
    );
  const [
    comments,
    viewerVote,
    viewerReport,
  ] = await Promise.all([
    CommunityComment.find({
      postId: post._id,
      status: "published",
      ...(hiddenUserIds.length
        ? {
            authorId: {
              $nin: hiddenUserIds,
            },
          }
        : {}),
    })
      .sort({ createdAt: 1 })
      .lean(),
    viewerId
      ? CommunityVote.findOne({
          postId: post._id,
          userId: viewerId,
        })
          .select("value")
          .lean()
      : null,
    viewerId
      ? CommunityReport.findOne({
          postId: post._id,
          reporterUserId: viewerId,
        })
          .select("status")
          .lean()
      : null,
  ]);
  const popularSince =
    Date.now() -
    POPULAR_POST_WINDOW_MS;

  return {
    post: {
      ...post,
      isPopular:
        Number(
          post.upvoteCount || 0
        ) >=
          POPULAR_POST_UPVOTES &&
        new Date(
          post.createdAt
        ).getTime() >=
          popularSince,
    },
    comments,
    viewerVote:
      viewerVote?.value || 0,
    viewerReported:
      Boolean(viewerReport),
  };
}

async function deleteCommunityPostByAuthor({
  userId,
  postId,
}) {
  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "삭제할 게시글을 찾을 수 없습니다."
    );
  }
  if (
    !mongoose.isValidObjectId(
      userId
    )
  ) {
    throw statusError(
      403,
      "로그인한 사용자만 게시글을 삭제할 수 있습니다."
    );
  }

  const deletedAt =
    new Date();
  const post =
    await CommunityPost.findOneAndUpdate(
      {
        _id: postId,
        authorId: userId,
        status: "published",
      },
      {
        $set: {
          status: "deleted",
          authorDeletedAt:
            deletedAt,
          isPinned: false,
          pinnedAt: null,
          pinnedBy: null,
        },
      },
      {
        returnDocument:
          "after",
        runValidators: true,
      }
    )
      .select(
        "_id authorId boardType status authorDeletedAt"
      )
      .lean();

  if (post) {
    return post;
  }

  const existing =
    await CommunityPost.findById(
      postId
    )
      .select(
        "_id authorId boardType status authorDeletedAt"
      )
      .lean();

  if (!existing) {
    throw statusError(
      404,
      "삭제할 게시글을 찾을 수 없습니다."
    );
  }
  if (
    String(existing.authorId) !==
    String(userId)
  ) {
    throw statusError(
      403,
      "본인이 작성한 게시글만 삭제할 수 있습니다."
    );
  }
  if (
    existing.status ===
      "deleted" &&
    existing.authorDeletedAt
  ) {
    return existing;
  }

  throw statusError(
    409,
    "운영 검토 중이거나 이미 처리된 게시글은 직접 삭제할 수 없습니다."
  );
}

async function getCommunityAttachment({
  postId,
  attachmentId,
  viewerId = null,
}) {
  if (
    !mongoose.isValidObjectId(
      postId
    ) ||
    !mongoose.isValidObjectId(
      attachmentId
    )
  ) {
    throw statusError(
      404,
      "첨부파일을 찾을 수 없습니다."
    );
  }

  const [post, viewer] =
    await Promise.all([
      CommunityPost.findOne({
        _id: postId,
        status: "published",
        authorDeletedAt:
          null,
      })
        .select(
          "attachments authorId boardType schoolCode universityCode"
        )
        .lean(),
      getCommunityViewer(
        viewerId
      ),
    ]);
  if (post) {
    assertCommunityBoardAccess(
      post,
      viewer
    );
    await assertNoCommunityBlockBetween(
      viewerId,
      post.authorId
    );
  }
  const attachment =
    post?.attachments?.find(
      (item) =>
        String(item._id) ===
        String(attachmentId)
    );
  const cloudUrl = attachment
    ? communityAttachmentCloudUrl(attachment, {
        download: !isCommunityImage(attachment),
      })
    : null;
  const filePath = attachment?.storageProvider === "CLOUDINARY"
    ? null
    : safeCommunityAttachmentPath(attachment?.storedName);

  if (!attachment || (!filePath && !cloudUrl)) {
    throw statusError(
      404,
      "첨부파일을 찾을 수 없습니다."
    );
  }

  if (filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      throw statusError(404, "첨부파일을 찾을 수 없습니다.");
    }
  }

  return {
    ...attachment,
    filePath,
    cloudUrl,
    isImage:
      isCommunityImage(
        attachment
      ),
  };
}

async function reportCommunityPost({
  userId,
  postId,
  reason,
}) {
  const cleanReason =
    cleanMultiline(reason, 1000);
  if (cleanReason.length < 5) {
    throw statusError(
      400,
      "신고 사유를 5자 이상 입력해주세요."
    );
  }

  const [post, reporter] =
    await Promise.all([
      CommunityPost.findOne({
        _id: postId,
        status: "published",
        authorDeletedAt:
          null,
      }).lean(),
      User.findOne({
        _id: userId,
        isActive: true,
      })
        .select("school university role schoolGrade")
        .lean(),
    ]);
  if (!post) {
    throw statusError(
      404,
      "신고할 게시글을 찾을 수 없습니다."
    );
  }
  if (!reporter) {
    throw statusError(
      403,
      "로그인한 활성 계정만 신고할 수 있습니다."
    );
  }
  assertCommunityBoardAccess(
    post,
    reporter
  );
  await assertNoCommunityBlockBetween(
    userId,
    post.authorId
  );
  if (
    String(post.authorId) ===
    String(userId)
  ) {
    throw statusError(
      400,
      "본인이 작성한 글은 신고할 수 없습니다."
    );
  }

  let report;
  try {
    report = await CommunityReport.create({
      postId: post._id,
      reporterUserId: userId,
      reportedUserId: post.authorId,
      reason: cleanReason,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw statusError(
        409,
        "이미 이 게시글을 신고했습니다."
      );
    }
    throw error;
  }

  await createAdminTodo({
    category: "community-report",
    title: `게시글 신고 · ${post.title}`,
    description: cleanReason,
    href: `/admin/community?report=${report._id}#report-${report._id}`,
    targetUserId: post.authorId,
    actorUserId: userId,
    sourceType: "CommunityReport",
    sourceId: report._id,
  });

  return report;
}

async function voteCommunityPost({
  userId,
  postId,
  value,
}) {
  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  const normalizedValue =
    Number(value);

  if (
    ![-1, 1].includes(
      normalizedValue
    )
  ) {
    throw statusError(
      400,
      "추천 또는 비추천을 선택해주세요."
    );
  }

  const [post, user] =
    await Promise.all([
    CommunityPost.findOne({
      _id: postId,
      status: "published",
      authorDeletedAt:
        null,
    })
      .select(
        "_id authorId boardType schoolCode universityCode"
      )
      .lean(),
    User.findOne({
      _id: userId,
      isActive: true,
      accountStatus: {
        $in: [
          "active",
          null,
        ],
      },
    })
      .select("school university role schoolGrade")
      .lean(),
  ]);

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  if (!user) {
    throw statusError(
      403,
      "활성 계정만 추천할 수 있습니다."
    );
  }
  assertCommunityBoardAccess(
    post,
    user
  );
  await assertNoCommunityBlockBetween(
    userId,
    post.authorId
  );

  const current =
    await CommunityVote.findOne({
      postId: post._id,
      userId,
    });
  let viewerVote =
    normalizedValue;

  if (
    current?.value ===
    normalizedValue
  ) {
    await current.deleteOne();
    viewerVote = 0;
  } else if (current) {
    current.value =
      normalizedValue;
    await current.save();
  } else {
    await CommunityVote.create({
      postId: post._id,
      userId,
      value:
        normalizedValue,
    });
  }

  const counts =
    await CommunityVote.aggregate([
      {
        $match: {
          postId:
            post._id,
        },
      },
      {
        $group: {
          _id: "$value",
          count: {
            $sum: 1,
          },
        },
      },
    ]);
  const countMap =
    new Map(
      counts.map(
        (entry) => [
          Number(entry._id),
          entry.count,
        ]
      )
    );
  const upvoteCount =
    countMap.get(1) || 0;
  const downvoteCount =
    countMap.get(-1) || 0;

  await CommunityPost.updateOne(
    {
      _id: post._id,
    },
    {
      $set: {
        upvoteCount,
        downvoteCount,
        voteScore:
          upvoteCount -
          downvoteCount,
      },
    }
  );

  return {
    upvoteCount,
    downvoteCount,
    voteScore:
      upvoteCount -
      downvoteCount,
    viewerVote,
  };
}

async function createCommunityComment({
  userId,
  postId,
  content,
  isAnonymous,
}) {
  const cleanContent =
    cleanMultiline(
      content,
      2000
    );

  if (
    cleanContent.length < 1
  ) {
    throw statusError(
      400,
      "댓글 내용을 입력해주세요."
    );
  }
  assertCommunityUserContentSafe(
    cleanContent
  );

  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  const [post, user] =
    await Promise.all([
      CommunityPost.findOne({
        _id: postId,
        status: "published",
        authorDeletedAt:
          null,
      }).lean(),
      User.findOne({
        _id: userId,
        isActive: true,
        accountStatus: {
          $in: [
            "active",
            null,
          ],
        },
      }).lean(),
    ]);

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  if (!user) {
    throw statusError(
      403,
      "활성 계정만 댓글을 작성할 수 있습니다."
    );
  }
  assertCommunityBoardAccess(
    post,
    user
  );
  await assertNoCommunityBlockBetween(
    userId,
    post.authorId
  );

  const anonymous =
    wantsAnonymousIdentity(
      isAnonymous
    );
  const anonymousNumber =
    anonymous
      ? await ensureAnonymousNumber(
          user
        )
      : "";

  return CommunityComment.create({
    postId: post._id,
    authorId: user._id,
    authorName: anonymous
      ? `익명(${anonymousNumber})`
      : user.name,
    isAnonymous:
      anonymous,
    anonymousNumber,
    content: cleanContent,
  });
}

async function blockCommunityUser({
  userId,
  postId,
  commentId = null,
}) {
  if (
    !mongoose.isValidObjectId(postId) ||
    (commentId && !mongoose.isValidObjectId(commentId))
  ) {
    throw statusError(
      404,
      "차단할 커뮤니티 사용자를 찾을 수 없습니다."
    );
  }

  const [post, blocker, comment] =
    await Promise.all([
      CommunityPost.findOne({
        _id: postId,
        status: "published",
        authorDeletedAt: null,
      })
        .select(
          "_id authorId authorName isAnonymous boardType schoolCode universityCode"
        )
        .lean(),
      getCommunityViewer(userId),
      commentId
        ? CommunityComment.findOne({
            _id: commentId,
            postId,
            status: "published",
          })
            .select(
              "_id authorId authorName isAnonymous"
            )
            .lean()
        : null,
    ]);

  if (!post || (commentId && !comment)) {
    throw statusError(
      404,
      "차단할 커뮤니티 사용자를 찾을 수 없습니다."
    );
  }
  if (!blocker) {
    throw statusError(
      403,
      "로그인한 활성 계정만 사용자를 차단할 수 있습니다."
    );
  }
  assertCommunityBoardAccess(post, blocker);

  const source = comment || post;
  if (String(source.authorId) === String(userId)) {
    throw statusError(
      400,
      "본인 계정은 차단할 수 없습니다."
    );
  }

  await CommunityUserBlock.updateOne(
    {
      blockerUserId: userId,
      blockedUserId: source.authorId,
    },
    {
      $setOnInsert: {
        displayNameSnapshot:
          cleanSingleLine(source.authorName, 30) ||
          "차단한 사용자",
        anonymousSnapshot:
          Boolean(source.isAnonymous),
        sourceType:
          comment ? "comment" : "post",
        sourceId: source._id,
      },
    },
    {
      upsert: true,
      runValidators: true,
    }
  );

  return CommunityUserBlock.findOne({
    blockerUserId: userId,
    blockedUserId: source.authorId,
  }).lean();
}

async function getCommunityBlockedUsers({
  userId,
}) {
  const viewer =
    await getCommunityViewer(userId);
  if (!viewer) {
    throw statusError(
      403,
      "로그인한 활성 계정만 차단 목록을 확인할 수 있습니다."
    );
  }
  const blocks =
    await CommunityUserBlock.find({
      blockerUserId: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

  return blocks.map((block) => ({
    id: String(block.blockedUserId),
    displayName:
      block.displayNameSnapshot ||
      "차단한 사용자",
    anonymous:
      Boolean(block.anonymousSnapshot),
    sourceType: block.sourceType,
    createdAt: block.createdAt,
  }));
}

async function unblockCommunityUser({
  userId,
  blockedUserId,
}) {
  if (
    !mongoose.isValidObjectId(userId) ||
    !mongoose.isValidObjectId(blockedUserId)
  ) {
    throw statusError(
      404,
      "차단한 사용자를 찾을 수 없습니다."
    );
  }
  const viewer =
    await getCommunityViewer(userId);
  if (!viewer) {
    throw statusError(
      403,
      "로그인한 활성 계정만 차단을 해제할 수 있습니다."
    );
  }
  const result =
    await CommunityUserBlock.deleteOne({
      blockerUserId: userId,
      blockedUserId,
    });
  if (!result.deletedCount) {
    throw statusError(
      404,
      "차단한 사용자를 찾을 수 없습니다."
    );
  }
}

async function getAdminCommunityData({
  board,
  status,
  search,
  page,
}) {
  await ensureDefaultCommunityNotices();
  const allowedStatuses =
    new Set([
      "published",
      "hidden",
      "deleted",
    ]);
  const normalizedBoard =
    Object.prototype
      .hasOwnProperty.call(
        BOARD_LABELS,
        board
      )
      ? board
      : "";
  const normalizedStatus =
    allowedStatuses.has(status)
      ? status
      : "";
  const searchData =
    createSearchFilter(search);
  const filter = {
    ...searchData.filter,
  };

  if (normalizedBoard) {
    filter.boardType =
      normalizedBoard ===
      "high-school"
        ? {
            $in: [
              "high-school",
              "math",
            ],
          }
        : normalizedBoard;
  }

  if (normalizedStatus) {
    filter.status =
      normalizedStatus;
  }

  const requestedPage =
    safePage(page);
  const [total, stats] =
    await Promise.all([
      CommunityPost.countDocuments(
        filter
      ),
      CommunityPost.aggregate([
        {
          $group: {
            _id: "$status",
            count: {
              $sum: 1,
            },
          },
        },
      ]),
    ]);
  const totalPages = Math.max(
    1,
    Math.ceil(
      total /
        ADMIN_COMMUNITY_PAGE_SIZE
    )
  );
  const currentPage =
    Math.min(
      requestedPage,
      totalPages
    );
  const posts =
    await CommunityPost.find(
      filter
    )
      .sort({
        isPinned: -1,
        pinnedAt: -1,
        createdAt: -1,
      })
      .skip(
        (currentPage - 1) *
          ADMIN_COMMUNITY_PAGE_SIZE
      )
      .limit(
        ADMIN_COMMUNITY_PAGE_SIZE
      )
      .populate({
        path: "authorId",
        select:
          "name email warningCount accountStatus isActive role school",
      })
      .lean();
  const comments =
    await CommunityComment.find({
      status: {
        $in: [
          "published",
          "hidden",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate({
        path: "authorId",
        select:
          "name email warningCount accountStatus isActive role",
      })
      .populate({
        path: "postId",
        select:
          "title status",
      })
      .lean();
  const notices =
    await CommunityBoardNotice.find({})
      .sort({
        status: 1,
        isPinned: -1,
        pinnedAt: -1,
        createdAt: -1,
      })
      .lean();
  const reports =
    await CommunityReport.find({
      status: {
        $in: ["pending", "reviewing"],
      },
    })
      .sort({ createdAt: 1 })
      .populate({
        path: "postId",
        populate: {
          path: "authorId",
          select:
            "name email warningCount accountStatus isActive role school",
        },
      })
      .populate(
        "reporterUserId",
        "name realName email"
      )
      .populate(
        "reportedUserId",
        "name realName email warningCount"
      )
      .lean();
  const statMap =
    Object.fromEntries(
      stats.map((row) => [
        row._id,
        row.count,
      ])
    );

  return {
    posts,
    notices,
    comments,
    reports,
    boardLabels:
      BOARD_LABELS,
    filters: {
      board:
        normalizedBoard,
      status:
        normalizedStatus,
      search:
        searchData.search,
    },
    stats: {
      total:
        Object.values(
          statMap
        ).reduce(
          (sum, value) =>
            sum + value,
          0
        ),
      published:
        statMap.published ||
        0,
      hidden:
        statMap.hidden || 0,
      deleted:
        statMap.deleted || 0,
    },
    pagination: {
      page: currentPage,
      totalPages,
      total,
      hasPrevious:
        currentPage > 1,
      hasNext:
        currentPage <
        totalPages,
    },
  };
}

async function reviewCommunityReport({
  adminUserId,
  reportId,
  status,
  resolution,
}) {
  const allowed =
    new Set([
      "reviewing",
      "resolved",
      "rejected",
    ]);
  const nextStatus =
    String(status || "");
  const cleanResolution =
    cleanMultiline(resolution, 1000);
  if (
    !allowed.has(nextStatus) ||
    (nextStatus !== "reviewing" &&
      !cleanResolution)
  ) {
    throw statusError(
      400,
      "신고 처리 상태와 처리 내용을 입력해주세요."
    );
  }
  const report =
    await CommunityReport.findById(
      reportId
    );
  if (!report) {
    throw statusError(
      404,
      "게시글 신고를 찾을 수 없습니다."
    );
  }
  report.status = nextStatus;
  report.resolution =
    cleanResolution;
  report.handledBy =
    adminUserId;
  report.handledAt =
    nextStatus === "reviewing"
      ? null
      : new Date();
  await report.save();

  await AdminActionLog.create({
    adminUserId,
    targetUserId:
      report.reportedUserId,
    action:
      `community.report-${nextStatus}`,
    detail: cleanResolution,
    metadata: {
      reportId:
        String(report._id),
      postId:
        String(report.postId),
      reporterUserId:
        String(
          report.reporterUserId
        ),
    },
  });

  if (
    ["resolved", "rejected"].includes(
      nextStatus
    )
  ) {
    await completeAdminTodoBySource({
      sourceType:
        "CommunityReport",
      sourceId: report._id,
      adminUserId,
    });
  }
  return report;
}

async function logCommunityAdminAction({
  adminUserId,
  targetUserId,
  action,
  detail,
  post,
  metadata = {},
}) {
  await AdminActionLog.create({
    adminUserId,
    targetUserId,
    action,
    detail:
      cleanSingleLine(
        detail,
        1000
      ),
    metadata: {
      postId:
        String(post._id),
      boardType:
        post.boardType,
      ...metadata,
    },
  });
}

async function updateCommunityPostByAdmin({
  adminUserId,
  postId,
  title,
  content,
  reason,
}) {
  const cleanTitle =
    cleanSingleLine(
      title,
      120
    );
  const cleanContent =
    cleanMultiline(
      content,
      10000
    );
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    cleanTitle.length < 2 ||
    cleanContent.length < 2 ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "수정할 제목·내용·사유를 모두 입력해주세요."
    );
  }

  const post =
    await CommunityPost.findById(
      postId
    );

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  post.title = cleanTitle;
  post.content =
    cleanContent;
  post.editedAt =
    new Date();
  post.moderatedAt =
    new Date();
  post.moderatedBy =
    adminUserId;
  post.moderationReason =
    cleanReason;
  await post.save();

  await logCommunityAdminAction({
    adminUserId,
    targetUserId:
      post.authorId,
    action:
      "community.post-edit",
    detail: cleanReason,
    post,
  });
}

async function setCommunityPostPinned({
  adminUserId,
  postId,
  pinned,
}) {
  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "고정할 게시글을 찾을 수 없습니다."
    );
  }

  const post =
    await CommunityPost.findById(
      postId
    );

  if (!post) {
    throw statusError(
      404,
      "고정할 게시글을 찾을 수 없습니다."
    );
  }

  const shouldPin =
    pinned === true;
  post.isPinned = shouldPin;
  post.pinnedAt =
    shouldPin
      ? new Date()
      : null;
  post.pinnedBy =
    shouldPin
      ? adminUserId
      : null;
  await post.save();

  await logCommunityAdminAction({
    adminUserId,
    targetUserId:
      post.authorId,
    action:
      shouldPin
        ? "community.post-pin"
        : "community.post-unpin",
    detail:
      shouldPin
        ? "게시글 상단 고정"
        : "게시글 상단 고정 해제",
    post,
    metadata: {
      isPinned:
        shouldPin,
    },
  });

  return {
    id: String(post._id),
    isPinned:
      shouldPin,
  };
}

async function moderateCommunityPost({
  adminUserId,
  postId,
  action,
  reason,
}) {
  const allowedActions =
    new Set([
      "hide",
      "restore",
      "delete",
    ]);
  const normalizedAction =
    String(action || "");
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    !allowedActions.has(
      normalizedAction
    ) ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "처리 방식과 사유를 입력해주세요."
    );
  }

  const post =
    await CommunityPost.findById(
      postId
    );

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  if (
    normalizedAction ===
    "delete"
  ) {
    await Promise.all([
      CommunityComment.deleteMany({
        postId: post._id,
      }),
      CommunityVote.deleteMany({
        postId: post._id,
      }),
    ]);
    await CommunityPost.deleteOne({
      _id: post._id,
    });
    await discardCommunityUploads(
      post.attachments
    );
    await UserNotification.create({
      userId:
        post.authorId,
      title:
        "작성한 게시글이 삭제되었습니다.",
      message:
        `게시글 “${post.title}”이 운영 정책에 따라 삭제되었습니다. 사유: ${cleanReason}`.slice(
          0,
          1000
        ),
      href: "/community",
      kind: "warning",
      createdBy:
        adminUserId,
    });

    await logCommunityAdminAction({
      adminUserId,
      targetUserId:
        post.authorId,
      action:
        "community.post-delete",
      detail: cleanReason,
      post,
      metadata: {
        deletedFromDatabase:
          true,
      },
    });
    return;
  }

  const nextStatus = {
    hide: "hidden",
    restore: "published",
  }[normalizedAction];
  post.status = nextStatus;
  if (
    normalizedAction ===
    "restore"
  ) {
    post.authorDeletedAt =
      null;
  }
  if (
    normalizedAction ===
    "hide"
  ) {
    post.isPinned = false;
    post.pinnedAt = null;
    post.pinnedBy = null;
  }
  post.moderationReason =
    cleanReason;
  post.moderatedAt =
    new Date();
  post.moderatedBy =
    adminUserId;
  await post.save();

  await logCommunityAdminAction({
    adminUserId,
    targetUserId:
      post.authorId,
    action:
      `community.post-${normalizedAction}`,
    detail: cleanReason,
    post,
    metadata: {
      nextStatus,
    },
  });
}

async function warnCommunityPost({
  adminUserId,
  postId,
  reason,
}) {
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    !mongoose.isValidObjectId(
      postId
    )
  ) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  if (!cleanReason) {
    throw statusError(
      400,
      "경고 사유를 입력해주세요."
    );
  }

  const candidate =
    await CommunityPost.findById(
      postId
    )
      .select(
        "authorId warningIssued"
      )
      .lean();

  if (!candidate) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  if (
    candidate.warningIssued
  ) {
    throw statusError(
      409,
      "이미 경고를 부여한 게시글입니다."
    );
  }

  const user =
    await User.findById(
      candidate.authorId
    );

  if (!user) {
    throw statusError(
      404,
      "게시글 작성자를 찾을 수 없습니다."
    );
  }

  if (user.role === "admin") {
    throw statusError(
      400,
      "관리자 게시글에는 자동 경고를 부여할 수 없습니다."
    );
  }

  const post =
    await CommunityPost.findOneAndUpdate(
      {
        _id: postId,
        warningIssued: false,
      },
      {
        $set: {
          warningIssued: true,
          status: "hidden",
          isPinned: false,
          pinnedAt: null,
          pinnedBy: null,
          moderationReason:
            cleanReason,
          moderatedAt:
            new Date(),
          moderatedBy:
            adminUserId,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!post) {
    const exists =
      await CommunityPost.exists({
        _id: postId,
      });
    throw statusError(
      exists ? 409 : 404,
      exists
        ? "이미 경고를 부여한 게시글입니다."
        : "게시글을 찾을 수 없습니다."
    );
  }

  const warnedUser =
    await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          warningCount: 1,
        },
      },
      {
        returnDocument:
          "after",
      }
    );
  const autoSuspended =
    Number(
      warnedUser.warningCount
    ) >= 3;

  if (autoSuspended) {
    warnedUser.accountStatus =
      "suspended";
    warnedUser.accountStatusReason =
      "게시판 경고 3회 누적";
    warnedUser.accountStatusChangedAt =
      new Date();
    warnedUser.suspendedUntil = null;
    warnedUser.isActive = false;
    warnedUser.tokenVersion =
      (Number(
        warnedUser.tokenVersion
      ) || 0) + 1;
    await warnedUser.save();
  }

  const notice =
    communityEmailCopy.warningNotice({
      target: "게시판",
      reason: cleanReason,
      warningCount:
        warnedUser.warningCount,
      autoSuspended,
    });

  await deliverModerationNotice({
    user: warnedUser,
    title: notice.title,
    message: notice.message,
    href: "/community",
    kind: "warning",
    createdBy:
      adminUserId,
    emailSubject:
      notice.title,
    emailMessage:
      notice.message,
  });

  await logCommunityAdminAction({
    adminUserId,
    targetUserId:
      warnedUser._id,
    action:
      "community.post-warning",
    detail: cleanReason,
    post,
    metadata: {
      warningCount:
        warnedUser.warningCount,
      autoSuspended,
    },
  });

  return {
    warningCount:
      warnedUser.warningCount,
    autoSuspended,
  };
}

async function moderateCommunityComment({
  adminUserId,
  commentId,
  action,
  reason,
}) {
  const allowedActions =
    new Set([
      "hide",
      "restore",
      "delete",
    ]);
  const normalizedAction =
    String(action || "");
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (
    !allowedActions.has(
      normalizedAction
    ) ||
    !cleanReason
  ) {
    throw statusError(
      400,
      "댓글 처리 방식과 사유를 입력해주세요."
    );
  }

  const comment =
    await CommunityComment.findById(
      commentId
    );

  if (!comment) {
    throw statusError(
      404,
      "댓글을 찾을 수 없습니다."
    );
  }

  if (
    normalizedAction ===
    "delete"
  ) {
    await CommunityComment.deleteOne({
      _id: comment._id,
    });
    await AdminActionLog.create({
      adminUserId,
      targetUserId:
        comment.authorId,
      action:
        "community.comment-delete",
      detail: cleanReason,
      metadata: {
        commentId:
          String(comment._id),
        postId:
          String(comment.postId),
        deletedFromDatabase:
          true,
      },
    });
    return;
  }

  const nextStatus = {
    hide: "hidden",
    restore: "published",
  }[normalizedAction];
  comment.status = nextStatus;
  comment.moderationReason =
    cleanReason;
  comment.moderatedAt =
    new Date();
  comment.moderatedBy =
    adminUserId;
  await comment.save();

  await AdminActionLog.create({
    adminUserId,
    targetUserId:
      comment.authorId,
    action:
      `community.comment-${normalizedAction}`,
    detail: cleanReason,
    metadata: {
      commentId:
        String(comment._id),
      postId:
        String(comment.postId),
      nextStatus,
    },
  });
}

async function warnCommunityComment({
  adminUserId,
  commentId,
  reason,
}) {
  const cleanReason =
    cleanSingleLine(
      reason,
      500
    );

  if (!cleanReason) {
    throw statusError(
      400,
      "댓글 경고 사유를 입력해주세요."
    );
  }

  const comment =
    await CommunityComment.findOneAndUpdate(
      {
        _id: commentId,
        warningIssued: false,
      },
      {
        $set: {
          warningIssued: true,
          status: "hidden",
          moderationReason:
            cleanReason,
          moderatedAt:
            new Date(),
          moderatedBy:
            adminUserId,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!comment) {
    const exists =
      await CommunityComment.exists({
        _id: commentId,
      });
    throw statusError(
      exists ? 409 : 404,
      exists
        ? "이미 경고를 부여한 댓글입니다."
        : "댓글을 찾을 수 없습니다."
    );
  }

  const user =
    await User.findById(
      comment.authorId
    );

  if (!user) {
    throw statusError(
      404,
      "댓글 작성자를 찾을 수 없습니다."
    );
  }

  if (user.role === "admin") {
    throw statusError(
      400,
      "관리자 댓글에는 자동 경고를 부여할 수 없습니다."
    );
  }

  user.warningCount =
    (Number(
      user.warningCount
    ) || 0) + 1;
  const autoSuspended =
    user.warningCount >= 3;

  if (autoSuspended) {
    user.accountStatus =
      "suspended";
    user.accountStatusReason =
      "게시판 경고 3회 누적";
    user.accountStatusChangedAt =
      new Date();
    user.suspendedUntil = null;
    user.isActive = false;
    user.tokenVersion =
      (Number(
        user.tokenVersion
      ) || 0) + 1;
  }

  await user.save();

  const notice =
    communityEmailCopy.warningNotice({
      target: "댓글",
      reason: cleanReason,
      warningCount:
        user.warningCount,
      autoSuspended,
    });

  await deliverModerationNotice({
    user,
    title: notice.title,
    message: notice.message,
    href:
      `/community/${comment.postId}`,
    kind: "warning",
    createdBy:
      adminUserId,
  });

  await AdminActionLog.create({
    adminUserId,
    targetUserId:
      user._id,
    action:
      "community.comment-warning",
    detail: cleanReason,
    metadata: {
      commentId:
        String(comment._id),
      postId:
        String(comment.postId),
      warningCount:
        user.warningCount,
      autoSuspended,
    },
  });

  return {
    warningCount:
      user.warningCount,
    autoSuspended,
  };
}

module.exports = {
  ADMIN_COMMUNITY_PAGE_SIZE,
  BOARD_LABELS,
  COMMUNITY_DAILY_POST_LIMIT,
  COMMUNITY_PAGE_SIZE,
  OPERATIONS_CATEGORY_LABELS,
  POPULAR_POST_UPVOTES,
  POPULAR_POST_WINDOW_MS,
  blockCommunityUser,
  createCommunityComment,
  createCommunityNotice,
  createCommunityPost,
  deleteCommunityPostByAuthor,
  reportCommunityPost,
  getAdminCommunityData,
  getCommunityAnnouncement,
  getCommunityAttachment,
  getCommunityBoardData,
  getCommunityBlockedUsers,
  getCommunityBoardRules,
  getCommunityNotice,
  getCommunityPost,
  getCommunityPostingAccess,
  moderateCommunityComment,
  moderateCommunityNotice,
  moderateCommunityPost,
  reviewCommunityReport,
  normalizeBoard,
  privateBoardForViewer,
  setCommunityPostPinned,
  setCommunityNoticePinned,
  updateCommunityNotice,
  updateCommunityPostByAdmin,
  unblockCommunityUser,
  voteCommunityPost,
  warnCommunityComment,
  warnCommunityPost,
  _testing: {
    assertCommunityBoardAccess,
  },
};

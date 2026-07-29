const mongoose = require("mongoose");
const crypto = require("crypto");
const {
  AdminActionLog,
  Announcement,
  CommunityComment,
  CommunityPost,
  CommunityReport,
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

const COMMUNITY_PAGE_SIZE = 20;
const ADMIN_COMMUNITY_PAGE_SIZE = 25;
const POPULAR_POST_WINDOW_MS =
  72 * 60 * 60 * 1000;
const POPULAR_POST_UPVOTES =
  100;
const BOARD_LABELS = {
  "high-school":
    "통합 고등학교 게시판",
  school: "학교 게시판",
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

function statusError(
  status,
  message
) {
  const error =
    new Error(message);
  error.status = status;
  return error;
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
            new: true,
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

async function getSchoolBoardOptions(
  viewer
) {
  const aggregated =
    await CommunityPost.aggregate([
      {
        $match: {
          boardType: "school",
          status: "published",
          schoolCode: {
            $ne: "",
          },
        },
      },
      {
        $group: {
          _id: "$schoolCode",
          name: {
            $first:
              "$schoolName",
          },
          postCount: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          name: 1,
        },
      },
    ]);
  const options =
    aggregated.map(
      (school) => ({
        code: school._id,
        name:
          school.name ||
          school._id,
        postCount:
          school.postCount,
      })
    );
  const ownSchool =
    viewer?.school?.code
      ? {
          code:
            viewer.school.code,
          name:
            viewer.school.name,
          postCount: 0,
        }
      : null;

  if (
    ownSchool &&
    !options.some(
      (school) =>
        school.code ===
        ownSchool.code
    )
  ) {
    options.unshift(ownSchool);
  }

  return options;
}

async function getCommunityBoardData({
  viewer,
  board,
  schoolCode,
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
  const schoolOptions =
    await getSchoolBoardOptions(
      viewer
    );
  const normalizedSchoolCode =
    normalizedBoard === "school"
      ? cleanSingleLine(
          schoolCode ||
            viewer?.school?.code ||
            "",
          100
        )
      : "";
  const selectedSchool =
    schoolOptions.find(
      (school) =>
        school.code ===
        normalizedSchoolCode
    ) ||
    (
      normalizedSchoolCode
        ? {
            code:
              normalizedSchoolCode,
            name:
              "선택한 학교",
            postCount: 0,
          }
        : null
    );
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
  const filter = {
    status: "published",
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
        schoolOptions,
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
  ] = await Promise.all([
    CommunityPost.find(
      listFilter
    )
      .sort(
        normalizedSort ===
          "popular"
          ? {
              upvoteCount: -1,
              voteScore: -1,
              createdAt: -1,
            }
          : {
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

  return {
    board:
      normalizedBoard,
    boardLabel:
      normalizedBoard ===
        "school" &&
      selectedSchool
        ? `${selectedSchool.name} 게시판`
        : BOARD_LABELS[
            normalizedBoard
          ],
    selectedSchool,
    schoolOptions,
    posts:
      posts.map(
        markPopular
      ),
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

async function createCommunityPost({
  userId,
  board,
  title,
  content,
  isAnonymous,
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
    normalizedBoard ===
      "school" &&
    !user.school?.code
  ) {
    throw statusError(
      400,
      "학교 게시판을 이용하려면 프로필에서 학교를 설정해주세요."
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

  return CommunityPost.create({
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
      user.school?.name || "",
    authorRegion:
      user.school?.region ||
      "",
    authorSchoolGrade:
      Number(
        user.schoolGrade
      ) || null,
    title: cleanTitle,
    content:
      cleanContent,
  });
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

  const post =
    await CommunityPost.findOneAndUpdate(
      {
        _id: postId,
        status:
          "published",
      },
      {
        $inc: {
          viewCount: 1,
        },
      },
      {
        returnDocument: "after",
      }
    ).lean();

  if (!post) {
    throw statusError(
      404,
      "게시글을 찾을 수 없습니다."
    );
  }

  const [
    comments,
    viewerVote,
    viewerReport,
  ] = await Promise.all([
    CommunityComment.find({
      postId: post._id,
      status: "published",
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
      }).lean(),
      User.findOne({
        _id: userId,
        isActive: true,
      }).lean(),
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

  const [
    post,
    user,
  ] = await Promise.all([
    CommunityPost.findOne({
      _id: postId,
      status: "published",
    })
      .select("_id")
      .lean(),
    User.exists({
      _id: userId,
      isActive: true,
      accountStatus: {
        $in: [
          "active",
          null,
        ],
      },
    }),
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

async function getAdminCommunityData({
  board,
  status,
  search,
  page,
}) {
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
  const reports =
    await CommunityReport.find({
      status: {
        $in: ["pending", "reviewing"],
      },
    })
      .sort({ createdAt: 1 })
      .populate("postId", "title status")
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
  COMMUNITY_PAGE_SIZE,
  OPERATIONS_CATEGORY_LABELS,
  POPULAR_POST_UPVOTES,
  POPULAR_POST_WINDOW_MS,
  createCommunityComment,
  createCommunityPost,
  reportCommunityPost,
  getAdminCommunityData,
  getCommunityAnnouncement,
  getCommunityBoardData,
  getCommunityPost,
  moderateCommunityComment,
  moderateCommunityPost,
  reviewCommunityReport,
  normalizeBoard,
  updateCommunityPostByAdmin,
  voteCommunityPost,
  warnCommunityComment,
  warnCommunityPost,
};

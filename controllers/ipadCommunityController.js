const fs = require("node:fs");
const {
  blockCommunityUser,
  createCommunityComment,
  createCommunityPost,
  deleteCommunityPostByAuthor,
  getCommunityAnnouncement,
  getCommunityAttachment,
  getCommunityBlockedUsers,
  getCommunityBoardData,
  getCommunityNotice,
  getCommunityPost,
  getCommunityPostingAccess,
  privateBoardForViewer,
  reportCommunityPost,
  unblockCommunityUser,
  voteCommunityPost,
} = require("../services/communityService");
const {
  discardCommunityUploads,
} = require("../services/communityAttachmentService");

function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function id(value) {
  return String(value?._id || value?.id || "");
}

function attachmentReceipt(postId, attachment) {
  const attachmentId = id(attachment);
  return {
    id: attachmentId,
    originalName: String(attachment?.originalName || "첨부파일"),
    mimeType: String(attachment?.mimeType || "application/octet-stream"),
    sizeBytes: Number(attachment?.sizeBytes || 0),
    isImage: String(attachment?.mimeType || "").startsWith("image/"),
    downloadPath: `/api/v1/community/posts/${postId}/attachments/${attachmentId}`,
  };
}

function postKind(post) {
  if (post?.isOperationsNotice) return "ANNOUNCEMENT";
  if (post?.isCommunityNotice) return "NOTICE";
  return "POST";
}

function listPostReceipt(post) {
  const postId = id(post);
  const kind = postKind(post);
  return {
    id: postId,
    kind,
    boardType: String(post?.boardType || post?.board || ""),
    boardCategory: String(post?.boardCategory || ""),
    boardCategoryLabel: String(post?.boardCategoryLabel || ""),
    title: String(post?.title || ""),
    contentPreview: String(post?.content || "").replace(/\s+/g, " ").trim().slice(0, 220),
    authorName: String(post?.authorName || "Matths 운영팀"),
    anonymous: post?.isAnonymous === true,
    pinned: post?.isPinned === true,
    popular: post?.isPopular === true,
    viewCount: Number(post?.viewCount || 0),
    upvoteCount: Number(post?.upvoteCount || 0),
    downvoteCount: Number(post?.downvoteCount || 0),
    attachmentCount: Array.isArray(post?.attachments) ? post.attachments.length : 0,
    createdAt: iso(post?.publishedAt || post?.createdAt),
  };
}

function fullPostReceipt(post, viewerId) {
  const postId = id(post);
  return {
    ...listPostReceipt(post),
    content: String(post?.content || ""),
    attachments: (post?.attachments || []).map((item) =>
      attachmentReceipt(postId, item)
    ),
    canDelete:
      Boolean(viewerId) && String(post?.authorId || "") === String(viewerId),
    canBlock:
      Boolean(viewerId) && String(post?.authorId || "") !== String(viewerId),
  };
}

function commentReceipt(comment, viewerId) {
  return {
    id: id(comment),
    authorName: String(comment?.authorName || "사용자"),
    anonymous: comment?.isAnonymous === true,
    content: String(comment?.content || ""),
    createdAt: iso(comment?.createdAt),
    canBlock:
      Boolean(viewerId) && String(comment?.authorId || "") !== String(viewerId),
  };
}

function postingAccessReceipt(value) {
  return {
    warningCount: Number(value?.warningCount || 0),
    canUploadFiles: value?.canUploadFiles === true,
    dailyLimit: Number(value?.dailyLimit || 0),
    postsCreatedToday: Number(value?.postsCreatedToday || 0),
    remainingPosts: Number(value?.remainingPosts || 0),
  };
}

function voteReceipt(value) {
  return {
    upvoteCount: Number(value?.upvoteCount || 0),
    downvoteCount: Number(value?.downvoteCount || 0),
    voteScore: Number(value?.voteScore || 0),
    viewerVote: Number(value?.viewerVote || 0),
  };
}

function blockReceipt(value) {
  return {
    id: String(value?.id || ""),
    displayName: String(value?.displayName || "차단한 사용자"),
    anonymous: value?.anonymous === true,
    sourceType: String(value?.sourceType || "post"),
    createdAt: iso(value?.createdAt),
  };
}

function viewer(req) {
  if (!req.apiUser?._id) return null;
  return { ...req.apiUser, id: String(req.apiUser._id) };
}

function strictObject(value, fields) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const allowed = new Set(fields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    const error = new Error("요청에 허용되지 않은 값이 포함되어 있습니다.");
    error.status = 400;
    error.code = "COMMUNITY_REQUEST_INVALID";
    throw error;
  }
  return body;
}

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

async function list(req, res, next) {
  try {
    const data = await getCommunityBoardData({
      viewer: viewer(req),
      board: req.query.board || (req.apiUser
        ? privateBoardForViewer(req.apiUser)
        : "high-school"),
      search: req.query.search,
      page: req.query.page,
      sort: req.query.sort,
      category: req.query.category,
    });
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      board: {
        id: String(data.board || "high-school"),
        label: String(data.boardLabel || "게시판"),
        schoolAccessRestricted: data.schoolAccessRestricted === true,
        selectedSchool: data.selectedSchool
          ? { code: String(data.selectedSchool.code || ""), name: String(data.selectedSchool.name || "") }
          : null,
        selectedUniversity: data.selectedUniversity
          ? { code: String(data.selectedUniversity.code || ""), name: String(data.selectedUniversity.name || "") }
          : null,
      },
      query: {
        search: String(data.search || ""),
        sort: String(data.sort || "latest"),
        category: String(data.selectedOperationsCategory || ""),
      },
      operationsCategories: Object.entries(data.operationsCategories || {}).map(
        ([value, label]) => ({ value: String(value), label: String(label) })
      ),
      posts: (data.posts || []).map(listPostReceipt),
      popularPosts: (data.popularPosts || []).map(listPostReceipt),
      pagination: {
        page: Number(data.pagination?.page || 1),
        totalPages: Number(data.pagination?.totalPages || 1),
        total: Number(data.pagination?.total || 0),
        hasPrevious: data.pagination?.hasPrevious === true,
        hasNext: data.pagination?.hasNext === true,
      },
      signedIn: Boolean(req.apiUser?._id),
    });
  } catch (error) {
    return next(error);
  }
}

async function detail(req, res, next) {
  try {
    const data = await getCommunityPost(
      req.params.postId,
      req.apiUser?._id || null
    );
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      post: fullPostReceipt(data.post, req.apiUser?._id),
      comments: (data.comments || []).map((item) => commentReceipt(item, req.apiUser?._id)),
      viewerVote: Number(data.viewerVote || 0),
      viewerReported: data.viewerReported === true,
      signedIn: Boolean(req.apiUser?._id),
    });
  } catch (error) {
    return next(error);
  }
}

async function notice(req, res, next) {
  try {
    const value = await getCommunityNotice({
      noticeId: req.params.noticeId,
      viewerId: req.apiUser?._id || null,
    });
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      post: fullPostReceipt(value, req.apiUser?._id),
      comments: [],
      viewerVote: 0,
      viewerReported: false,
      signedIn: Boolean(req.apiUser?._id),
    });
  } catch (error) {
    return next(error);
  }
}

async function announcement(req, res, next) {
  try {
    const value = await getCommunityAnnouncement(req.params.announcementId);
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      post: fullPostReceipt({ ...value, isOperationsNotice: true }, req.apiUser?._id),
      comments: [],
      viewerVote: 0,
      viewerReported: false,
      signedIn: Boolean(req.apiUser?._id),
    });
  } catch (error) {
    return next(error);
  }
}

async function postingAccess(req, res, next) {
  try {
    const access = await getCommunityPostingAccess(req.apiUser._id);
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      access: postingAccessReceipt(access),
    });
  } catch (error) {
    return next(error);
  }
}

async function createPost(req, res, next) {
  try {
    const body = strictObject(req.body, [
      "board",
      "title",
      "content",
      "isAnonymous",
    ]);
    const post = await createCommunityPost({
      userId: req.apiUser._id,
      board: body.board,
      title: body.title,
      content: body.content,
      isAnonymous: body.isAnonymous,
      files: req.files || [],
    });
    req.files = [];
    noStore(res);
    return res.status(201).json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      post: fullPostReceipt(post, req.apiUser._id),
    });
  } catch (error) {
    await discardCommunityUploads(req.files || []);
    req.files = [];
    return next(error);
  }
}

async function createComment(req, res, next) {
  try {
    const body = strictObject(req.body, ["content", "isAnonymous"]);
    const comment = await createCommunityComment({
      userId: req.apiUser._id,
      postId: req.params.postId,
      content: body.content,
      isAnonymous: body.isAnonymous,
    });
    noStore(res);
    return res.status(201).json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      comment: commentReceipt(comment, req.apiUser._id),
    });
  } catch (error) {
    return next(error);
  }
}

async function vote(req, res, next) {
  try {
    const body = strictObject(req.body, ["value"]);
    const result = await voteCommunityPost({
      userId: req.apiUser._id,
      postId: req.params.postId,
      value: body.value,
    });
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      vote: voteReceipt(result),
    });
  } catch (error) {
    return next(error);
  }
}

async function report(req, res, next) {
  try {
    const body = strictObject(req.body, ["reason"]);
    await reportCommunityPost({
      userId: req.apiUser._id,
      postId: req.params.postId,
      reason: body.reason,
    });
    noStore(res);
    return res.json({ schemaVersion: "COMMUNITY_NATIVE_V1", reported: true });
  } catch (error) {
    return next(error);
  }
}

async function deletePost(req, res, next) {
  try {
    await deleteCommunityPostByAuthor({
      userId: req.apiUser._id,
      postId: req.params.postId,
    });
    noStore(res);
    return res.json({ schemaVersion: "COMMUNITY_NATIVE_V1", deleted: true });
  } catch (error) {
    return next(error);
  }
}

async function block(req, res, next) {
  try {
    const body = strictObject(req.body, ["commentId"]);
    await blockCommunityUser({
      userId: req.apiUser._id,
      postId: req.params.postId,
      commentId: body.commentId || null,
    });
    noStore(res);
    return res.json({ schemaVersion: "COMMUNITY_NATIVE_V1", blocked: true });
  } catch (error) {
    return next(error);
  }
}

async function blockedUsers(req, res, next) {
  try {
    const blocks = await getCommunityBlockedUsers({ userId: req.apiUser._id });
    noStore(res);
    return res.json({
      schemaVersion: "COMMUNITY_NATIVE_V1",
      blocks: blocks.map(blockReceipt),
    });
  } catch (error) {
    return next(error);
  }
}

async function unblock(req, res, next) {
  try {
    await unblockCommunityUser({
      userId: req.apiUser._id,
      blockedUserId: req.params.userId,
    });
    noStore(res);
    return res.json({ schemaVersion: "COMMUNITY_NATIVE_V1", unblocked: true });
  } catch (error) {
    return next(error);
  }
}

async function attachment(req, res, next) {
  try {
    const value = await getCommunityAttachment({
      postId: req.params.postId,
      attachmentId: req.params.attachmentId,
      viewerId: req.apiUser?._id || null,
    });
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    if (value.cloudUrl) return res.redirect(302, value.cloudUrl);
    res.type(value.mimeType);
    res.set(
      "Content-Disposition",
      `${value.isImage ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(value.originalName)}`
    );
    return fs.createReadStream(value.filePath).pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function uploadError(error, req, _res, next) {
  await discardCommunityUploads(req.files || []);
  req.files = [];
  if (String(error?.code || "").startsWith("LIMIT_")) {
    error.status = 413;
    error.statusCode = 413;
    error.message = "첨부파일은 최대 5개, 파일당 10MB, 전체 50MB까지 올릴 수 있습니다.";
  }
  return next(error);
}

module.exports = {
  announcement,
  attachment,
  block,
  blockedUsers,
  createComment,
  createPost,
  deletePost,
  detail,
  list,
  notice,
  postingAccess,
  report,
  unblock,
  uploadError,
  vote,
};

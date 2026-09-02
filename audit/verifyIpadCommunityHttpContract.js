"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "development";

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const USER_ID = "0123456789abcdef01234567";
const POST_ID = "fedcba987654321001234567";

function installServiceStub() {
  const filename = require.resolve("../services/communityService");
  const basePost = {
    _id: POST_ID,
    boardType: "high-school",
    title: "네이티브 게시판 계약",
    content: "작성자 내부 식별자는 앱에 내려가면 안 됩니다.",
    authorId: "111111111111111111111111",
    authorName: "익명",
    isAnonymous: true,
    viewCount: 3,
    upvoteCount: 2,
    downvoteCount: 0,
    attachments: [],
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    secretField: "never-expose",
  };
  const exports = {
    privateBoardForViewer: () => "school",
    getCommunityBoardData: async () => ({
      board: "high-school",
      boardLabel: "통합 게시판",
      posts: [basePost],
      popularPosts: [],
      operationsCategories: { notice: "일반 공지", rules: "규칙" },
      pagination: { page: 1, totalPages: 1, total: 1 },
    }),
    getCommunityPost: async () => ({
      post: basePost,
      comments: [{
        _id: "222222222222222222222222",
        authorId: "333333333333333333333333",
        authorName: "답변자",
        content: "댓글",
        secretField: "never-expose",
      }],
      viewerVote: 1,
      viewerReported: false,
    }),
    getCommunityNotice: async () => ({ ...basePost, isCommunityNotice: true }),
    getCommunityAnnouncement: async () => ({ ...basePost, isOperationsNotice: true }),
    getCommunityPostingAccess: async () => ({
      warningCount: 0,
      canUploadFiles: true,
      dailyLimit: 5,
      postsCreatedToday: 1,
      remainingPosts: 4,
      internalQuotaId: "never-expose",
    }),
    createCommunityPost: async (input) => ({ ...basePost, title: input.title }),
    createCommunityComment: async (input) => ({
      _id: "444444444444444444444444",
      authorId: input.userId,
      authorName: "내 계정",
      content: input.content,
    }),
    voteCommunityPost: async () => ({
      upvoteCount: 3,
      downvoteCount: 0,
      voteScore: 3,
      viewerVote: 1,
      internalVoteId: "never-expose",
    }),
    reportCommunityPost: async () => {},
    deleteCommunityPostByAuthor: async () => {},
    blockCommunityUser: async () => {},
    getCommunityBlockedUsers: async () => [{
      id: "555555555555555555555555",
      displayName: "차단 사용자",
      anonymous: true,
      sourceType: "post",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      blockedUserEmail: "never-expose@example.com",
    }],
    unblockCommunityUser: async () => {},
    getCommunityAttachment: async () => { throw new Error("not used"); },
  };
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  const attachmentFilename = require.resolve("../services/communityAttachmentService");
  require.cache[attachmentFilename] = {
    id: attachmentFilename,
    filename: attachmentFilename,
    loaded: true,
    exports: { discardCommunityUploads: async () => {} },
  };
}

function request({ body = {}, params = {}, query = {}, files = [] } = {}) {
  return { apiUser: { _id: USER_ID }, body, params, query, files };
}

async function invoke(handler, req) {
  let payload;
  let error;
  let statusCode = 200;
  const res = {
    set() { return res; },
    status(value) { statusCode = value; return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error, statusCode };
}

async function main() {
  installServiceStub();
  const controller = require("../controllers/ipadCommunityController");

  const listed = await invoke(controller.list, request());
  assert.ifError(listed.error);
  assert.equal(listed.payload.schemaVersion, "COMMUNITY_NATIVE_V1");
  assert.equal(listed.payload.posts[0].title, "네이티브 게시판 계약");
  assert.equal(listed.payload.posts[0].authorId, undefined);
  assert.equal(listed.payload.posts[0].secretField, undefined);
  assert.deepEqual(listed.payload.operationsCategories, [
    { value: "notice", label: "일반 공지" },
    { value: "rules", label: "규칙" },
  ]);

  const detailed = await invoke(controller.detail, request({ params: { postId: POST_ID } }));
  assert.ifError(detailed.error);
  assert.equal(detailed.payload.post.canBlock, true);
  assert.equal(detailed.payload.comments[0].authorId, undefined);
  assert.equal(detailed.payload.comments[0].secretField, undefined);

  const access = await invoke(controller.postingAccess, request());
  assert.ifError(access.error);
  assert.equal(access.payload.access.remainingPosts, 4);
  assert.equal(access.payload.access.internalQuotaId, undefined);

  const created = await invoke(controller.createPost, request({
    body: { board: "high-school", title: "새 글", content: "본문", isAnonymous: false },
  }));
  assert.ifError(created.error);
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.post.title, "새 글");

  const rejected = await invoke(controller.createPost, request({
    body: { board: "high-school", title: "새 글", content: "본문", authorId: USER_ID },
  }));
  assert.equal(rejected.error?.code, "COMMUNITY_REQUEST_INVALID");

  const vote = await invoke(controller.vote, request({
    params: { postId: POST_ID }, body: { value: 1 },
  }));
  assert.ifError(vote.error);
  assert.equal(vote.payload.vote.viewerVote, 1);
  assert.equal(vote.payload.vote.internalVoteId, undefined);

  const blocks = await invoke(controller.blockedUsers, request());
  assert.ifError(blocks.error);
  assert.equal(blocks.payload.blocks[0].displayName, "차단 사용자");
  assert.equal(blocks.payload.blocks[0].blockedUserEmail, undefined);

  const routes = read("routes/api-routes.js");
  const authBoundary = routes.indexOf("router.use(requireApiAuth)");
  for (const route of [
    'router.get("/community", optionalApiAuth, ipadCommunityController.list)',
    '"/community/posts/:postId",\n  optionalApiAuth',
    '"/community/notices/:noticeId",\n  optionalApiAuth',
    '"/community/announcements/:announcementId",\n  optionalApiAuth',
  ]) {
    const index = routes.indexOf(route);
    assert.ok(index >= 0 && index < authBoundary, `${route}는 공개 optional-auth 경계 앞이어야 합니다`);
  }
  for (const route of [
    'router.get("/community/posting-access"',
    'router.delete("/community/posts/:postId"',
    'router.post("/community/posts/:postId/vote"',
    'router.get("/community/blocked-users"',
  ]) {
    assert.ok(routes.indexOf(route) > authBoundary, `${route}는 Bearer 인증 뒤에 있어야 합니다`);
  }
  assert.match(routes, /communityUpload\.array\("communityFiles", 5\)/);
  assert.equal(controller.uploadError.length, 4);

  console.log("iPad 네이티브 커뮤니티 HTTP 계약 통과");
}

Promise.resolve().then(main).then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});

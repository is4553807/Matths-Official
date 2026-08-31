const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  CommunityComment,
  CommunityPost,
  CommunityUserBlock,
  CommunityVote,
  User,
} = require("../models/matthsModel");
const {
  blockCommunityUser,
  createCommunityComment,
  createCommunityPost,
  getCommunityBlockedUsers,
  getCommunityBoardData,
  getCommunityPost,
  unblockCommunityUser,
  voteCommunityPost,
} = require("../services/communityService");

const blockerId = new mongoose.Types.ObjectId();
const blockedAuthorId = new mongoose.Types.ObjectId();
const visibleAuthorId = new mongoose.Types.ObjectId();
const blockedPostId = new mongoose.Types.ObjectId();
const visiblePostId = new mongoose.Types.ObjectId();
const blockerPostId = new mongoose.Types.ObjectId();
const blockedCommentId = new mongoose.Types.ObjectId();

async function cleanup() {
  const userIds = [blockerId, blockedAuthorId, visibleAuthorId];
  const postIds = [blockedPostId, visiblePostId, blockerPostId];
  await Promise.all([
    CommunityUserBlock.deleteMany({
      $or: [
        { blockerUserId: { $in: userIds } },
        { blockedUserId: { $in: userIds } },
      ],
    }),
    CommunityComment.deleteMany({ postId: { $in: postIds } }),
    CommunityVote.deleteMany({ postId: { $in: postIds } }),
    CommunityPost.deleteMany({ _id: { $in: postIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "커뮤니티 차단 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(process.env.DB);

  try {
    await cleanup();
    await User.create([
      {
        _id: blockerId,
        name: "차단 검증 사용자",
        email: `community-blocker-${blockerId}@example.test`,
        passwordHash: "isolated-audit-password-hash",
        role: "student",
      },
      {
        _id: blockedAuthorId,
        name: "숨겨져야 하는 실명",
        email: `community-blocked-${blockedAuthorId}@example.test`,
        passwordHash: "isolated-audit-password-hash",
        role: "student",
      },
      {
        _id: visibleAuthorId,
        name: "계속 보이는 사용자",
        email: `community-visible-${visibleAuthorId}@example.test`,
        passwordHash: "isolated-audit-password-hash",
        role: "student",
      },
    ]);
    await CommunityPost.create([
      {
        _id: blockedPostId,
        authorId: blockedAuthorId,
        authorName: "익명(042)",
        isAnonymous: true,
        anonymousNumber: "042",
        boardType: "high-school",
        title: "차단 후 숨겨질 게시글",
        content: "차단 관계에서는 목록과 상세에 표시되지 않아야 합니다.",
        status: "published",
      },
      {
        _id: visiblePostId,
        authorId: visibleAuthorId,
        authorName: "계속 보이는 사용자",
        boardType: "high-school",
        title: "차단 후에도 보이는 게시글",
        content: "관련 없는 작성자의 콘텐츠는 계속 표시되어야 합니다.",
        status: "published",
      },
      {
        _id: blockerPostId,
        authorId: blockerId,
        authorName: "차단 검증 사용자",
        boardType: "high-school",
        title: "상호작용 방화벽 검증 게시글",
        content: "차단된 사용자는 이 글에 댓글이나 평가를 남길 수 없어야 합니다.",
        status: "published",
      },
    ]);
    await CommunityComment.create([
      {
        _id: blockedCommentId,
        postId: visiblePostId,
        authorId: blockedAuthorId,
        authorName: "익명(017)",
        isAnonymous: true,
        anonymousNumber: "017",
        content: "차단 후 숨겨질 댓글",
        status: "published",
      },
      {
        postId: visiblePostId,
        authorId: visibleAuthorId,
        authorName: "계속 보이는 사용자",
        content: "차단과 무관해 계속 보이는 댓글",
        status: "published",
      },
    ]);

    await assert.rejects(
      () => createCommunityPost({
        userId: String(blockerId),
        board: "high-school",
        title: "게시 전 안전 필터 검증",
        content: "시 발처럼 띄어 쓴 욕설도 등록되면 안 됩니다.",
      }),
      (error) => error?.status === 422,
      "띄어 쓰기로 우회한 욕설이 게시 전 필터를 통과했습니다."
    );
    await assert.rejects(
      () => createCommunityComment({
        userId: String(visibleAuthorId),
        postId: String(visiblePostId),
        content: "연락처 010-1234-5678로 연락해",
      }),
      (error) => error?.status === 422,
      "개인 연락처가 게시 전 필터를 통과했습니다."
    );

    const firstBlock = await blockCommunityUser({
      userId: String(blockerId),
      postId: String(blockedPostId),
    });
    assert.equal(String(firstBlock.blockedUserId), String(blockedAuthorId));
    assert.equal(firstBlock.displayNameSnapshot, "익명(042)");
    assert.equal(firstBlock.anonymousSnapshot, true);

    await blockCommunityUser({
      userId: String(blockerId),
      postId: String(blockedPostId),
    });
    assert.equal(
      await CommunityUserBlock.countDocuments({
        blockerUserId: blockerId,
        blockedUserId: blockedAuthorId,
      }),
      1,
      "중복 차단 요청이 차단 관계를 여러 개 만들었습니다."
    );

    const blockList = await getCommunityBlockedUsers({
      userId: String(blockerId),
    });
    assert.deepEqual(
      blockList.map((entry) => ({
        displayName: entry.displayName,
        anonymous: entry.anonymous,
      })),
      [{ displayName: "익명(042)", anonymous: true }],
      "익명 게시글 차단 목록이 실제 계정 이름을 노출하거나 익명 표시를 잃었습니다."
    );
    assert.equal(
      blockList.some((entry) => entry.displayName.includes("실명")),
      false,
      "익명 콘텐츠에서 차단한 사용자의 실제 이름이 노출됐습니다."
    );

    await assert.rejects(
      () => getCommunityPost(String(blockedPostId), String(blockerId)),
      (error) => error?.status === 404,
      "차단한 사용자의 게시글 상세가 계속 노출됩니다."
    );
    const blockerBoard = await getCommunityBoardData({
      viewer: { id: String(blockerId) },
      board: "high-school",
      page: 1,
    });
    assert.equal(
      blockerBoard.posts.some((post) => String(post._id) === String(blockedPostId)),
      false,
      "차단한 사용자의 게시글이 목록에 남았습니다."
    );
    assert.equal(
      blockerBoard.popularPosts.some((post) => String(post._id) === String(blockedPostId)),
      false,
      "차단한 사용자의 게시글이 인기 글에 남았습니다."
    );

    const reciprocalBoard = await getCommunityBoardData({
      viewer: { id: String(blockedAuthorId) },
      board: "high-school",
      page: 1,
    });
    assert.equal(
      reciprocalBoard.posts.some((post) => String(post._id) === String(blockerPostId)),
      false,
      "차단된 사용자가 차단자의 게시글을 계속 볼 수 있습니다."
    );
    await assert.rejects(
      () => createCommunityComment({
        userId: String(blockedAuthorId),
        postId: String(blockerPostId),
        content: "차단 뒤 작성되면 안 되는 댓글",
      }),
      (error) => error?.status === 404,
      "차단된 사용자가 차단자의 게시글에 댓글을 남길 수 있습니다."
    );
    await assert.rejects(
      () => voteCommunityPost({
        userId: String(blockedAuthorId),
        postId: String(blockerPostId),
        value: 1,
      }),
      (error) => error?.status === 404,
      "차단된 사용자가 차단자의 게시글을 평가할 수 있습니다."
    );

    const visibleDetail = await getCommunityPost(
      String(visiblePostId),
      String(blockerId)
    );
    assert.equal(
      visibleDetail.comments.some((comment) => String(comment._id) === String(blockedCommentId)),
      false,
      "차단한 사용자의 기존 댓글이 계속 노출됩니다."
    );
    assert.equal(visibleDetail.comments.length, 1);

    await assert.rejects(
      () => blockCommunityUser({
        userId: String(visibleAuthorId),
        postId: String(visiblePostId),
      }),
      (error) => error?.status === 400,
      "사용자가 본인 계정을 차단할 수 있습니다."
    );

    await unblockCommunityUser({
      userId: String(blockerId),
      blockedUserId: String(blockedAuthorId),
    });
    const restored = await getCommunityPost(
      String(blockedPostId),
      String(blockerId)
    );
    assert.equal(String(restored.post._id), String(blockedPostId));

    const commentBlock = await blockCommunityUser({
      userId: String(blockerId),
      postId: String(visiblePostId),
      commentId: String(blockedCommentId),
    });
    assert.equal(commentBlock.sourceType, "comment");
    assert.equal(commentBlock.displayNameSnapshot, "익명(017)");
    const afterCommentBlock = await getCommunityPost(
      String(visiblePostId),
      String(blockerId)
    );
    assert.equal(
      afterCommentBlock.comments.some((comment) => String(comment._id) === String(blockedCommentId)),
      false,
      "댓글에서 차단한 작성자의 댓글이 계속 노출됩니다."
    );

    console.log(
      "커뮤니티 안전 DB 검증 완료: 게시 전 필터, 익명 보호, 목록·상세·댓글 숨김, 양방향 상호작용 차단, 해제 PASS"
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  CommunityPost,
  User,
} = require("../models/matthsModel");
const {
  deleteCommunityPostByAuthor,
  getAdminCommunityData,
  getCommunityBoardData,
  getCommunityPost,
} = require("../services/communityService");

const authorId =
  new mongoose.Types.ObjectId();
const otherUserId =
  new mongoose.Types.ObjectId();
const postId =
  new mongoose.Types.ObjectId();
const suffix = String(postId);

async function cleanup() {
  await CommunityPost.deleteMany({
    _id: postId,
  });
  await User.deleteMany({
    _id: {
      $in: [
        authorId,
        otherUserId,
      ],
    },
  });
}

async function main() {
  assert.match(
    String(process.env.DB || ""),
    /matths_audit_zero_assumption_20260815/,
    "작성자 삭제 검증은 격리 감사 DB에서만 실행할 수 있습니다."
  );
  await mongoose.connect(
    process.env.DB
  );

  try {
    await cleanup();
    await User.create([
      {
        _id: authorId,
        name: `삭제검증작성자${suffix.slice(-5)}`,
        email: `community-delete-author-${suffix}@example.test`,
        passwordHash:
          "isolated-audit-password-hash",
        role: "student",
      },
      {
        _id: otherUserId,
        name: `삭제검증타인${suffix.slice(-5)}`,
        email: `community-delete-other-${suffix}@example.test`,
        passwordHash:
          "isolated-audit-password-hash",
        role: "student",
      },
    ]);
    await CommunityPost.create({
      _id: postId,
      authorId,
      authorName:
        "삭제 검증 작성자",
      boardType:
        "high-school",
      title:
        "작성자 소프트 삭제 검증 글",
      content:
        "이 본문은 삭제 후에도 운영 확인을 위해 데이터베이스에 남아야 합니다.",
      status: "published",
      isPinned: true,
      pinnedAt: new Date(),
      pinnedBy: authorId,
    });

    const before =
      await getCommunityPost(
        String(postId)
      );
    assert.equal(
      before.post.status,
      "published"
    );

    await assert.rejects(
      () =>
        deleteCommunityPostByAuthor(
          {
            userId:
              String(otherUserId),
            postId:
              String(postId),
          }
        ),
      (error) =>
        error?.status === 403,
      "다른 사용자가 작성자의 게시글을 삭제할 수 있습니다."
    );

    const deleted =
      await deleteCommunityPostByAuthor(
        {
          userId:
            String(authorId),
          postId:
            String(postId),
        }
      );
    assert.equal(
      deleted.status,
      "deleted"
    );
    assert.ok(
      deleted.authorDeletedAt
    );

    const retained =
      await CommunityPost.findById(
        postId
      ).lean();
    assert.ok(
      retained,
      "작성자가 삭제한 게시글이 DB에서 제거되었습니다."
    );
    assert.equal(
      retained.status,
      "deleted"
    );
    assert.ok(
      retained.authorDeletedAt instanceof
        Date
    );
    assert.equal(
      retained.isPinned,
      false
    );
    assert.equal(
      retained.title,
      "작성자 소프트 삭제 검증 글"
    );
    assert.match(
      retained.content,
      /데이터베이스에 남아야 합니다/
    );

    await assert.rejects(
      () =>
        getCommunityPost(
          String(postId)
        ),
      (error) =>
        error?.status === 404,
      "작성자가 삭제한 게시글이 일반 상세 조회에 노출됩니다."
    );

    const boardData =
      await getCommunityBoardData({
        viewer: null,
        board:
          "high-school",
        page: 1,
      });
    assert.equal(
      boardData.posts.some(
        (post) =>
          String(post._id) ===
          String(postId)
      ),
      false,
      "작성자가 삭제한 게시글이 일반 목록에 노출됩니다."
    );

    await CommunityPost.updateOne(
      { _id: postId },
      {
        $set: {
          status:
            "published",
        },
      }
    );
    await assert.rejects(
      () =>
        getCommunityPost(
          String(postId)
        ),
      (error) =>
        error?.status === 404,
      "삭제 시각이 남은 게시글이 상태값만 바뀌어 일반 화면에 다시 노출됩니다."
    );
    await CommunityPost.updateOne(
      { _id: postId },
      {
        $set: {
          status:
            "deleted",
        },
      }
    );

    const adminData =
      await getAdminCommunityData({
        board:
          "high-school",
        status: "deleted",
        search:
          "작성자 소프트 삭제 검증 글",
        page: 1,
      });
    const adminPost =
      adminData.posts.find(
        (post) =>
          String(post._id) ===
          String(postId)
      );
    assert.ok(
      adminPost,
      "작성자가 삭제한 게시글이 운영자 조회에서 사라졌습니다."
    );
    assert.ok(
      adminPost.authorDeletedAt
    );

    const repeated =
      await deleteCommunityPostByAuthor(
        {
          userId:
            String(authorId),
          postId:
            String(postId),
        }
      );
    assert.equal(
      String(repeated._id),
      String(postId),
      "중복 삭제 요청이 안전하게 처리되지 않았습니다."
    );

    console.log(
      "게시글 작성자 소프트 삭제 DB 검증 완료: 본인 권한, DB 보존, 일반 화면 차단, 운영자 조회 PASS"
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

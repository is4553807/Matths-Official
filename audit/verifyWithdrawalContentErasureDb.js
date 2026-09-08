"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { CommunityPost, CommunityComment } = require("../models/matthsModel");
const { anonymizePublicActivity } = require("../services/accountDeletionService");

async function main() {
  assert.equal(process.env.ALLOW_TEST_DATA_MUTATION, "1");
  assert.match(process.env.DB || "", /127\.0\.0\.1|localhost/);
  await mongoose.connect(process.env.DB);
  try {
    const owner = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    for (let i = 0; i < 2; i++) {
      const authorId = i === 0 ? owner : other;
      await CommunityPost.collection.insertOne({
        _id: ids[i], authorId, authorName: "원래 이름", title: "개인정보 제목",
        content: "개인정보 본문", attachments: [{ originalName: "private.jpg" }],
        moderationReason: "개인정보 메모", status: "published",
      });
      await CommunityComment.collection.insertOne({
        postId: ids[i], authorId, authorName: "원래 이름",
        content: "개인정보 댓글", moderationReason: "개인정보 메모", status: "published",
      });
    }
    await anonymizePublicActivity(owner);
    const post = await CommunityPost.findById(ids[0]).lean();
    const comment = await CommunityComment.findOne({authorId: owner}).lean();
    assert.equal(post.title, "삭제된 게시글");
    assert.equal(post.content, "작성자가 탈퇴하여 삭제된 게시글입니다.");
    assert.deepEqual(post.attachments, []);
    assert.equal(post.moderationReason, "");
    assert.equal(comment.content, "작성자가 탈퇴하여 삭제된 댓글입니다.");
    assert.equal(comment.moderationReason, "");
    assert.equal((await CommunityPost.findById(ids[1]).lean()).content, "개인정보 본문");
    assert.equal((await CommunityComment.findOne({authorId: other}).lean()).content, "개인정보 댓글");
    await anonymizePublicActivity(owner);
    console.log("PASS withdrawal erases free text and attachment metadata; other authors unchanged; retry safe");
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

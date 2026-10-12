"use strict";

const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * User.nameNormalized 과 ArenaGuestIdentity.nicknameNormalized 은 서로 다른
 * 컬렉션의 unique index라서 동시에 비어 있는 이름을 선점하면 둘 다 성공할
 * 수 있다. 이 작은 namespace 컬렉션의 _id 하나를 두 종류의 신원이 함께
 * 사용해, 실제 회원/게스트 문서를 쓰기 전에 한 곳에서 원자적으로 선점한다.
 */
const nicknameNamespaceSchema = new Schema(
  {
    _id: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30,
      required: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 30,
      required: true,
    },
    ownerKind: {
      type: String,
      enum: ["USER", "GUEST"],
      required: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    linkedGuestIdentityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

nicknameNamespaceSchema.index(
  { ownerKind: 1, ownerId: 1 },
  { name: "nickname_namespace_owner_v1" }
);

module.exports =
  mongoose.models.NicknameNamespace ||
  mongoose.model("NicknameNamespace", nicknameNamespaceSchema);

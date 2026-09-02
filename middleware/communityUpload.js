const path = require("path");
const multer = require("multer");

const {
  User,
} = require("../models/matthsModel");
const {
  COMMUNITY_ATTACHMENT_EXTENSIONS,
  COMMUNITY_ATTACHMENT_LIMIT,
  COMMUNITY_ATTACHMENT_MAX_BYTES,
} = require(
  "../services/communityAttachmentService"
);
const {
  userCloudUploadStorage,
} = require("./userCloudUploadStorage");


async function loadCommunityUploadAccess(
  req,
  res,
  next
) {
  try {
    const user =
      await User.findOne({
        _id:
          req.apiUser?._id || req.session?.user?.id,
        isActive: true,
        accountStatus: {
          $in: [
            "active",
            null,
          ],
        },
      })
        .select("warningCount")
        .lean();

    if (!user) {
      const error = new Error(
        "활성 계정만 게시글을 작성할 수 있습니다."
      );
      error.status = 403;
      return next(error);
    }

    req.communityFileUploadAllowed =
      Number(
        user.warningCount || 0
      ) === 0;
    return next();
  } catch (error) {
    return next(error);
  }
}

const communityUpload = multer({
  storage: userCloudUploadStorage,
  limits: {
    files:
      COMMUNITY_ATTACHMENT_LIMIT,
    fileSize:
      COMMUNITY_ATTACHMENT_MAX_BYTES,
  },
  fileFilter(
    req,
    file,
    callback
  ) {
    if (
      !req
        .communityFileUploadAllowed
    ) {
      const error = new Error(
        "경고 횟수가 1회 이상인 계정은 게시판에 파일이나 사진을 올릴 수 없습니다. 경고가 0회로 조정되면 다시 이용할 수 있습니다."
      );
      error.status = 403;
      error.code =
        "COMMUNITY_UPLOAD_RESTRICTED";
      return callback(error);
    }

    const extension =
      path.extname(
        file.originalname
      ).toLowerCase();

    if (
      !COMMUNITY_ATTACHMENT_EXTENSIONS.has(
        extension
      )
    ) {
      const error = new Error(
        "PDF, 문서, 스프레드시트, 프레젠테이션, ZIP 또는 이미지 파일만 올릴 수 있습니다."
      );
      error.status = 400;
      return callback(error);
    }

    return callback(null, true);
  },
});

module.exports = {
  communityUpload,
  loadCommunityUploadAccess,
};

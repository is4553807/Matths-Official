const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const sharp = require("sharp");
const { Academy } = require("../models/academyModel");
const { User } = require("../models/matthsModel");
const {
  USER_CLOUD_UPLOAD_TEMP_DIR,
} = require("../middleware/userCloudUploadStorage");
const {
  getAcademyOwnerContext,
} = require("./academyService");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
  storageFields,
  storeUploadedFile,
  STORAGE_PURPOSES,
} = require("./fileStorageService");

const ACADEMY_PROFILE_IMAGE_SIZE = 512;
const ACADEMY_PROFILE_IMAGE_MAX_PIXELS = 25_000_000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function resolveAcademyProfileImage(asset = {}) {
  if (!asset?.cloudPublicId) return "";
  return signedCloudinaryUrl(asset) || "";
}

async function createSquareAcademyProfileImageFile(file) {
  if (!file?.path || !file.contentValidated) {
    throw statusError(
      422,
      "검사되지 않은 사진은 학원 프로필 이미지로 저장할 수 없습니다.",
      "ACADEMY_PROFILE_IMAGE_NOT_VALIDATED"
    );
  }

  const outputPath = path.join(
    USER_CLOUD_UPLOAD_TEMP_DIR,
    `${Date.now()}-${randomUUID()}-academy-profile.webp`
  );
  try {
    await sharp(file.path, {
      failOn: "error",
      limitInputPixels: ACADEMY_PROFILE_IMAGE_MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: ACADEMY_PROFILE_IMAGE_SIZE,
        height: ACADEMY_PROFILE_IMAGE_SIZE,
        fit: "cover",
        position: "attention",
      })
      .webp({ quality: 84, effort: 4 })
      .toFile(outputPath);
  } catch (_error) {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw statusError(
      422,
      "사진을 학원 프로필 이미지로 변환할 수 없습니다. 다른 JPG, PNG 또는 WEBP 사진을 선택해 주세요.",
      "ACADEMY_PROFILE_IMAGE_PROCESSING_FAILED"
    );
  }

  const stats = await fs.promises.stat(outputPath);
  return {
    fieldname: "profileImage",
    originalname: "academy-profile.webp",
    encoding: "7bit",
    mimetype: "image/webp",
    destination: USER_CLOUD_UPLOAD_TEMP_DIR,
    filename: path.basename(outputPath),
    path: outputPath,
    size: stats.size,
    contentValidated: true,
  };
}

async function saveAcademyProfileImage({ academy, file }) {
  if (!file) {
    throw statusError(400, "변경할 학원 프로필 사진을 선택해 주세요.");
  }

  const previousAsset = academy.profileImageAsset;
  let preparedFile = null;
  let storedAsset = null;
  try {
    preparedFile = await createSquareAcademyProfileImageFile(file);
    storedAsset = await storeUploadedFile(preparedFile, {
      folder: "matths/academy-profile-images",
      purpose: STORAGE_PURPOSES.ACADEMY_PROFILE_IMAGE,
    });
    const profileImageAsset = {
      ...storageFields(storedAsset),
      uploadedAt: new Date(),
    };
    const updatedAcademy = await Academy.findOneAndUpdate(
      { _id: academy._id },
      { $set: { profileImageAsset } },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!updatedAcademy) throw statusError(404, "학원을 찾을 수 없습니다.");

    if (previousAsset?.cloudPublicId) {
      await destroyStoredAsset(previousAsset).catch((error) => {
        console.warn(`학원 프로필 사진 이전 원본 삭제 실패: ${error.message}`);
      });
    }
    return updatedAcademy;
  } catch (error) {
    if (storedAsset) await destroyStoredAsset(storedAsset).catch(() => {});
    throw error;
  } finally {
    await Promise.all([
      file?.path ? fs.promises.unlink(file.path).catch(() => {}) : null,
      preparedFile?.path
        ? fs.promises.unlink(preparedFile.path).catch(() => {})
        : null,
    ]);
  }
}

async function clearAcademyProfileImage(academy) {
  const previousAsset = academy.profileImageAsset;
  if (!previousAsset?.cloudPublicId) {
    throw statusError(404, "삭제할 학원 프로필 사진이 없습니다.");
  }

  const updatedAcademy = await Academy.findOneAndUpdate(
    { _id: academy._id },
    { $unset: { profileImageAsset: 1 } },
    { returnDocument: "after" }
  ).lean();
  if (!updatedAcademy) throw statusError(404, "학원을 찾을 수 없습니다.");
  await destroyStoredAsset(previousAsset).catch((error) => {
    console.warn(`학원 프로필 사진 원본 삭제 실패: ${error.message}`);
  });
  return updatedAcademy;
}

async function getAdminAcademy(adminUserId, academyId) {
  const admin = await User.findById(adminUserId)
    .select("role isActive accountStatus")
    .lean();
  const accountStatus = admin?.accountStatus || (admin?.isActive === false ? "inactive" : "active");
  if (!admin || admin.role !== "admin" || admin.isActive === false || accountStatus !== "active") {
    throw statusError(403, "활성 운영자 계정만 학원 프로필 사진을 관리할 수 있습니다.");
  }
  if (!mongoose.isValidObjectId(academyId)) {
    throw statusError(404, "학원을 찾을 수 없습니다.");
  }
  const academy = await Academy.findById(academyId).lean();
  if (!academy) throw statusError(404, "학원을 찾을 수 없습니다.");
  return academy;
}

async function updateAcademyProfileImage({ teacherUserId, file }) {
  const context = await getAcademyOwnerContext(teacherUserId);
  return saveAcademyProfileImage({ academy: context.academy, file });
}

async function removeAcademyProfileImage({ teacherUserId }) {
  const context = await getAcademyOwnerContext(teacherUserId);
  return clearAcademyProfileImage(context.academy);
}

async function updateAcademyProfileImageAsAdmin({ adminUserId, academyId, file }) {
  const academy = await getAdminAcademy(adminUserId, academyId);
  return saveAcademyProfileImage({ academy, file });
}

async function removeAcademyProfileImageAsAdmin({ adminUserId, academyId }) {
  const academy = await getAdminAcademy(adminUserId, academyId);
  return clearAcademyProfileImage(academy);
}

module.exports = {
  ACADEMY_PROFILE_IMAGE_MAX_PIXELS,
  ACADEMY_PROFILE_IMAGE_SIZE,
  createSquareAcademyProfileImageFile,
  removeAcademyProfileImage,
  removeAcademyProfileImageAsAdmin,
  resolveAcademyProfileImage,
  updateAcademyProfileImage,
  updateAcademyProfileImageAsAdmin,
};

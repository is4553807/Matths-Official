const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const sharp = require("sharp");
const {
  User,
} = require("../models/matthsModel");
const {
  ARENA_PROFILE_AVATAR_CODES,
  getArenaProfileAvatar,
} = require("../constants/arenaProfileAvatars");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
  storageFields,
  storeUploadedFile,
  STORAGE_PURPOSES,
} = require("./fileStorageService");
const {
  USER_CLOUD_UPLOAD_TEMP_DIR,
} = require("../middleware/userCloudUploadStorage");

const PROFILE_AVATAR_SIZE = 512;
const PROFILE_AVATAR_MAX_PIXELS = 25_000_000;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function presetAvatar(preferences = {}) {
  return {
    ...getArenaProfileAvatar(preferences?.arenaAvatarCode),
    isCustom: false,
  };
}

function resolveArenaProfileAvatar(preferences = {}) {
  if (
    String(preferences?.profileAvatarMode || "").toUpperCase() !== "CUSTOM" ||
    !preferences?.profileAvatarAsset?.cloudPublicId
  ) {
    return presetAvatar(preferences);
  }

  const imageSrc = signedCloudinaryUrl(preferences.profileAvatarAsset);
  if (!imageSrc) return presetAvatar(preferences);

  return {
    code: "CUSTOM",
    label: "내 사진",
    description: "기기에서 직접 올린 프로필 사진",
    imageSrc,
    isCustom: true,
  };
}

async function destroyPreviousCustomAvatar(preferences = {}) {
  const asset = preferences?.profileAvatarAsset;
  if (!asset?.cloudPublicId) return;
  await destroyStoredAsset(asset).catch((error) => {
    console.warn(`프로필 사진 이전 원본 삭제 실패: ${error.message}`);
  });
}

async function updateArenaProfileAvatar({ userId, avatarCode }) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  const normalizedCode = String(avatarCode || "").trim().toUpperCase();
  if (!ARENA_PROFILE_AVATAR_CODES.includes(normalizedCode)) {
    throw statusError(400, "선택할 수 없는 프로필 이미지입니다.");
  }

  const previousUser = await User.findById(userId)
    .select("preferences.profileAvatarAsset preferences.profileAvatarMode")
    .lean();
  if (!previousUser) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "preferences.arenaAvatarCode": normalizedCode,
        "preferences.profileAvatarMode": "PRESET",
      },
      $unset: {
        "preferences.profileAvatarAsset": 1,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!user) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  await destroyPreviousCustomAvatar(previousUser.preferences);
  return resolveArenaProfileAvatar(user.preferences);
}

async function createSquareProfileAvatarFile(file) {
  if (!file?.path || !file.contentValidated) {
    throw statusError(
      422,
      "검사되지 않은 사진은 프로필 이미지로 저장할 수 없습니다.",
      "PROFILE_AVATAR_NOT_VALIDATED"
    );
  }

  const outputPath = path.join(
    USER_CLOUD_UPLOAD_TEMP_DIR,
    `${Date.now()}-${randomUUID()}-profile.webp`
  );
  try {
    await sharp(file.path, {
      failOn: "error",
      limitInputPixels: PROFILE_AVATAR_MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: PROFILE_AVATAR_SIZE,
        height: PROFILE_AVATAR_SIZE,
        fit: "cover",
        position: "attention",
      })
      .webp({ quality: 84, effort: 4 })
      .toFile(outputPath);
  } catch (_error) {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw statusError(
      422,
      "사진을 프로필 이미지로 변환할 수 없습니다. 다른 JPG, PNG 또는 WEBP 사진을 선택해 주세요.",
      "PROFILE_AVATAR_PROCESSING_FAILED"
    );
  }

  const stats = await fs.promises.stat(outputPath);
  return {
    fieldname: "profileImage",
    originalname: "profile-avatar.webp",
    encoding: "7bit",
    mimetype: "image/webp",
    destination: USER_CLOUD_UPLOAD_TEMP_DIR,
    filename: path.basename(outputPath),
    path: outputPath,
    size: stats.size,
    contentValidated: true,
  };
}

async function updateCustomProfileAvatar({ userId, file }) {
  if (!mongoose.isValidObjectId(userId)) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  const previousUser = await User.findById(userId)
    .select("preferences.profileAvatarAsset preferences.profileAvatarMode")
    .lean();
  if (!previousUser) {
    throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
  }

  let preparedFile = null;
  let storedAsset = null;
  try {
    preparedFile = await createSquareProfileAvatarFile(file);
    storedAsset = await storeUploadedFile(preparedFile, {
      folder: "matths/profile-avatars",
      purpose: STORAGE_PURPOSES.USER_PROFILE_AVATAR,
    });
    const profileAvatarAsset = {
      ...storageFields(storedAsset),
      uploadedAt: new Date(),
    };
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "preferences.profileAvatarMode": "CUSTOM",
          "preferences.profileAvatarAsset": profileAvatarAsset,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!user) {
      throw statusError(404, "사용자 정보를 찾을 수 없습니다.");
    }

    await destroyPreviousCustomAvatar(previousUser.preferences);
    return resolveArenaProfileAvatar(user.preferences);
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

module.exports = {
  createSquareProfileAvatarFile,
  PROFILE_AVATAR_MAX_PIXELS,
  PROFILE_AVATAR_SIZE,
  resolveArenaProfileAvatar,
  updateArenaProfileAvatar,
  updateCustomProfileAvatar,
};

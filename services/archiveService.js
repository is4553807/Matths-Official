const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const {
  ArchiveFolder,
  ArchiveItem,
  PrivateMockExam,
} = require("../models/matthsModel");

const ARCHIVE_STORAGE_DIR =
  path.resolve(
    process.env
      .ARCHIVE_STORAGE_DIR ||
      path.join(
        __dirname,
        "..",
        "storage",
        "archive"
      )
  );
const ARCHIVE_CATEGORIES = [
  "문제지",
  "해설",
  "개념 자료",
  "기타",
];
const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL ||
    "admin@lsbproduction.com"
)
  .trim()
  .toLowerCase();

function isArchiveAdmin(user) {
  return (
    user?.role === "admin" ||
    String(user?.email || "")
      .trim()
      .toLowerCase() ===
      ADMIN_EMAIL
  );
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeEncodingMojibake(
  value
) {
  return /[\u0080-\u009f]|Ã|Â|á[\u0080-\u00bf]|\uFFFD/.test(
    String(value || "")
  );
}

function repairUploadFilename(
  value
) {
  const original =
    String(value || "");

  if (!original) {
    return "";
  }

  const decoded =
    Buffer.from(
      original,
      "latin1"
    ).toString("utf8");
  const originalReplacementCount =
    (
      original.match(/\uFFFD/g) ||
      []
    ).length;
  const decodedReplacementCount =
    (
      decoded.match(/\uFFFD/g) ||
      []
    ).length;
  const originalHasMojibake =
    looksLikeEncodingMojibake(
      original
    );
  const decodedHasHangul =
    /[가-힣]/.test(decoded);
  const originalHasHangul =
    /[가-힣]/.test(original);
  const shouldUseDecoded =
    decodedReplacementCount <=
      originalReplacementCount &&
    (
      originalHasMojibake ||
      (
        decodedHasHangul &&
        !originalHasHangul
      )
    );
  const decodedWithoutBrokenTail =
    decoded.replace(
      /\uFFFD+$/g,
      ""
    );
  const hasOnlyTerminalDecodeDamage =
    originalHasMojibake &&
    decodedWithoutBrokenTail &&
    !decodedWithoutBrokenTail.includes(
      "\uFFFD"
    ) &&
    decodedReplacementCount > 0;

  return (
    shouldUseDecoded
      ? decoded
      : hasOnlyTerminalDecodeDamage
        ? decodedWithoutBrokenTail
      : original
  ).normalize("NFC");
}

function serializeArchiveItem(item) {
  const repairedOriginalName =
    repairUploadFilename(
      item.originalName
    );
  const repairedTitle =
    repairUploadFilename(
      item.title
    );
  const title =
    (
      looksLikeEncodingMojibake(
        item.title
      ) ||
      repairedTitle.includes(
        "\uFFFD"
      )
    ) &&
    repairedOriginalName
      ? repairedOriginalName
      : repairedTitle ||
        repairedOriginalName;

  return {
    id: String(item._id),
    folderId:
      item.folderId
        ? String(item.folderId)
        : null,
    title:
      title.slice(0, 120),
    description:
      item.description || "",
    category: item.category,
    originalName:
      repairedOriginalName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    downloadCount:
      item.downloadCount || 0,
    createdAt: item.createdAt,
    isPublished:
      item.isPublished !== false,
  };
}

function serializeArchiveFolder(
  folder,
  itemCount = 0
) {
  return {
    id: String(folder._id),
    parentFolderId:
      folder.parentFolderId
        ? String(
            folder.parentFolderId
          )
        : null,
    name: folder.name,
    description:
      folder.description || "",
    slug: folder.slug,
    isPublished:
      folder.isPublished !== false,
    itemCount,
    createdAt: folder.createdAt,
  };
}

async function getArchiveData(
  user,
  {
    includeUnpublished = false,
    folderId = "",
  } = {}
) {
  const admin =
    isArchiveAdmin(user);
  const visibleFilter =
    admin && includeUnpublished
      ? {}
      : { isPublished: true };
  const folders =
    await ArchiveFolder.find(
      visibleFilter
    )
      .sort({ name: 1 })
      .lean();
  const requestedFolderId =
    String(folderId || "");
  let selectedFolder = null;

  if (requestedFolderId) {
    if (
      !mongoose.isValidObjectId(
        requestedFolderId
      )
    ) {
      throw httpError(
        404,
        "아카이브 폴더를 찾을 수 없습니다."
      );
    }

    selectedFolder =
      folders.find(
        (folder) =>
          String(folder._id) ===
          requestedFolderId
      ) || null;

    if (!selectedFolder) {
      throw httpError(
        404,
        "아카이브 폴더를 찾을 수 없습니다."
      );
    }
  }

  const itemFilter = {
    ...visibleFilter,
    folderId: selectedFolder
      ? selectedFolder._id
      : null,
  };
  const [
    items,
    folderCounts,
  ] = await Promise.all([
    ArchiveItem.find(itemFilter)
      .sort({ createdAt: -1 })
      .lean(),
    ArchiveItem.aggregate([
      {
        $match:
          admin &&
          includeUnpublished
            ? {
                folderId: {
                  $ne: null,
                },
              }
            : {
                folderId: {
                  $ne: null,
                },
                isPublished: true,
              },
      },
      {
        $group: {
          _id: "$folderId",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);
  const countByFolder =
    new Map(
      folderCounts.map(
        (entry) => [
          String(entry._id),
          entry.count,
        ]
      )
    );
  const folderById =
    new Map(
      folders.map((folder) => [
        String(folder._id),
        folder,
      ])
    );
  const folderPath = (
    folder
  ) => {
    const segments = [];
    const visited = new Set();
    let current = folder;

    while (
      current &&
      !visited.has(
        String(current._id)
      )
    ) {
      visited.add(
        String(current._id)
      );
      segments.unshift(
        current.name
      );
      current =
        current.parentFolderId
          ? folderById.get(
              String(
                current.parentFolderId
              )
            )
          : null;
    }

    return segments;
  };
  const currentParentId =
    selectedFolder
      ? String(
          selectedFolder._id
        )
      : null;
  const visibleFolders =
    folders.filter(
      (folder) =>
        (
          folder.parentFolderId
            ? String(
                folder.parentFolderId
              )
            : null
        ) === currentParentId
    );

  return {
    isAdmin: admin,
    categories:
      ARCHIVE_CATEGORIES,
    folders:
      visibleFolders.map(
        (folder) =>
        serializeArchiveFolder(
          folder,
          countByFolder.get(
            String(folder._id)
          ) || 0
        )
      ),
    folderOptions:
      folders.map((folder) => {
        const pathSegments =
          folderPath(folder);
        return {
          ...serializeArchiveFolder(
            folder,
            countByFolder.get(
              String(folder._id)
            ) || 0
          ),
          depth:
            Math.max(
              0,
              pathSegments.length -
                1
            ),
          pathLabel:
            pathSegments.join(
              " / "
            ),
        };
      }),
    breadcrumbs:
      selectedFolder
        ? folderPath(
            selectedFolder
          ).map(
            (
              _,
              index,
              pathSegments
            ) => {
              const pathName =
                pathSegments[index];
              let match =
                selectedFolder;

              while (
                match &&
                match.name !==
                  pathName
              ) {
                match =
                  match.parentFolderId
                    ? folderById.get(
                        String(
                          match.parentFolderId
                        )
                      )
                    : null;
              }

              return match
                ? {
                    id: String(
                      match._id
                    ),
                    name:
                      match.name,
                  }
                : null;
            }
          ).filter(Boolean)
        : [],
    selectedFolder:
      selectedFolder
        ? serializeArchiveFolder(
            selectedFolder,
            countByFolder.get(
              String(
                selectedFolder._id
              )
            ) || 0
          )
        : null,
    items:
      items.map(
        serializeArchiveItem
      ),
  };
}

async function createArchiveItem({
  user,
  file,
  title,
  description,
  category,
  folderId,
  isPublished = true,
}) {
  if (!isArchiveAdmin(user)) {
    throw httpError(
      403,
      "운영자만 아카이브 파일을 추가할 수 있습니다."
    );
  }

  if (!file) {
    throw httpError(
      400,
      "추가할 파일을 선택해주세요."
    );
  }

  const cleanTitle =
    cleanText(
      repairUploadFilename(
        title
      )
    );
  const cleanDescription =
    cleanText(description);
  const normalizedCategory =
    ARCHIVE_CATEGORIES.includes(
      category
    )
      ? category
      : "기타";
  let normalizedFolderId =
    null;

  if (folderId) {
    if (
      !mongoose.isValidObjectId(
        folderId
      )
    ) {
      throw httpError(
        400,
        "선택한 폴더가 올바르지 않습니다."
      );
    }

    const folder =
      await ArchiveFolder.findById(
        folderId
      ).lean();

    if (!folder) {
      throw httpError(
        400,
        "선택한 폴더를 찾을 수 없습니다."
      );
    }

    normalizedFolderId =
      folder._id;
  }

  if (
    cleanTitle.length < 2 ||
    cleanTitle.length > 120
  ) {
    throw httpError(
      400,
      "자료 제목은 2자 이상 120자 이하로 입력해주세요."
    );
  }

  if (
    cleanDescription.length >
    1000
  ) {
    throw httpError(
      400,
      "자료 설명은 1,000자 이하로 입력해주세요."
    );
  }

  try {
    const item =
      await ArchiveItem.create({
        folderId:
          normalizedFolderId,
        title: cleanTitle,
        description:
          cleanDescription,
        category:
          normalizedCategory,
        originalName:
          repairUploadFilename(
            file.originalname
          ),
        storedName:
          file.filename,
        mimeType:
          file.mimetype,
        sizeBytes: file.size,
        uploadedBy: user.id,
        isPublished:
          isPublished !== false,
      });

    return serializeArchiveItem(
      item
    );
  } catch (error) {
    await fs.promises
      .unlink(file.path)
      .catch(() => {});
    throw error;
  }
}

async function createArchiveItems({
  user,
  files,
  description,
  category,
  folderId,
  isPublished = true,
}) {
  const uploadFiles =
    Array.isArray(files)
      ? files.filter(Boolean)
      : [];

  if (
    !uploadFiles.length
  ) {
    throw httpError(
      400,
      "추가할 파일을 하나 이상 선택해주세요."
    );
  }

  if (
    uploadFiles.length > 20
  ) {
    throw httpError(
      400,
      "한 번에 최대 20개 파일까지 올릴 수 있습니다."
    );
  }

  const createdItems = [];

  try {
    for (const file of uploadFiles) {
      const fileTitle =
        cleanText(
          repairUploadFilename(
            file.originalname
          )
        ).slice(0, 120);
      const item =
        await createArchiveItem({
          user,
          file,
          title: fileTitle,
          description,
          category,
          folderId,
          isPublished,
        });
      createdItems.push(item);
    }

    return createdItems;
  } catch (error) {
    if (createdItems.length) {
      await ArchiveItem.deleteMany({
        _id: {
          $in:
            createdItems.map(
              (item) =>
                item.id
            ),
        },
      }).catch(() => {});
    }

    await Promise.all(
      uploadFiles.map((file) =>
        discardArchiveUpload(
          file
        )
      )
    );
    throw error;
  }
}

async function createArchiveFolder({
  user,
  name,
  description,
  parentFolderId,
}) {
  if (!isArchiveAdmin(user)) {
    throw httpError(
      403,
      "운영자만 아카이브 폴더를 추가할 수 있습니다."
    );
  }

  const cleanName =
    cleanText(name);
  const cleanDescription =
    cleanText(description);
  let normalizedParentId =
    null;

  if (parentFolderId) {
    if (
      !mongoose.isValidObjectId(
        parentFolderId
      )
    ) {
      throw httpError(
        400,
        "상위 폴더가 올바르지 않습니다."
      );
    }

    const parent =
      await ArchiveFolder.findById(
        parentFolderId
      ).lean();

    if (!parent) {
      throw httpError(
        404,
        "상위 폴더를 찾을 수 없습니다."
      );
    }

    normalizedParentId =
      parent._id;
  }

  if (
    cleanName.length < 2 ||
    cleanName.length > 80
  ) {
    throw httpError(
      400,
      "폴더 이름은 2자 이상 80자 이하로 입력해주세요."
    );
  }

  if (
    cleanDescription.length >
    500
  ) {
    throw httpError(
      400,
      "폴더 설명은 500자 이하로 입력해주세요."
    );
  }

  const duplicate =
    await ArchiveFolder.exists({
      name: cleanName,
    });

  if (duplicate) {
    throw httpError(
      409,
      "같은 이름의 폴더가 이미 있습니다."
    );
  }

  const slugBase =
    cleanName
      .toLowerCase()
      .replace(
        /[^a-z0-9가-힣]+/g,
        "-"
      )
      .replace(/^-|-$/g, "")
      .slice(0, 70) ||
    "folder";
  const folder =
    await ArchiveFolder.create({
      name: cleanName,
      description:
        cleanDescription,
      slug:
        `${slugBase}-${Date.now().toString(36)}`,
      parentFolderId:
        normalizedParentId,
      createdBy: user.id,
    });

  return serializeArchiveFolder(
    folder
  );
}

async function discardArchiveUpload(
  file
) {
  if (!file?.path) return;

  await fs.promises
    .unlink(file.path)
    .catch(() => {});
}

async function getArchiveDownload({
  itemId,
  user,
}) {
  const item =
    await ArchiveItem.findById(
      itemId
    ).lean();

  if (
    !item ||
    (
      item.isPublished ===
        false &&
      !isArchiveAdmin(user)
    )
  ) {
    throw httpError(
      404,
      "아카이브 자료를 찾을 수 없습니다."
    );
  }

  const filePath =
    path.join(
      ARCHIVE_STORAGE_DIR,
      item.storedName
    );

  if (
    !fs.existsSync(filePath)
  ) {
    throw httpError(
      404,
      "자료 파일을 찾을 수 없습니다."
    );
  }

  await ArchiveItem.updateOne(
    { _id: item._id },
    {
      $inc: {
        downloadCount: 1,
      },
    }
  );

  return {
    path: filePath,
    name:
      repairUploadFilename(
        item.originalName
      ),
    mimeType: item.mimeType,
  };
}

async function deleteArchiveItem({
  itemId,
  user,
}) {
  if (!isArchiveAdmin(user)) {
    throw httpError(
      403,
      "운영자만 아카이브 자료를 삭제할 수 있습니다."
    );
  }

  if (
    !mongoose.isValidObjectId(
      itemId
    )
  ) {
    throw httpError(
      404,
      "삭제할 자료를 찾을 수 없습니다."
    );
  }

  const item =
    await ArchiveItem.findById(
      itemId
    ).lean();

  if (!item) {
    throw httpError(
      404,
      "삭제할 자료를 찾을 수 없습니다."
    );
  }

  const linkedExam =
    await PrivateMockExam.exists({
      $or: [
        {
          archiveItemId:
            item._id,
        },
        {
          answerSheetArchiveItemId:
            item._id,
        },
      ],
      status: {
        $in: [
          "scheduled",
          "open",
          "finalizing",
        ],
      },
    });

  if (linkedExam) {
    throw httpError(
      409,
      "현재 공개 대기 또는 응시 중인 사설 모의고사 문제지는 마감 전까지 삭제할 수 없습니다."
    );
  }

  const filePath =
    path.join(
      ARCHIVE_STORAGE_DIR,
      path.basename(
        item.storedName
      )
    );

  await fs.promises
    .unlink(filePath)
    .catch((error) => {
      if (
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    });
  await ArchiveItem.deleteOne({
    _id: item._id,
  });

  return serializeArchiveItem(
    item
  );
}

async function deleteArchiveItems({
  itemIds,
  user,
}) {
  if (!isArchiveAdmin(user)) {
    throw httpError(
      403,
      "운영자만 아카이브 자료를 삭제할 수 있습니다."
    );
  }

  const ids = [
    ...new Set(
      (
        Array.isArray(itemIds)
          ? itemIds
          : [itemIds]
      )
        .map((value) =>
          String(value || "")
        )
        .filter(Boolean)
    ),
  ];

  if (
    !ids.length ||
    ids.length > 100 ||
    ids.some(
      (id) =>
        !mongoose.isValidObjectId(
          id
        )
    )
  ) {
    throw httpError(
      400,
      "삭제할 자료를 1개 이상 100개 이하로 선택해주세요."
    );
  }

  const items =
    await ArchiveItem.find({
      _id: {
        $in: ids,
      },
    }).lean();

  if (
    items.length !== ids.length
  ) {
    throw httpError(
      404,
      "선택한 자료 중 찾을 수 없는 항목이 있습니다."
    );
  }

  const linkedExam =
    await PrivateMockExam.exists({
      $or: [
        {
          archiveItemId: {
            $in: ids,
          },
        },
        {
          answerSheetArchiveItemId:
            {
              $in: ids,
            },
        },
      ],
      status: {
        $in: [
          "scheduled",
          "open",
          "finalizing",
        ],
      },
    });

  if (linkedExam) {
    throw httpError(
      409,
      "선택한 자료에 공개 대기 또는 응시 중인 사설 모의고사 파일이 포함되어 있습니다."
    );
  }

  await Promise.all(
    items.map((item) =>
      fs.promises
        .unlink(
          path.join(
            ARCHIVE_STORAGE_DIR,
            path.basename(
              item.storedName
            )
          )
        )
        .catch((error) => {
          if (
            error.code !==
            "ENOENT"
          ) {
            throw error;
          }
        })
    )
  );
  await ArchiveItem.deleteMany({
    _id: {
      $in: ids,
    },
  });

  return {
    deletedCount:
      items.length,
  };
}

async function moveArchiveItems({
  itemIds,
  destinationFolderId,
  user,
}) {
  if (!isArchiveAdmin(user)) {
    throw httpError(
      403,
      "운영자만 아카이브 자료를 이동할 수 있습니다."
    );
  }

  const ids = [
    ...new Set(
      (
        Array.isArray(itemIds)
          ? itemIds
          : [itemIds]
      )
        .map((value) =>
          String(value || "")
        )
        .filter(Boolean)
    ),
  ];
  const destination =
    String(
      destinationFolderId ||
        ""
    ).trim();

  if (
    !ids.length ||
    ids.length > 100 ||
    ids.some(
      (id) =>
        !mongoose.isValidObjectId(
          id
        )
    )
  ) {
    throw httpError(
      400,
      "이동할 자료를 1개 이상 100개 이하로 선택해주세요."
    );
  }

  let folderId = null;

  if (destination) {
    if (
      !mongoose.isValidObjectId(
        destination
      ) ||
      !await ArchiveFolder.exists({
        _id: destination,
      })
    ) {
      throw httpError(
        404,
        "이동할 대상 폴더를 찾을 수 없습니다."
      );
    }
    folderId = destination;
  }

  const matchedCount =
    await ArchiveItem.countDocuments(
      {
        _id: {
          $in: ids,
        },
      }
    );

  if (
    matchedCount !== ids.length
  ) {
    throw httpError(
      404,
      "선택한 자료 중 찾을 수 없는 항목이 있습니다."
    );
  }

  const result =
    await ArchiveItem.updateMany(
      {
        _id: {
          $in: ids,
        },
      },
      {
        $set: {
          folderId,
        },
      }
    );

  return {
    movedCount:
      Number(
        result.modifiedCount
      ) || 0,
  };
}

module.exports = {
  ARCHIVE_STORAGE_DIR,
  ARCHIVE_CATEGORIES,
  isArchiveAdmin,
  createArchiveFolder,
  deleteArchiveItem,
  deleteArchiveItems,
  moveArchiveItems,
  getArchiveData,
  createArchiveItem,
  createArchiveItems,
  discardArchiveUpload,
  getArchiveDownload,
  looksLikeEncodingMojibake,
  repairUploadFilename,
  serializeArchiveItem,
};

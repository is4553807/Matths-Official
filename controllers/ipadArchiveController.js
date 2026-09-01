const {
  getArchiveData,
  getArchiveDownload,
} = require("../services/archiveService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");

function folderDTO(folder) {
  if (!folder) return null;
  return {
    id: String(folder.id || ""),
    parentFolderId: folder.parentFolderId || null,
    name: String(folder.name || ""),
    description: String(folder.description || ""),
    isPinned: folder.isPinned === true,
    itemCount: Number(folder.itemCount || 0),
    isLocked: folder.isLocked === true,
    requiredAccessLevel: String(folder.requiredAccessLevel || "AUTHENTICATED"),
  };
}

function itemDTO(item) {
  return {
    id: String(item.id || ""),
    folderId: item.folderId || null,
    title: String(item.title || ""),
    description: String(item.description || ""),
    category: String(item.category || "기타"),
    originalName: String(item.originalName || ""),
    mimeType: String(item.mimeType || "application/octet-stream"),
    sizeBytes: Number(item.sizeBytes || 0),
    downloadCount: Number(item.downloadCount || 0),
    createdAt: item.createdAt || null,
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    const archive = await getArchiveData(req.apiUser, {
      folderId: req.query.folderId,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({
      archive: {
        isAdmin: archive.isAdmin === true,
        folders: archive.folders.map(folderDTO),
        selectedFolder: folderDTO(archive.selectedFolder),
        breadcrumbs: archive.breadcrumbs.map((entry) => ({
          id: String(entry.id || ""),
          name: String(entry.name || ""),
        })),
        items: archive.items.map(itemDTO),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.download = async (req, res, next) => {
  try {
    const file = await getArchiveDownload({
      itemId: req.params.itemId,
      user: req.apiUser,
    });

    if (isPdfDownload({ mimeType: file.mimeType, name: file.name })) {
      const issued = await issuePersonalizedPdf({
        userId: req.apiUser._id,
        examId: file.examId,
        sourceType: "ARCHIVE",
        sourceId: file.sourceId,
        originalName: file.name,
        storageRecord: file.sourceRecord,
        localPath: file.path,
      });
      const cleanup = () => issued.cleanup().catch(() => {});
      res.once("finish", cleanup);
      res.once("close", cleanup);
      res.type("application/pdf");
      res.set("Cache-Control", "private, no-store");
      res.set("X-Matths-Trace", issued.traceCode);
      return res.download(issued.filePath, issued.downloadName, (error) => {
        cleanup();
        if (error && !res.headersSent) return next(error);
        return undefined;
      });
    }

    res.set("Cache-Control", "private, no-store");
    if (file.cloudUrl) return res.redirect(302, file.cloudUrl);
    return res.download(file.path, file.name, {
      headers: { "Content-Type": file.mimeType },
    });
  } catch (error) {
    return next(error);
  }
};

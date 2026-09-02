const {
  getFreeProductDownload,
  getPublishedProduct,
  getStoreMedia,
  listPublishedProducts,
} = require("../services/storeService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");

const SCHEMA_VERSION = "STORE_CATALOG_NATIVE_V1";

function noStore(res) {
  res.set("Cache-Control", "private, no-store");
}

exports.list = async (req, res, next) => {
  try {
    const catalog = await listPublishedProducts({
      query: req.query.query,
      sort: req.query.sort,
      category: req.query.category,
    });
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, catalog });
  } catch (error) {
    return next(error);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const result = await getPublishedProduct(req.params.slug);
    noStore(res);
    return res.json({ schemaVersion: SCHEMA_VERSION, ...result });
  } catch (error) {
    return next(error);
  }
};

exports.download = async (req, res, next) => {
  try {
    const download = await getFreeProductDownload({
      slug: req.params.slug,
      assetId: req.params.assetId,
    });
    if (isPdfDownload({ mimeType: download.mimeType, name: download.originalName })) {
      const issued = await issuePersonalizedPdf({
        userId: req.apiUser._id,
        examId: download.examId,
        sourceType: "STORE",
        sourceId: download.sourceId,
        assetId: download.assetId,
        originalName: download.originalName,
        storageRecord: download.sourceRecord,
        localPath: download.filePath,
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
    noStore(res);
    res.type(download.mimeType);
    if (download.signedUrl) return res.redirect(302, download.signedUrl);
    return res.download(download.filePath, download.originalName, (error) => {
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    return next(error);
  }
};

exports.media = async (req, res, next) => {
  try {
    const media = await getStoreMedia({
      productId: req.params.productId,
      assetId: req.params.assetId,
      admin: false,
    });
    res.type(media.mimeType);
    res.set("Cache-Control", "private, max-age=3600");
    if (media.signedUrl) return res.redirect(302, media.signedUrl);
    return res.sendFile(media.filePath);
  } catch (error) {
    return next(error);
  }
};

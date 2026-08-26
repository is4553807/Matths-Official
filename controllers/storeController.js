const {
  createStoreCategory,
  deleteProduct,
  deleteStoreCategory,
  discardUploadedFiles,
  getAdminStoreData,
  getFreeProductDownload,
  getPublishedProduct,
  getStoreMedia,
  listPublishedProducts,
  reorderStoreCategories,
  saveProduct,
  updateStoreCategory,
} = require("../services/storeService");
const {
  archiveStudyHallContent,
  discardStudyHallUploads,
  getStudyHallAsset,
  getStudyHallContent,
  listAdminStudyHall,
  listStudyHall,
  saveStudyHallAnswers,
  saveStudyHallContent,
} = require("../services/studyHallService");
const {
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");
const {
  dashboardTutorialView,
} = require("../services/dashboardTutorialService");

function feedbackFromQuery(query = {}) {
  if (query.created === "1") return { type: "success", message: "새 묶음 상품을 등록했습니다." };
  if (query.updated === "1") return { type: "success", message: "상품 정보를 수정했습니다." };
  if (query.deleted === "1") return { type: "success", message: "상품과 연결된 저장 파일을 삭제했습니다." };
  if (query.categoryCreated === "1") return { type: "success", message: "새 상점 카테고리를 추가했습니다." };
  if (query.categoryUpdated === "1") return { type: "success", message: "카테고리 이름과 공개 상태를 수정했습니다." };
  if (query.categoryDeleted === "1") return { type: "success", message: "카테고리를 삭제했습니다." };
  if (query.categoryReordered === "1") return { type: "success", message: "상점 Navbar의 카테고리 순서를 저장했습니다." };
  return null;
}

async function renderAdminStoreError(req, res, next, error, editId = "") {
  if (![400, 404, 409, 422].includes(Number(error.status))) return next(error);
  try {
    const storeData = await getAdminStoreData({ editId });
    return res.status(error.status).render("admin-store", {
      user: req.session.user, storeData, feedback: null, error: error.message,
    });
  } catch (renderError) { return next(renderError); }
}

exports.storePage = async (req, res, next) => {
  try {
    const storeData = await listStudyHall({
      userId: req.session.user.id,
      tab: req.query.tab,
    });
    return res.render("store", {
      user: req.session.user,
      storeData,
      onboardingTutorial: dashboardTutorialView(
        req.authenticatedUser?.preferences ||
          req.session.user?.preferences ||
          {}
      ),
    });
  } catch (error) { return next(error); }
};

exports.studyHallContentPage = async (req, res, next) => {
  try {
    const content = await getStudyHallContent({
      contentId: req.params.contentId,
      userId: req.session.user.id,
    });
    return res.render("store-study", { user: req.session.user, content });
  } catch (error) { return next(error); }
};

async function updateStudyHallProgress(req, res, next, submit) {
  try {
    const content = await saveStudyHallAnswers({
      contentId: req.params.contentId,
      userId: req.session.user.id,
      input: req.body,
      submit,
    });
    if (String(req.get("accept") || "").includes("application/json")) {
      return res.json({ ok: true, progress: content.progress });
    }
    return res.redirect(`/store/content/${content.id}${submit ? "?submitted=1" : "?saved=1"}`);
  } catch (error) { return next(error); }
}

exports.saveStudyHallProgress = (req, res, next) => updateStudyHallProgress(req, res, next, false);
exports.submitStudyHallProgress = (req, res, next) => updateStudyHallProgress(req, res, next, true);

exports.downloadStudyHallAsset = async (req, res, next) => {
  try {
    const result = await getStudyHallAsset({
      contentId: req.params.contentId,
      assetId: req.params.assetId,
      userId: req.session.user.id,
      admin: req.session.user.role === "admin",
    });
    if (
      result.asset.kind !== "THUMBNAIL" &&
      isPdfDownload({
        mimeType: result.asset.mimeType,
        name: result.asset.originalName,
      })
    ) {
      const issued = await issuePersonalizedPdf({
        userId: req.session.user.id,
        examId: result.examId,
        sourceType: "STUDY_HALL",
        sourceId: result.sourceId,
        assetId: result.assetId,
        originalName: result.asset.originalName,
        storageRecord: result.storageRecord,
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
    return res.redirect(302, result.signedUrl);
  } catch (error) { return next(error); }
};

exports.storeProductPage = async (req, res, next) => {
  try {
    const { product, categories } = await getPublishedProduct(req.params.slug);
    return res.render("store-product", { user: req.session.user, product, categories });
  } catch (error) { return next(error); }
};

exports.adminStorePage = async (req, res, next) => {
  try {
    const storeData = await listAdminStudyHall({ editId: req.query.edit, tab: req.query.tab });
    return res.render("admin-store", {
      user: req.session.user,
      storeData,
      feedback: req.query.saved === "1"
        ? { type: "success", message: "수험관 콘텐츠를 저장했습니다." }
        : req.query.archived === "1"
          ? { type: "success", message: "콘텐츠를 삭제하지 않고 비공개 보관했습니다." }
          : null,
      error: null,
    });
  } catch (error) { return next(error); }
};

async function renderStudyHallAdminError(req, res, next, error, editId = "") {
  if (![400, 404, 409, 422].includes(Number(error.status))) return next(error);
  try {
    const storeData = await listAdminStudyHall({ editId, tab: req.body?.contentType || req.query?.tab });
    return res.status(error.status).render("admin-store", {
      user: req.session.user,
      storeData,
      feedback: null,
      error: error.message,
    });
  } catch (renderError) { return next(renderError); }
}

async function saveHall(req, res, next, contentId = "") {
  try {
    const content = await saveStudyHallContent({
      contentId,
      input: req.body,
      files: req.files || {},
      adminUserId: req.session.user.id,
    });
    return res.redirect(`/admin/store?saved=1&edit=${content.id}&tab=${content.contentType}#content-editor`);
  } catch (error) {
    await discardStudyHallUploads(req.files || {});
    return renderStudyHallAdminError(req, res, next, error, contentId);
  }
}

exports.createStudyHallContent = (req, res, next) => saveHall(req, res, next);
exports.updateStudyHallContent = (req, res, next) => saveHall(req, res, next, req.params.contentId);
exports.archiveStudyHallContent = async (req, res, next) => {
  try {
    await archiveStudyHallContent(req.params.contentId, req.session.user.id);
    return res.redirect("/admin/store?archived=1");
  } catch (error) { return next(error); }
};

async function save(req, res, next, productId = "") {
  try {
    const product = await saveProduct({
      productId,
      input: req.body,
      files: req.files || {},
      adminUserId: req.session.user.id,
    });
    return res.redirect(`/admin/store?${productId ? "updated" : "created"}=1&edit=${product.id}`);
  } catch (error) {
    await discardUploadedFiles(req.files || {});
    return renderAdminStoreError(req, res, next, error, productId);
  }
}

exports.createStoreProduct = (req, res, next) => save(req, res, next);
exports.updateStoreProduct = (req, res, next) => save(req, res, next, req.params.productId);

exports.deleteStoreProduct = async (req, res, next) => {
  try {
    await deleteProduct(req.params.productId);
    return res.redirect("/admin/store?deleted=1");
  } catch (error) { return next(error); }
};

exports.createStoreCategory = async (req, res, next) => {
  try {
    await createStoreCategory({ input: req.body, adminUserId: req.session.user.id });
    return res.redirect("/admin/store?categoryCreated=1#store-categories");
  } catch (error) { return renderAdminStoreError(req, res, next, error); }
};

exports.updateStoreCategory = async (req, res, next) => {
  try {
    await updateStoreCategory({
      categoryId: req.params.categoryId,
      input: req.body,
      adminUserId: req.session.user.id,
    });
    return res.redirect("/admin/store?categoryUpdated=1#store-categories");
  } catch (error) { return renderAdminStoreError(req, res, next, error); }
};

exports.deleteStoreCategory = async (req, res, next) => {
  try {
    await deleteStoreCategory(req.params.categoryId);
    return res.redirect("/admin/store?categoryDeleted=1#store-categories");
  } catch (error) { return renderAdminStoreError(req, res, next, error); }
};

exports.reorderStoreCategories = async (req, res, next) => {
  try {
    await reorderStoreCategories({
      categoryOrderJson: req.body.categoryOrderJson,
      adminUserId: req.session.user.id,
    });
    return res.redirect("/admin/store?categoryReordered=1#store-categories");
  } catch (error) { return renderAdminStoreError(req, res, next, error); }
};

exports.downloadFreeStoreProduct = async (req, res, next) => {
  try {
    const download = await getFreeProductDownload({
      slug: req.params.slug,
      assetId: req.params.assetId,
    });
    if (isPdfDownload({ mimeType: download.mimeType, name: download.originalName })) {
      const issued = await issuePersonalizedPdf({
        userId: req.session.user.id,
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
      return res.download(issued.filePath, issued.downloadName, (error) => {
        cleanup();
        if (error && !res.headersSent) return next(error);
        return undefined;
      });
    }
    res.type(download.mimeType);
    res.set("Cache-Control", "private, no-store");
    if (download.signedUrl) return res.redirect(302, download.signedUrl);
    return res.download(download.filePath, download.originalName, (error) => {
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) { return next(error); }
};

exports.storeMedia = async (req, res, next) => {
  try {
    const media = await getStoreMedia({
      productId: req.params.productId,
      assetId: req.params.assetId,
      admin: req.session?.user?.role === "admin",
    });
    res.type(media.mimeType);
    res.set("Cache-Control", "private, max-age=3600");
    if (media.signedUrl) return res.redirect(302, media.signedUrl);
    return res.sendFile(media.filePath);
  } catch (error) { return next(error); }
};

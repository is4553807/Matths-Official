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
  isPdfDownload,
  issuePersonalizedPdf,
} = require("../services/pdfWatermarkService");

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
    const storeData = await listPublishedProducts({
      query: req.query.q,
      sort: req.query.sort,
      category: req.query.category,
    });
    return res.render("store", { user: req.session.user, storeData });
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
    const storeData = await getAdminStoreData({ editId: req.query.edit });
    return res.render("admin-store", {
      user: req.session.user,
      storeData,
      feedback: feedbackFromQuery(req.query),
      error: null,
    });
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

const { listFAQ } = require("../services/faqService");

const SCHEMA_VERSION = "FAQ_NATIVE_V1";

exports.list = (req, res, next) => {
  try {
    const faq = listFAQ({
      query: req.query.query,
      category: req.query.category,
      code: req.query.code,
    });
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ schemaVersion: SCHEMA_VERSION, faq });
  } catch (error) {
    return next(error);
  }
};

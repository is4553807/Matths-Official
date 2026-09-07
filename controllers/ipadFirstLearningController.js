const { CommunityPost, CommunityComment } = require("../models/matthsModel");
const { ensureCommunityRequestIndex } = require("../services/communityRequestIdentityService");
const { getFirstLearningState, saveFirstLearningState } = require("../services/firstLearningStateService");

function noStore(res) { res.set("Cache-Control", "private, no-store"); }
function sendError(error, res, next) {
  if (!error.status) return next(error);
  noStore(res);
  return res.status(error.status).json({ code: error.code || null, message: error.message,
    ...(error.current ? { current: error.current } : {}) });
}
exports.get = async (req, res, next) => {
  try { noStore(res); return res.json(await getFirstLearningState({ userId: req.apiUser._id })); }
  catch (error) { return sendError(error, res, next); }
};
exports.save = async (req, res, next) => {
  try { noStore(res); return res.json(await saveFirstLearningState({ userId: req.apiUser._id, body: req.body })); }
  catch (error) { return sendError(error, res, next); }
};
exports.capabilities = async (_req, res) => {
  const indexResults = await Promise.allSettled([
    ensureCommunityRequestIndex(CommunityPost), ensureCommunityRequestIndex(CommunityComment),
  ]);
  noStore(res);
  return res.json({ schemaVersion: "MOBILE_CAPABILITIES_V1",
    firstLearningState: true, firstLearningStateVersion: 1,
    communityIdempotency: indexResults.every((result) => result.status === "fulfilled"),
    communityIdempotencyVersion: 1 });
};

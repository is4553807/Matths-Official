const { resetExhaustedArenaPlacements } = require("../services/arenaPlacementPolicyService");

exports.reset = async (req, res, next) => {
  try {
    const result = await resetExhaustedArenaPlacements({
      userId: req.params.userId, adminUserId: req.session?.user?.id,
      requestId: req.body.requestId, reason: req.body.reason,
    });
    res.set("Cache-Control", "no-store");
    if (req.accepts(["html", "json"]) === "html") {
      return res.redirect("/admin/arena-policies?placementReset=1");
    }
    return res.json(result);
  } catch (error) { return next(error); }
};

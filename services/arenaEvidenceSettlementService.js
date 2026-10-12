"use strict";

const { ArenaMatch } = require("../models/goatArenaModel");

function statusError(status, message, code) {
  return Object.assign(new Error(message), { status, statusCode: status, code });
}

function createArenaEvidenceSettlementService(options = {}) {
  const loadMatch = options.loadMatch || (async (matchId) =>
    ArenaMatch.findById(matchId)
      .select("arenaVersion status competitiveAsync normalAsync")
      .lean());
  const commands = {
    settleAsyncCompetitive:
      options.commands?.settleAsyncCompetitive ||
      ((input) =>
        require("./arenaAsyncCompetitiveService")
          .screenAndFinalizeAsyncCompetitiveMatch(input)),
    settleAsyncNormal:
      options.commands?.settleAsyncNormal ||
      ((input) =>
        require("./arenaAsyncNormalService").settleAsyncNormalMatch(input)),
    settleLiveV2:
      options.commands?.settleLiveV2 ||
      ((input) => require("./arenaV2SettlementService").settleArenaV2Match(input)),
  };

  /**
   * Evidence submission is shared by live and historical-record matches, but their
   * readiness rules are not. A historical match has only the current challenger's
   * attempt, so submitArenaMatchEvidence deliberately cannot mark it SUBMITTED by
   * waiting for a second attempt. Dispatch those modes from the match snapshot;
   * preserve the two-attempt SUBMITTED gate for live member matches.
   */
  return async function finalizeArenaMatchAfterEvidence({
    matchId,
    userId,
    evidenceResult,
    now = new Date(),
  }) {
    const match = await loadMatch(matchId);
    if (!match) {
      throw statusError(
        404,
        "정산할 경기를 찾을 수 없습니다.",
        "ARENA_MATCH_NOT_FOUND"
      );
    }
    if (match.competitiveAsync?.enabled) {
      return commands.settleAsyncCompetitive({ matchId, userId, now });
    }
    if (match.normalAsync?.enabled) {
      return commands.settleAsyncNormal({ matchId, userId, now });
    }
    if (
      evidenceResult?.matchStatus !== "SUBMITTED" &&
      match.status !== "SUBMITTED"
    ) return null;
    if (match.arenaVersion !== "2.0") {
      throw statusError(
        409,
        "현재 경기 형식은 정산할 수 없습니다.",
        "ARENA_MATCH_VERSION_UNSUPPORTED"
      );
    }
    return commands.settleLiveV2({ matchId, now });
  };
}

const defaultFinalizer = createArenaEvidenceSettlementService();

module.exports = {
  createArenaEvidenceSettlementService,
  finalizeArenaMatchAfterEvidence: (input) => defaultFinalizer(input),
};

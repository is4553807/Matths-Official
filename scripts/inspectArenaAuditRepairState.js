"use strict";
// Read-only inventory. This never rewrites sealed questions, prior scores or MMR.
require("dotenv").config({ path: "config.env", quiet: true });
const mongoose = require("mongoose");
mongoose.set({ autoCreate: false, autoIndex: false });
const { ArenaProblemPack, ArenaNormalBaselineQuestion, ArenaCompetitiveRecord, ArenaMatch } = require("../models/goatArenaModel");
const { arenaQuestionReleaseIssue } = require("../services/arenaQuestionReleaseService");
const sources = ["2024-09-KICE-CALCULUS-Q29", "2020-06-KICE-NA-Q26", "2019-10-EDUCATION_OFFICE-GA-Q28"];

async function main() {
  const uri = process.env.ARENA_STAGING_DB || process.env.DB;
  if (!uri) throw new Error("검사할 DB 연결 설정이 필요합니다.");
  await mongoose.connect(uri);
  try {
    const packs = await ArenaProblemPack.find({ "questions.sourceTypeId": { $in: sources } }).select("version +questions").lean();
    const affected = packs.map((pack) => ({ packId: String(pack._id), version: pack.version,
      issues: pack.questions.map((question) => ({ questionKey: question.questionKey, issue: arenaQuestionReleaseIssue(question) })).filter((entry) => entry.issue),
    })).filter((pack) => pack.issues.length);
    const ids = affected.map((pack) => new mongoose.Types.ObjectId(pack.packId));
    const baselines = await ArenaNormalBaselineQuestion.find({ "question.sourceTypeId": { $in: sources } }).select("baselineKey batchKey status +question").lean();
    console.log(JSON.stringify({ readOnly: true, affectedPacks: affected,
      affectedBaselineRecords: baselines.filter((row) => arenaQuestionReleaseIssue(row.question))
        .map((row) => ({ id: String(row._id), baselineKey: row.baselineKey, batchKey: row.batchKey, status: row.status, issue: arenaQuestionReleaseIssue(row.question) })),
      referencingMatchCount: await ArenaMatch.countDocuments({ problemPackId: { $in: ids } }),
      referencingRecordCount: await ArenaCompetitiveRecord.countDocuments({ sourceProblemPackId: { $in: ids } }),
      nextAction: "Independently review affected sealed instances and prior grading before any data repair; use the corrected capture templates for new reviewed records.",
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

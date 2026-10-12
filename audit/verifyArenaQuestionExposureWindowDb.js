"use strict";
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { User } = require("../models/matthsModel");
const { ArenaMatch, ArenaProblemPack, ArenaCompetitiveRecord, ArenaNormalBaselineQuestion } = require("../models/goatArenaModel");
const { QUESTION_REPEAT_WINDOW_MATCHES, priorExposedQuestionHashes, markResultQuestionExposure } = require("../services/arenaQuestionExposureService");
const { questionInstanceHash, questionInstanceHashAliases } = require("../services/arenaQuestionIdentityService");
const { _testing: { reserveNormalRecord } } = require("../services/arenaAsyncNormalService");
const { _testing: { reserveHistoricalRecord } } = require("../services/arenaAsyncCompetitiveService");
const { GOAT_ARENA_V2_CONFIG } = require("../services/goatArenaV2Config");
const { chooseAvailableBaselineCombination } = require("../services/arenaNormalBaselineQuestionService");

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  try {
    assert.equal(QUESTION_REPEAT_WINDOW_MATCHES, 10);
    const key = randomUUID(), actor = new mongoose.Types.ObjectId(), owner = new mongoose.Types.ObjectId(), outsider = new mongoose.Types.ObjectId();
    const t = n => new Date(Date.UTC(2026, 9, 12, 1, 0, n));
    const question = k => ({ typeId: "EXPOSURE-SAME-TYPE", sourceTypeId: "SOURCE", typeSkeletonId: "SUM", prompt: `x+${k}=${k+3}`, choices: [], visualization: null });
    const [a,b,c,fresh] = [1,2,3,4].map(question);
    const packA = { _id: new mongoose.Types.ObjectId(), questions: [a] }, packB = { _id: new mongoose.Types.ObjectId(), questions: [b] }, packFresh = { _id: new mongoose.Types.ObjectId(), questions: [fresh] };
    await ArenaProblemPack.collection.insertMany([packA, packB, packFresh]);
    const record = { _id: new mongoose.Types.ObjectId(), ownerUserId: owner, sourceProblemPackId: packB._id, questionInstanceHashes: [] };
    await ArenaCompetitiveRecord.collection.insertOne(record);
    const baseline = { _id: new mongoose.Types.ObjectId(), question: c, questionInstanceHash: questionInstanceHashAliases(c)[1] };
    await ArenaNormalBaselineQuestion.collection.insertOne(baseline);
    const row = (number,userId=actor,mode=number%2 ? "COMPETITIVE" : "NORMAL") => ({
      _id: new mongoose.Types.ObjectId(), matchKey: `EXPOSURE-${key}-${userId}-${number}`,
      arenaVersion: "2.0", gameMode: mode, challenger: { userId }, defender: { userId: owner },
      status: "SETTLED", startedAt: t(number), requestedAt: t(number), createdAt: t(number), updatedAt: t(number),
      [mode === "NORMAL" ? "normalAsync" : "competitiveAsync"]: {
        enabled: true, historicalOwnerUserId: owner,
        questionInstanceHashes: [`own-${number}`], opponentQuestionInstanceHashes: [`opponent-${number}`],
      },
    });
    const first = row(1); first.problemPackId = packA._id;
    first.competitiveAsync.historicalRecordId = record._id;
    first.competitiveAsync.questionInstanceHashes = [questionInstanceHash(a)];
    first.competitiveAsync.opponentQuestionInstanceHashes = [];
    await ArenaMatch.collection.insertOne(first);
    const second = row(2);second.normalAsync.baselineQuestionIds = [baseline._id];
    await ArenaMatch.collection.insertOne(second);
    await ArenaMatch.collection.insertMany(Array.from({length:8},(_,i)=>row(i+3)));
    // Hundreds of requests before starting must not flush a visible question.
    await ArenaMatch.collection.insertMany(Array.from({length:20},(_,i)=>({
      ...row(i+100), status:i%2 ? "READY" : "CANCELLED", startedAt:null,
    })));
    let exposed = await priorExposedQuestionHashes(actor);
    for(const q of [a,b,c])for(const hash of questionInstanceHashAliases(q))assert.ok(exposed.has(hash));
    assert.ok(!exposed.has(questionInstanceHash(fresh)), "new parameters of the same type stay eligible");
    assert.deepEqual([...(await priorExposedQuestionHashes(owner))], [], "being an opponent is not itself exposure");

    // Both record selectors exclude a result-visible opponent even when the
    // legacy record has no cached question hashes. Same type/new numbers works.
    await User.collection.insertMany([actor,owner].map((userId,i)=>({
      _id:userId,email:`exposure-${key}-${i}@example.invalid`,name:`Exposure ${i}`,
      accountStatus:"active",isActive:true,isTestAccount:false,
    })));
    const source = {ownerUserId:owner,ratingSnapshot:{rating:1500},performance:{correctCount:4,totalSolveTimeMs:300000},status:"AVAILABLE",verifiedAt:t(0),usageCount:0,createdAt:t(0),updatedAt:t(0)};
    const candidates=[];
    for(const mode of ["NORMAL","COMPETITIVE"]){
      for(const q of [b,fresh])candidates.push({ ...source,_id:new mongoose.Types.ObjectId(),recordMode:mode,
        consentVersion:mode==="NORMAL"?"ARENA_NORMAL_SOLUTION_SHARE_V1":GOAT_ARENA_V2_CONFIG.asyncCompetitive.solutionSharingConsentVersion,
        sourceMatchId:new mongoose.Types.ObjectId(),sourceAttemptId:new mongoose.Types.ObjectId(),sourceEvidenceId:new mongoose.Types.ObjectId(),
        sourceProblemPackId:q===b?packB._id:packFresh._id,questionInstanceHashes:q===b?[]:[questionInstanceHash(q)],
      });
    }
    await ArenaCompetitiveRecord.collection.insertMany(candidates);
    const user = await User.findById(actor).lean();
    const normal = await reserveNormalRecord({user,rating:1500,now:t(30),excludedQuestionHashes:exposed});
    assert.equal(String(normal.record._id),String(candidates[1]._id));
    const competitive = await reserveHistoricalRecord({user,rating:1500,now:t(30)});
    assert.equal(String(competitive.record._id),String(candidates[3]._id));

    // After ten subsequent started games the first game's questions expire.
    await ArenaMatch.collection.insertOne(row(11));
    exposed = await priorExposedQuestionHashes(actor);
    assert.ok(!exposed.has(questionInstanceHash(b)));
    assert.ok(exposed.has(questionInstanceHash(c)), "the next-oldest baseline remains excluded");
    assert.ok(exposed.has("opponent-10"), "persisted opponent hashes survive source removal");

    // Late result views restart the ten-game interval independently per viewer.
    await assert.rejects(markResultQuestionExposure({match:first,userId:outsider,packs:[packA,packB],now:t(31)}),e=>e.status===403);
    assert.equal((await ArenaMatch.collection.findOne({_id:first._id})).questionExposure,undefined);
    await markResultQuestionExposure({match:first,userId:actor,packs:[packA,packB],now:t(31)});
    await markResultQuestionExposure({match:first,userId:owner,packs:[packA,packB],now:t(31)});
    await markResultQuestionExposure({match:first,userId:owner,packs:[packA,packB],now:t(30)});
    let saved = await ArenaMatch.collection.findOne({_id:first._id});
    assert.equal(saved.updatedAt.getTime(),first.updatedAt.getTime(),"view bookkeeping must not change match settlement timestamps");
    assert.equal(saved.questionExposure.historicalOwnerLastShownAt.getTime(),t(31).getTime());
    assert.equal(saved.questionExposure.resultQuestionHashes.length,4,"repeated views deduplicate hash aliases");
    await ArenaCompetitiveRecord.collection.deleteOne({_id:record._id});
    await ArenaProblemPack.collection.deleteOne({_id:packB._id});
    for(const viewer of [actor,owner])for(const q of [a,b])assert.ok((await priorExposedQuestionHashes(viewer)).has(questionInstanceHash(q)));
    await ArenaMatch.collection.insertMany(Array.from({length:9},(_,i)=>row(i+40,owner)));
    assert.ok((await priorExposedQuestionHashes(owner)).has(questionInstanceHash(b)),"the tenth next game must still exclude it");
    await ArenaMatch.collection.insertOne(row(49,owner));
    assert.ok(!(await priorExposedQuestionHashes(owner)).has(questionInstanceHash(b)),"eligible after ten subsequent games");

    // A single-tier baseline pool needs 55 independent questions to deliver
    // five new questions for a game and each of its ten following games.
    for (const poolSize of [30,55]) {
      const records = Array.from({length:poolSize},(_,i)=>({
        _id:`baseline-${i}`,baselineKey:`BASELINE-${i}`,questionInstanceHash:`baseline-hash-${i}`,
      }));
      const history=[];
      for(let sequence=1;sequence<=12;sequence++) {
        const blocked=history.slice(-10).flatMap(row=>row.questions.map(q=>q.questionInstanceHash));
        const select=()=>chooseAvailableBaselineCombination({records,challengerUserId:"CAPACITY_TEST",sequence,recentQuestionHashes:blocked});
        if(poolSize===30&&sequence===7){assert.throws(select,e=>e.code==="ARENA_BASELINE_COMBINATION_COOLDOWN");break;}
        const selected=select();assert.equal(selected.questions.length,5);
        assert.ok(selected.questions.every(q=>!blocked.includes(q.questionInstanceHash)));history.push(selected);
      }
    }
    console.log("Question exposure DB verified: mixed-mode ten-game boundary, both result viewers, late reopens, queue cancellation resistance, retained snapshots, legacy aliases, both record selectors and fresh parameters.");
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

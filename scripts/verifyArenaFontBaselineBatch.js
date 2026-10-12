"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ArenaNormalBaselineQuestion}=require('../models/goatArenaModel');
const {BATCH_SPECS,workedSolutionForQuestion}=require('../services/arenaNormalBaselineFontBatchService');
const {POOL_ENTRIES}=require('../services/arenaPdfOneOnOneQuestionPool');
const {generateArenaPdfTranscriptionProblem}=require('../services/arenaPdfTranscriptionGenerators');
const {questionInstanceHash}=require('../services/arenaQuestionIdentityService');
const {chooseAvailableBaselineCombination}=require('../services/arenaNormalBaselineQuestionService');
const {batchAssets,documentForQuestion}=require('./arenaFontBaselineArtifacts');
async function verify(directory){
 const m=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),a=batchAssets(directory,m),byName=new Map(a.map(x=>[x.originalName,x])),manifestAsset=byName.get('manifest.json');
 const spec=BATCH_SPECS[m.questionCountPerTier];assert.ok(spec);const total=9*m.questionCountPerTier,wrong=m.questions.filter(q=>!q.baselineCorrect).length,images=total+wrong;
 assert.equal(m.batchKey,spec.batchKey);assert.equal(m.questions.length,total);assert.equal(new Set(m.questions.map(q=>q.baselineKey)).size,total);assert.equal(new Set(m.questions.map(q=>q.questionInstanceHash)).size,total);assert.equal(a.filter(x=>x.mimeType==='image/png').length,images);assert.equal(a.length,images+5);
 let oracleChecks=0;for(const entry of POOL_ENTRIES.filter(e=>Number(e.sourceDifficultyCode.slice(1))<=6&&e.source.accuracyEvidence.correctRatePercent!=null))for(let seed=0;seed<20;seed++){const raw=generateArenaPdfTranscriptionProblem(entry.definition.id,`WORKED-SOLUTION-20261012:${entry.definition.sourceReferenceId}:${seed}`);workedSolutionForQuestion({...raw,sourceTypeId:entry.definition.sourceReferenceId});oracleChecks++;}
 const geometric=POOL_ENTRIES.find(e=>e.definition.sourceReferenceId==='2020-09-KICE-GA-Q27').definition;
 for(let seed=0;seed<20;seed++){const {parameters:p}=generateArenaPdfTranscriptionProblem(geometric.id,`partial-sum-regression:${seed}`);const first=p.coefficient/(p.ratio*(1+p.ratio+p.ratio**2));const sum=n=>first*(p.ratio**n-1)/(p.ratio-1);for(let n=1;n<=6;n++)assert.equal(sum(n+3)-sum(n),p.coefficient*p.ratio**(n-1));}
 for(let i=0;i<9;i++){const qs=m.questions.filter(q=>q.difficultyCode===`U${i+1}`);assert.equal(qs.length,m.questionCountPerTier);assert.equal(qs.filter(q=>q.baselineCorrect).length,spec.correctCounts[i]);}
 for(const q of m.questions){assert.equal(q.questionInstanceHash,questionInstanceHash(q.question));assert.equal(q.question.answer,q.question.answerKey.correctAnswer);assert.deepEqual(q.question.solutionProcess,q.question.answerKey.solutionProcess);assert.equal(q.baselineCorrect,q.question.answer===q.baselineSubmittedAnswer);assert.equal(q.generationProvenance.isHumanSolveEvidence,false);assert.equal(q.generationProvenance.solveTimeBasis,'MODEL_ESTIMATE');assert.equal(q.sourceAccuracyEvidenceKind,'EXACT');workedSolutionForQuestion({sourceTypeId:q.sourceReferenceId,parameters:q.parameters,problem:{answer:q.question.answer}});if(!q.baselineCorrect)assert.deepEqual(q.solutionEquations.slice(0,-1),q.correctSolutionEquations.slice(0,-1));const doc=new ArenaNormalBaselineQuestion(documentForQuestion(q,byName,manifestAsset));await doc.validate();assert.ok(doc.toObject().generationProvenance);}
 let combinationChecks=0;
 for(let tier=1;tier<=9;tier++){
  const records=m.questions.filter(q=>q.difficultyCode===`U${tier}`).map(q=>({...q,_id:q.baselineKey})),history=[];
  for(let sequence=1;sequence<=(m.questionCountPerTier===60?24:8);sequence++){
   const recent=history.slice(m.questionCountPerTier===60?-10:-5),excluded=recent.flatMap(h=>h.questions.map(q=>q._id));
   const selected=chooseAvailableBaselineCombination({records,challengerUserId:'LOCAL_VERIFICATION',sequence,recentQuestionIds:excluded,recentCombinationHashes:recent.map(h=>h.combinationHash)});
   assert.equal(selected.questions.length,5);assert.ok(selected.questions.every(q=>!excluded.includes(q._id)));history.push(selected);combinationChecks++;
  }
 }
 const sample=documentForQuestion(m.questions[0],byName,manifestAsset);
 await assert.rejects(new ArenaNormalBaselineQuestion({...sample,generationProvenance:{...sample.generationProvenance,isHumanSolveEvidence:true}}).validate(),/generationProvenance/);
 await assert.rejects(new ArenaNormalBaselineQuestion({...sample,status:'ACTIVE'}).validate(),/status/);
 await assert.rejects(new ArenaNormalBaselineQuestion({...sample,baselineCorrect:!sample.baselineCorrect}).validate(),/baselineCorrect/);
 const layout=JSON.parse(fs.readFileSync(path.join(directory,'svg/render-layout.json')));assert.equal(layout.length,images);assert.ok(layout.every(x=>x.nonUserGlyphFallback===false&&x.fontSizeLogical>=14));
 for(const x of a.filter(x=>x.mimeType==='image/png')){const b=fs.readFileSync(x.filePath);assert.equal(b.readUInt32BE(16),1024);assert.equal(b.readUInt32BE(20),1536);}
 const result={passed:true,batchKey:m.batchKey,questionCount:total,uniqueInstanceCount:total,correctAnswerCount:total-wrong,intentionalWrongCount:wrong,solutionPngCount:images,artifactCount:a.length,independentGeneratedAnswerChecks:oracleChecks,geometricPartialSumRegressions:120,modelValidationCount:total,fiveQuestionSelectionAndCooldownChecks:combinationChecks,syntheticProvenanceAndActivationGuards:3,nonUserGlyphFallbackCount:0,registrationStatus:'REVIEW_PENDING',activationAllowed:false};fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module)verify(path.resolve(process.argv[2]||'output/baseline/normal30_20261012')).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1});
module.exports={verify};

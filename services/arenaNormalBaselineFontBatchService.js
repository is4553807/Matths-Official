"use strict";
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {NORMAL_BASELINE_TIERS,NORMAL_BASELINE_QUESTION_SCHEMA_VERSION}=require('./arenaNormalBaselineQuestionService');
const {generateArenaPdfOneOnOneQuestions}=require('./arenaPdfOneOnOneQuestionPool');
const {buildGeneratedArenaProblemPackDraft}=require('./arenaProblemPackService');
const {publicSourceAccuracyForQuestion}=require('./arenaMatchAttemptService');
const {SCORING_VERSION}=require('./arenaCompetitiveScoringService');
const {questionInstanceHash}=require('./arenaQuestionIdentityService');
const {arenaQuestionReleaseIssue}=require('./arenaQuestionReleaseService');
const recipes={...require('./arenaWorkedSolutionBasic').recipes,...require('./arenaWorkedSolutionAdvanced').recipes};
const BATCH_KEY='NORMAL-BASELINE-20261012-30-V2';
const CORRECT_COUNTS=[26,26,21,17,17,13,13,13,13];
const BATCH_SPECS={30:{batchKey:BATCH_KEY,correctCounts:CORRECT_COUNTS},60:{batchKey:'NORMAL-BASELINE-20261012-60-V3',correctCounts:[51,51,43,34,34,26,26,26,26]}};
const hash=s=>createHash('sha256').update(s).digest('hex');
function workedSolutionForQuestion(raw){const id=raw.sourceTypeId||raw.sourceReferenceId;assert.ok(recipes[id],`Missing worked solution: ${id}`);const worked=recipes[id](raw.parameters);assert.equal(worked.answer,String(raw.problem.answer),`Independent answer mismatch: ${id}`);assert.ok(worked.correctEquations.length>=2);return worked;}
function buildFontBaselineBatch({fontManifest,questionCountPerTier=30,generatedAt='2026-10-12T00:00:00+09:00'}={}){
 const spec=BATCH_SPECS[questionCountPerTier];assert.ok(spec,'Supported batches: 30 or 60 per tier');
 const batchKey=spec.batchKey,correctCounts=spec.correctCounts,total=9*questionCountPerTier;
 assert.equal(fontManifest.generationMethod,'USER_HANDWRITING_FONT');
 const all=[],globalHashes=new Set();
 for(const [tierIndex,tier] of NORMAL_BASELINE_TIERS.entries()){
  const candidates=new Map();
  for(let seedIndex=0;seedIndex<(questionCountPerTier===60?500:150);seedIndex++){
   const seed=`${batchKey}:${tier.difficultyCode}:${seedIndex}`;
   const raw=generateArenaPdfOneOnOneQuestions({difficultyCode:tier.difficultyCode,matchKey:seed});
   const pack=buildGeneratedArenaProblemPackDraft({generation:{pairKey:`BASELINE_${tier.difficultyCode}`,pairLabel:`${tier.label} 일반전 기준 문항`,questions:raw,difficultyTier:tier.difficultyTier,difficultyCode:tier.difficultyCode,designCompliance:'ACTIVE',designPolicyVersion:raw[0].design.policyVersion,contentSourceVersion:'ARENA-PDF-POOL-V1'},matchKey:seed,generatedAt:new Date(generatedAt),scoringVersion:SCORING_VERSION,pairOverride:{key:`BASELINE_${tier.difficultyCode}`,label:`${tier.label} 일반전 기준 문항`}});
   for(const [i,q] of pack.questions.entries()){
    const source=publicSourceAccuracyForQuestion(q),qh=questionInstanceHash(q);
    if(source?.evidenceKind!=='EXACT'||!(Number(source.min)>0&&Number(source.min)<1)||globalHashes.has(qh)||arenaQuestionReleaseIssue(q))continue;
    const worked=workedSolutionForQuestion(raw[i]);
    if(!candidates.has(qh))candidates.set(qh,{question:q,raw:raw[i],source,worked,hash:qh});
   }
  }
  const pool=[...candidates.values()],uses=new Map();
  for(let index=0;index<questionCountPerTier;index++){
   pool.sort((a,b)=>(uses.get(a.question.typeId)||0)-(uses.get(b.question.typeId)||0)||hash(`${tier.difficultyCode}:${index}:${a.hash}`).localeCompare(hash(`${tier.difficultyCode}:${index}:${b.hash}`)));
   const selected=pool.shift();assert.ok(selected,`Insufficient unique instances: ${tier.difficultyCode}`);
   const {question:q,raw,source,worked}=selected;globalHashes.add(selected.hash);uses.set(q.typeId,(uses.get(q.typeId)||0)+1);
   const correct=Math.floor((index+1)*correctCounts[tierIndex]/questionCountPerTier)>Math.floor(index*correctCounts[tierIndex]/questionCountPerTier);
   const key=`${batchKey}-${tier.difficultyCode}-Q${String(index+1).padStart(2,'0')}`;
   const submitted=correct?worked.answer:String(Number(worked.answer)===999?998:Number(worked.answer)+1);
   const equations=correct?[...worked.correctEquations]:[...worked.correctEquations.slice(0,-1),`${worked.symbol}=${worked.finalExpression}=${submitted}`];
   const solutionProcess=worked.correctEquations.map((expression,j)=>({step:j+1,title:`${j+1}단계`,expression:`\\(${expression}\\)`,explanation:''}));
   const stored={...q,questionKey:key,solution:solutionProcess.map(s=>s.expression).join('\n'),solutionProcess,finalCheck:`독립적으로 유도한 정답: ${worked.answer}`};
   stored.answerKey=require('./arenaGeneratedAnswerKey').buildArenaGeneratedAnswerKey({typeId:q.typeId,problem:stored,parameters:raw.parameters,validation:raw.validation});
   assert.equal(questionInstanceHash(stored),selected.hash);
   const jitter=.9+(parseInt(hash(key).slice(0,8),16)%21)/100;
   const time=Math.min(570000,Math.max(45000,Math.round(Math.max(45000,q.expectedTimeMs||120000)*jitter*(correct?1:1.35)/1000)*1000));
   all.push({schemaVersion:NORMAL_BASELINE_QUESTION_SCHEMA_VERSION,batchKey,baselineKey:key,mode:'NORMAL',tier:tier.tier,tierLabel:tier.label,difficultyCode:tier.difficultyCode,targetMmr:tier.targetMmr,question:stored,questionInstanceHash:selected.hash,sourceReferenceId:q.sourceTypeId,sourceAccuracyRate:Number(source.min),sourceAccuracyEvidenceKind:'EXACT',sourceAccuracyEvidence:{...raw.sourceAccuracyEvidence,publicLabel:source.label,rangeLabel:source.rangeLabel},baselineSubmittedAnswer:submitted,baselineCorrect:correct,baselineSolveTimeMs:time,expectedSolutionFileName:`${key}.png`,status:'REVIEW_PENDING',calibrationStatus:'UNVALIDATED_HYPOTHESIS',generationProvenance:{schemaVersion:'MATTHS_SYNTHETIC_BASELINE_V1',generationMethod:'USER_HANDWRITING_FONT',isHumanSolveEvidence:false,solveTimeBasis:'MODEL_ESTIMATE',sourcePdfSha256:fontManifest.sourcePdfSha256,fontSha256:fontManifest.fonts.map(f=>f.sha256),workedSolutionVersion:'MATTHS_WORKED_SOLUTION_20261012_V1',intentionalError:correct?null:{kind:'FINAL_EVALUATION_OR_TRANSCRIPTION_SLIP',step:equations.length,correctAnswer:worked.answer,submittedAnswer:submitted},correctEquations:worked.correctEquations,opponentEquations:equations},solutionEquations:equations,correctSolutionEquations:worked.correctEquations,correctSolutionFileName:correct?`${key}.png`:`${key}.correct.png`,parameters:raw.parameters});
  }
 }
 assert.equal(all.length,total);assert.equal(globalHashes.size,total);
 return {schemaVersion:'MATTHS_FONT_BASELINE_BATCH_V2',batchKey,generatedAt:new Date(generatedAt).toISOString(),questionCount:total,questionCountPerTier,questionsPerMatch:5,combinationCountPerTier:questionCountPerTier*(questionCountPerTier-1)*(questionCountPerTier-2)*(questionCountPerTier-3)*(questionCountPerTier-4)/120,status:'REVIEW_PENDING',activationAllowed:false,calibrationStatus:'UNVALIDATED_HYPOTHESIS',generationMethod:'USER_HANDWRITING_FONT',isHumanSolveEvidence:false,solveTimeBasis:'MODEL_ESTIMATE',correctCount:all.filter(q=>q.baselineCorrect).length,intentionalWrongCount:all.filter(q=>!q.baselineCorrect).length,tiers:NORMAL_BASELINE_TIERS.map((t,i)=>({tier:t.tier,difficultyCode:t.difficultyCode,questionCount:questionCountPerTier,correctCount:correctCounts[i],distinctTypeCount:new Set(all.filter(q=>q.tier===t.tier).map(q=>q.question.typeId)).size})),questions:all};
}
module.exports={BATCH_KEY,CORRECT_COUNTS,BATCH_SPECS,buildFontBaselineBatch,workedSolutionForQuestion};

"use strict";
// New review-pending records only. Safe to resume; existing definitions are
// compared and never updated. No rating, attempt, activation or index writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const mongoose=require('mongoose');
const {HeadObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
const {ArenaNormalBaselineQuestion}=require('../models/goatArenaModel');
const {getR2Client,uploadLocalFileToR2}=require('../services/r2ObjectStorageService');
const {verify}=require('./verifyArenaFontBaselineBatch');
const {sha,batchAssets,documentForQuestion}=require('./arenaFontBaselineArtifacts');
function atomicJson(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
function equalExisting(existing,expected){for(const field of ['baselineKey','batchKey','questionInstanceHash','baselineSubmittedAnswer','baselineCorrect','baselineSolveTimeMs','status','calibrationStatus'])assert.equal(existing[field],expected[field],`Existing ${field} conflict`);assert.equal(existing.question.answer,expected.question.answer);assert.deepEqual(existing.question.solutionProcess,expected.question.solutionProcess);assert.equal(existing.solutionEvidenceFile.sha256,expected.solutionEvidenceFile.sha256);assert.equal(existing.correctSolutionFile.sha256,expected.correctSolutionFile.sha256);assert.equal(existing.generationProvenance.manifestSha256,expected.generationProvenance.manifestSha256);assert.equal(existing.generationProvenance.isHumanSolveEvidence,false);}
async function head(asset){try{const response=await getR2Client().send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:asset.objectKey}));assert.equal(response.Metadata?.sha256,asset.sha256,'R2 checksum conflict');assert.equal(response.ContentLength,asset.sizeBytes,'R2 length conflict');assert.equal(response.ContentType,asset.mimeType,'R2 content type conflict');return response;}catch(e){if(e.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey'].includes(e.name))return null;throw e;}}
async function main(){
 const args=process.argv.slice(2),apply=args.includes('--apply'),verifyOnly=args.includes('--verify-only');
 const directory=path.resolve(args.find(a=>a.startsWith('--directory='))?.split('=').slice(1).join('=')||'output/baseline/normal30_20261012');
 if(apply||verifyOnly)assert.ok(args.includes('--target=production'),'Explicit production target required');
 await verify(directory);const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),assets=batchAssets(directory,manifest),byName=new Map(assets.map(a=>[a.originalName,a])),manifestAsset=byName.get('manifest.json');
 if(!apply&&!verifyOnly){console.log(JSON.stringify({dryRun:true,questionCount:manifest.questionCount,artifactCount:assets.length,solutionPngCount:assets.filter(a=>a.mimeType==='image/png').length,target:'production',status:'REVIEW_PENDING',isHumanSolveEvidence:false,activationAllowed:false}));return;}
 require('dotenv').config({path:path.resolve('config.env'),quiet:true});assert.ok(process.env.DB,'Production DB is not configured');
 const checkpointFile=path.join(directory,'upload-checkpoint.json');let checkpoint=fs.existsSync(checkpointFile)?JSON.parse(fs.readFileSync(checkpointFile)):{batchKey:manifest.batchKey,manifestSha256:manifestAsset.sha256,target:'production',assets:{},records:{}};assert.equal(checkpoint.manifestSha256,manifestAsset.sha256);assert.equal(checkpoint.batchKey,manifest.batchKey);
 await mongoose.connect(process.env.DB,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:15000});
 try{
  const existing=await ArenaNormalBaselineQuestion.collection.find({batchKey:manifest.batchKey}).toArray();
  for(const doc of existing){const q=manifest.questions.find(q=>q.baselineKey===doc.baselineKey);assert.ok(q,'Unexpected record in batch');equalExisting(doc,documentForQuestion(q,byName,manifestAsset));}
  console.log(JSON.stringify({stage:'preflight',target:'production',existingBatchRecords:existing.length,artifactCount:assets.length}));
  if(!verifyOnly){
   for(let i=0;i<assets.length;i++){
    const asset=assets[i];let remote=await head(asset);
    if(!remote){await uploadLocalFileToR2({filePath:asset.filePath,objectKey:asset.objectKey,contentType:asset.mimeType,metadata:{'batch-key':manifest.batchKey,'generation-method':'USER_HANDWRITING_FONT','is-human-solve-evidence':'false','solve-time-basis':'MODEL_ESTIMATE'}});remote=await head(asset);assert.ok(remote,'Uploaded R2 object missing');}
    checkpoint.assets[asset.relative]={objectKey:asset.objectKey,sha256:asset.sha256,sizeBytes:asset.sizeBytes,etag:String(remote.ETag||'').replace(/^"|"$/g,''),verifiedAt:new Date().toISOString()};atomicJson(checkpointFile,checkpoint);
    if((i+1)%15===0||i===assets.length-1)console.log(JSON.stringify({stage:'storage',verified:i+1,total:assets.length}));
   }
   for(const [i,q] of manifest.questions.entries()){
    const document=new ArenaNormalBaselineQuestion(documentForQuestion(q,byName,manifestAsset));
    document.solutionEvidenceFile.r2ETag=checkpoint.assets['images/'+q.expectedSolutionFileName].etag;
    document.correctSolutionFile.r2ETag=checkpoint.assets['images/'+q.correctSolutionFileName].etag;
    await document.validate();const obj=document.toObject();
    const current=await ArenaNormalBaselineQuestion.collection.findOne({baselineKey:q.baselineKey});
    if(current)equalExisting(current,obj);else await ArenaNormalBaselineQuestion.collection.insertOne(obj);
    checkpoint.records[q.baselineKey]={id:String(obj._id),status:'REVIEW_PENDING',verifiedAt:new Date().toISOString()};atomicJson(checkpointFile,checkpoint);
    if((i+1)%30===0)console.log(JSON.stringify({stage:'database',registered:i+1,total:manifest.questionCount}));
   }
  }
  // Recheck every remote header independently of the local checkpoint.
  for(let offset=0;offset<assets.length;offset+=8)await Promise.all(assets.slice(offset,offset+8).map(async a=>assert.ok(await head(a),'Remote object missing')));
  let sampleDownloads=0;
  for(let tier=1;tier<=9;tier++){
   const q=manifest.questions.find(q=>q.difficultyCode===`U${tier}`),a=byName.get(q.expectedSolutionFileName);
   const result=await getR2Client().send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:a.objectKey}));assert.ok(result.Body);const bytes=Buffer.from(await result.Body.transformToByteArray());assert.equal(sha(bytes),a.sha256);sampleDownloads++;
  }
  const records=await ArenaNormalBaselineQuestion.collection.find({batchKey:manifest.batchKey}).toArray();assert.equal(records.length,manifest.questionCount);for(const q of manifest.questions){const doc=records.find(r=>r.baselineKey===q.baselineKey);assert.ok(doc);equalExisting(doc,documentForQuestion(q,byName,manifestAsset));await new ArenaNormalBaselineQuestion(doc).validate();}
  assert.equal(records.filter(q=>q.status==='ACTIVE').length,0);
  const receipt={completed:true,batchKey:manifest.batchKey,target:'production',completedAt:new Date().toISOString(),manifestSha256:manifestAsset.sha256,recordCount:records.length,reviewPendingCount:records.filter(q=>q.status==='REVIEW_PENDING').length,activeCount:0,correctCount:records.filter(q=>q.baselineCorrect).length,intentionalWrongCount:records.filter(q=>!q.baselineCorrect).length,solutionPngCount:assets.filter(a=>a.mimeType==='image/png').length,r2ArtifactCount:assets.length,r2HeaderVerificationCount:assets.length,r2DownloadedHashVerificationCount:sampleDownloads,humanAttemptCount:0,solveTimeBasis:'MODEL_ESTIMATE',tiers:manifest.tiers};atomicJson(path.join(directory,'upload-receipt.json'),receipt);console.log(JSON.stringify(receipt,null,2));
 }finally{await mongoose.disconnect();}
}
main().catch(e=>{console.error(JSON.stringify({failed:true,errorName:e.name,errorCode:e.code||null,httpStatus:e.$metadata?.httpStatusCode||null,assertion:e.name==='AssertionError'?e.message:undefined}));process.exitCode=1;});

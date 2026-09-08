"use strict";
const fs=require("node:fs"), vm=require("node:vm"), assert=require("node:assert/strict");
const source=fs.readFileSync(require.resolve("../controllers/ipadAcademyController"),"utf8");
const a=source.indexOf("function serializeMathMapConcept("), b=source.indexOf("function serializeNullableNumber(",a);
assert(a>=0 && b>a);
const context={};
vm.runInNewContext(source.slice(a,b)+"; this.serialize = serializeStudentMathMap;",context);
const concepts=Array.from({length:220},(_,i)=>({
  id:"c"+i,title:"개념 "+i,status:i<100?"WEAK":"UNKNOWN",mastery:i<100?20:null,
  prerequisites:["p"],unlocks:["q","r"],
  evidence:{attemptCount:6,correctCount:2,lowDifficulty:{total:4,correct:2},
    highDifficulty:{total:2,correct:0},problemTypeCount:3,averageResponseTimeMs:42000}
}));
const result=JSON.parse(JSON.stringify(context.serialize({
  concepts,bottlenecks:Array.from({length:8},(_,i)=>({conceptId:"b"+i})),
  recommendation:{conceptTitle:"개념 0",reasons:["원본 근거"],
    problemMix:{total:5,diagnostic:true,difficulties:[{level:1,count:5}],retryCount:0}}
})));
assert.equal(result.concepts.length,220);
assert.equal(result.concepts.filter(x=>x.status==="UNKNOWN").length,120);
assert.equal(result.bottlenecks.length,8);
assert.deepEqual(result.concepts[0].evidence.lowDifficulty,{total:4,correct:2});
assert.equal(result.concepts[0].evidence.problemTypeCount,3);
assert.equal(result.concepts[0].prerequisiteCount,1);
assert.equal(result.concepts[0].unlockCount,2);
assert.deepEqual(result.recommendation.reasons,["원본 근거"]);
assert.deepEqual(result.recommendation.difficulties,[{level:1,count:5}]);
console.log("PASS actual student math map serialization: 220 concepts, UNKNOWN, all bottlenecks, evidence, prerequisites and recommendation preserved");

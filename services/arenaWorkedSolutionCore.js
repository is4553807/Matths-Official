"use strict";
const assert=require('node:assert/strict');
const core=require('./arenaPdfPilotGenerators/core');
const F=String.raw;
function num(value){if(typeof value==='string'&&value.includes('/')){const [a,b]=value.split('/').map(Number);return a/b;}return Number(value);}
function fraction(value){
 if(value&&typeof value==='object'&&'n'in value)return value;
 const s=String(value);if(s.includes('/')){const [a,b]=s.split('/');return core.rational(BigInt(a),BigInt(b));}
 if(s.includes('.')){const [a,b]=s.split('.');return core.rational(BigInt(a+b),10n**BigInt(b.length));}
 return core.rational(BigInt(value));
}
function tex(value){const r=fraction(value);return r.d===1n?String(r.n):F`\frac{${r.n}}{${r.d}}`;}
function frac(a,b){return F`\frac{${a}}{${b}}`;}
const S1=n=>n*(n+1)/2,S2=n=>n*(n+1)*(2*n+1)/6;
function finish(symbol,expression,value,equations,extra={}){
 const n=num(value);assert.ok(Number.isFinite(n)&&Math.abs(n-Math.round(n))<1e-7,'Worked solution must produce an exact integer');
 const answer=String(Math.round(n));return{answer,symbol,finalExpression:expression,correctEquations:[...equations,F`${symbol}=${expression}=${answer}`],...extra};
}
function rationalSumFinish(symbol,value,equations){const r=fraction(value);assert.ok(r.n>0n&&r.d>0n);return finish(symbol,F`${r.n}+${r.d}`,Number(r.n+r.d),equations);}
module.exports={F,num,fraction,tex,frac,S1,S2,finish,rationalSumFinish,...core};

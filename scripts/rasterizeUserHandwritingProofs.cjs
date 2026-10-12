"use strict";
const fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const noteGrid=require('../public/js/matths-note-grid');
async function main(){
 const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:true});
 const files=fs.readdirSync(input).filter(n=>n.endsWith('.white.svg')).sort(),results=[];
 for(let i=0;i<files.length;i++){
  const svg=fs.readFileSync(path.join(input,files[i]));const image=await loadImage(svg);
  const key=files[i].replace('.white.svg',''),white=createCanvas(1024,1536);white.getContext('2d').drawImage(image,0,0);
  const whitePath=path.join(output,key+'.white.png');fs.writeFileSync(whitePath,white.toBuffer('image/png'));
  const result=createCanvas(1024,1536),ctx=result.getContext('2d');noteGrid.draw(ctx,{logicalWidth:512,logicalHeight:768,scale:2});
  ctx.globalCompositeOperation='multiply';ctx.drawImage(white,0,0);ctx.globalCompositeOperation='source-over';
  const pngPath=path.join(output,key+'.png');fs.writeFileSync(pngPath,result.toBuffer('image/png'));
  results.push({key,fileName:path.basename(pngPath),whiteFileName:path.basename(whitePath),width:1024,height:1536,noteGridSpec:noteGrid.spec});
  if((i+1)%30===0||i===files.length-1)console.log(`Handwriting + code grid rasterized: ${i+1}/${files.length}`);
 }
 fs.writeFileSync(path.join(output,'rasterization.json'),JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});

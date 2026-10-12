"use strict";
const fs=require('node:fs');
const {Path2D,PathOp}=require('@napi-rs/canvas');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
function outline(paths,character){
  let result=new Path2D();
  for(const shape of paths){
    const d=shape.commands.map(([name,...values])=>name+values.map(x=>Number(x.toFixed(5))).join(' ')).join(' ');
    const raw=new Path2D(d);
    const filled=shape.paint==='stroke'?raw.stroke({width:shape.width,cap:shape.cap,join:shape.join}):raw;
    result=result.op(filled,PathOp.Union);
  }
  if(character==='√'){
    const [left,bottom,right,top]=result.computeTightBounds();
    const clip=new Path2D();clip.rect(left-2,bottom-2,(right-left)*.36+2,top-bottom+4);
    result=result.op(clip,PathOp.Intersect);
  }
  result=result.asWinding();
  return{svgPath:result.toSVGString(),bounds:result.computeTightBounds()};
}
const glyphs={};
for(const [character,variants]of Object.entries(input.glyphs))glyphs[character]=variants.map(paths=>outline(paths,character));
fs.writeFileSync(process.argv[3],JSON.stringify({...input,glyphs}));
console.log(JSON.stringify({glyphCount:Object.keys(glyphs).length,outlined:true}));

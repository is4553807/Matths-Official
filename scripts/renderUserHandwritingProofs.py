#!/usr/bin/env python3
"""Typeset exact math with private user-handwriting fonts on pure white paper."""
import argparse
import hashlib
import html
import json
import logging
import re
from pathlib import Path
import matplotlib
from matplotlib.font_manager import FontProperties,fontManager
from matplotlib.mathtext import MathTextParser
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

def clean_math(expression):
    expression=expression.replace('\\dfrac','\\frac').replace('\\tfrac','\\frac')
    def argument(s,pos):
        while pos<len(s) and s[pos].isspace():pos+=1
        if s[pos]=='{':
            depth=1;end=pos+1
            while depth:
                if s[end]=='{':depth+=1
                if s[end]=='}':depth-=1
                end+=1
            return s[pos+1:end-1],end
        if s[pos]=='\\':
            match=re.match(r'\\[A-Za-z]+',s[pos:])
            if match:return match[0],pos+len(match[0])
        return s[pos],pos+1
    def normalize(s):
        result='';i=0
        while i<len(s):
            command=next((c for c in ['\\frac','\\binom','\\sqrt'] if s.startswith(c,i)),None)
            if command:
                args=[];pos=i+len(command)
                for _ in range(1 if command=='\\sqrt' else 2):
                    arg,pos=argument(s,pos);args.append('{'+normalize(arg)+'}')
                result+=command+''.join(args);i=pos
            else:result+=s[i];i+=1
        return result
    expression=normalize(expression).replace('\\iff',r'\Leftrightarrow')
    expression=expression.replace('\\cdots',r'\cdot\cdot\cdot').replace('\\ldots','...').replace('\\setminus','-').replace('\\mid','|')
    expression=re.sub(r'\\ge(?![A-Za-z])',r'\\geq',expression)
    expression=re.sub(r'\\le(?![A-Za-z])',r'\\leq',expression)
    return expression.replace('\\displaystyle','').replace('\\mathbb','\\mathrm').replace('\\operatorname','\\mathrm').replace('\\pmod',r'\ \mathrm{mod}\ ')

def setup_font(path,family):
    fontManager.addfont(str(path))
    settings={'mathtext.fontset':'custom','mathtext.fallback':None}
    for name in ['rm','it','bf','bfit','sf','tt','cal']:settings['mathtext.'+name]=family
    matplotlib.rcParams.update(settings)

def font_path(font,codepoint,cache):
    key=(font.fname,codepoint)
    if key in cache:return cache[key]
    if not Path(font.fname).name.startswith('matths-user-math-'):
        raise ValueError('Non-user math font fallback: '+font.fname)
    tt=cache.setdefault(('tt',font.fname),TTFont(font.fname))
    cmap=tt.getBestCmap()
    if codepoint not in cmap:raise ValueError(f'Missing user glyph U+{codepoint:04X}')
    glyphs=tt.getGlyphSet();pen=SVGPathPen(glyphs);glyphs[cmap[codepoint]].draw(pen)
    result=(pen.getCommands(),tt['head'].unitsPerEm)
    cache[key]=result;return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--font-dir',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True);args=p.parse_args()
    source=json.loads(args.manifest.read_text());records=source['questions'];args.output_dir.mkdir(parents=True,exist_ok=True)
    parser=MathTextParser('path');cache={};reports=[]
    for index,record in enumerate(records):
        key=record['baselineKey'];equations=record['solutionEquations'];assert equations
        variant=int(hashlib.sha256(key.encode()).hexdigest()[:8],16)%3+1
        font=args.font_dir/f'matths-user-math-{variant}.ttf';family=f'Matths User Math {variant}';setup_font(font,family)
        sizes=[28,26,24,22,20,18,16,14]
        for size in sizes:
            prop=FontProperties(fname=str(font),size=size)
            layout=[parser.parse('$'+clean_math(line)+'$',dpi=72,prop=prop) for line in equations]
            if max(float(r.width) for r in layout)<=432 and sum(float(r.height)+14 for r in layout)<=642:break
        else:raise ValueError(f'Equation layout does not fit: {key}')
        elements=['<rect width="512" height="768" fill="white"/>',
                  f'<text x="32" y="23" fill="#777" font-size="7" font-family="Arial">GENERATED REFERENCE / {html.escape(key)}</text>']
        top=62
        for line_no,result in enumerate(layout):
            baseline=top+float(result.height)-float(result.depth)
            elements.append(f'<g transform="translate(40 {baseline:.4f}) scale(1 -1)">')
            for ft,size_value,codepoint,x,y in result.glyphs:
                path,upem=font_path(ft,int(codepoint),cache)
                elements.append(f'<path d="{path}" fill="black" fill-rule="evenodd" transform="translate({float(x):.5f} {float(y):.5f}) scale({float(size_value)/upem:.7f})"/>')
            for x,y,width,height in result.rects:
                rule_height=min(float(height),0.65)
                y=float(y)+(float(height)-rule_height)/2
                height=rule_height
                elements.append(f'<rect x="{float(x):.5f}" y="{float(y):.5f}" width="{float(width):.5f}" height="{float(height):.5f}" fill="black"/>')
            elements.append('</g>');top+=float(result.height)+14
        # A loose answer oval, outside the mathematical text, uses the same thin
        # pen weight and does not change the equation content.
        last=layout[-1];last_top=top-float(last.height)-14
        elements.append(f'<ellipse cx="{40+float(last.width)/2:.4f}" cy="{last_top+float(last.height)/2:.4f}" rx="{float(last.width)/2+8:.4f}" ry="{float(last.height)/2+7:.4f}" fill="none" stroke="black" stroke-width="0.65"/>')
        svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 512 768">'+''.join(elements)+'</svg>'
        target=args.output_dir/f'{key}.white.svg';target.write_text(svg)
        reports.append({'baselineKey':key,'fontVariant':variant,'fontSizeLogical':size,'lineCount':len(equations),
                        'svgFile':target.name,'sourceFontSha256':hashlib.sha256(font.read_bytes()).hexdigest(),'nonUserGlyphFallback':False})
        if (index+1)%30==0 or index==len(records)-1:print(f'Exact handwriting math laid out: {index+1}/{len(records)}',flush=True)
    report_file=args.output_dir/'render-layout.json'
    previous=json.loads(report_file.read_text()) if report_file.exists() else []
    combined={r['baselineKey']:r for r in previous}
    combined.update({r['baselineKey']:r for r in reports})
    report_file.write_text(json.dumps(list(combined.values()),ensure_ascii=False,indent=2))

if __name__=='__main__':main()

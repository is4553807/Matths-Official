#!/usr/bin/env python3
"""Extract the user's pen paths from the completed sample PDF, excluding text."""
import argparse
import copy
import hashlib
import json
import logging
import math
from pathlib import Path
from pypdf import PdfReader
from pypdf.generic import ContentStream

logging.getLogger('pypdf').setLevel(logging.ERROR)

def matrix_product(a,b):
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]

def page_paths(page, reader):
    state={'matrix':[1,0,0,1,0,0],'stroke':[0,0,0],'fill':[0,0,0],'width':1,'cap':0,'join':0}
    stack=[];commands=[];points=[];paths=[];current=None;start=None
    def transform(x,y):
        a,b,c,d,e,f=state['matrix'];return [a*x+c*y+e,b*x+d*y+f]
    def finish(paint):
        nonlocal commands,points
        color=state['stroke'] if paint=='stroke' else state['fill']
        if commands and points and max(color)<0.04:
            xs=[v[0] for v in points];ys=[v[1] for v in points]
            factor=math.sqrt(abs(state['matrix'][0]*state['matrix'][3]-state['matrix'][1]*state['matrix'][2]))
            paths.append({'commands':commands,'bounds':[min(xs),min(ys),max(xs),max(ys)],
                          'paint':paint,'width':state['width']*factor,'cap':state['cap'],'join':state['join']})
        commands=[];points=[]
    for operands,operator in ContentStream(page.get_contents(),reader).operations:
        op=operator.decode();a=operands
        if op=='q':stack.append(copy.deepcopy(state))
        elif op=='Q':state=stack.pop()
        elif op=='cm':state['matrix']=matrix_product(state['matrix'],list(map(float,a)))
        elif op in ['SC','SCN','RG','G']:
            values=list(map(float,a));state['stroke']=values if len(values)>1 else values*3
        elif op in ['sc','scn','rg','g']:
            values=list(map(float,a));state['fill']=values if len(values)>1 else values*3
        elif op=='w':state['width']=float(a[0])
        elif op=='J':state['cap']=int(a[0])
        elif op=='j':state['join']=int(a[0])
        elif op in ['m','l']:
            point=transform(*map(float,a));commands.append([op.upper(),*point]);points.append(point);current=point
            if op=='m':start=point
        elif op=='c':
            values=list(map(float,a));control=[transform(*values[i:i+2]) for i in range(0,6,2)]
            commands.append(['C',*[v for p in control for v in p]]);points.extend(control);current=control[-1]
        elif op=='v':
            values=list(map(float,a));control=[current,transform(*values[:2]),transform(*values[2:])]
            commands.append(['C',*[v for p in control for v in p]]);points.extend(control);current=control[-1]
        elif op=='y':
            values=list(map(float,a));end=transform(*values[2:]);control=[transform(*values[:2]),end,end]
            commands.append(['C',*[v for p in control for v in p]]);points.extend(control);current=end
        elif op=='h':commands.append(['Z']);current=start
        elif op in ['S','s']:
            if op=='s':commands.append(['Z'])
            finish('stroke')
        elif op in ['f','F','f*']:finish('fill')
        elif op in ['B','B*','b','b*']:finish('stroke')
        elif op=='n':commands=[];points=[]
    return paths

def paths_in(paths,rect):
    x,y,w,h=rect
    return [p for p in paths if x<=p['bounds'][0] and p['bounds'][2]<=x+w and y<=p['bounds'][1] and p['bounds'][3]<=y+h]

def glyph_cells(page_number,count,two_columns=True):
    width=595.2756;top=841.8898-(218 if page_number==1 else 153)
    columns=2 if two_columns else 1;rows=math.ceil(count/columns)
    block=(width-72-18)/2 if columns==2 else width-72
    sample=47 if columns==2 else 69;row=min(45,(top-118)/rows)
    writing=(block-sample-6)/3
    for index in range(count):
        col=index//rows;line=index%rows
        x=36+col*(block+18)+sample+6;y=top-13-(line+1)*row+2
        yield [[x+copy*writing,y,writing-3,row-5] for copy in range(3)]

def formula_cell(page_number,index,count=8):
    top=841.8898-153;row=(top-119)/count;w=(595.2756-72-145-9)/2
    return [36+145+9,top-13-(index+1)*row+2,w-5,row-5]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    reader=PdfReader(args.input);pages=[page_paths(p,reader) for p in reader.pages]
    groups=[(1,list('0123456789'),False),(2,list('abcdefghijklmnopqrstuvwxyz'),True),
            (3,list('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),True),
            (4,list('αβγδεθλμπρσφωΔΣΩητϕϵ'),True),
            (5,['+','−','×','÷','⋅','/','=','≠','<','>','≤','≥','±','∓','≈','≡','∝','∞','→','⇒','⇔','∴','∵',':','.',',','!','%'],True),
            (6,['()','[]','{}','||','∈','∉','⊂','⊆','⊃','∪','∩','∅','∀','∃','∠','△','⊥','∥','∘','′','…','⋮','←','↔'],True)]
    glyphs={}
    for page,characters,two in groups:
        for character,cells in zip(characters,glyph_cells(page,len(characters),two)):
            variants=[paths_in(pages[page-1],cell) for cell in cells]
            valid=[v for v in variants if v]
            if not valid:raise ValueError(f'Missing handwritten glyph: page {page}, {character}')
            if len(character)==2:
                split=[]
                for paths in variants:
                    if not paths:paths=valid[0]
                    low=min(p['bounds'][0] for p in paths);high=max(p['bounds'][2] for p in paths);mid=(low+high)/2
                    split.append(([p for p in paths if (p['bounds'][0]+p['bounds'][2])/2<mid],
                                  [p for p in paths if (p['bounds'][0]+p['bounds'][2])/2>=mid]))
                if character=='||':glyphs['|']=[left or right for left,right in split]
                else:
                    glyphs[character[0]]=[left for left,right in split]
                    glyphs[character[1]]=[right for left,right in split]
            else:glyphs[character]=[v or valid[0] for v in variants]
    # Integral and radical shapes are extracted from the user's compound examples.
    integral=paths_in(pages[7],formula_cell(8,7))
    glyphs['∫']=[[max(integral,key=lambda p:p['bounds'][3]-p['bounds'][1])]]*3
    radical=paths_in(pages[6],formula_cell(7,3))
    glyphs['√']=[[max(radical,key=lambda p:p['bounds'][2]-p['bounds'][0])]]*3
    glyphs['∑']=glyphs['Σ'];glyphs['-']=glyphs['−'];glyphs['·']=glyphs['⋅'];glyphs["'"]=glyphs['′']
    result={'schemaVersion':'MATTHS_USER_HANDWRITING_VECTOR_GLYPHS_V1','sourcePdfSha256':hashlib.sha256(args.input.read_bytes()).hexdigest(),
            'sourcePageCount':len(reader.pages),'sourcePenPathCounts':[len(p) for p in pages],'glyphCount':len(glyphs),
            'glyphs':glyphs,'containsUserNameOrSignature':False,'generationMethod':'USER_HANDWRITING_FONT','isHumanSolveEvidence':False}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False))
    print(json.dumps({k:v for k,v in result.items() if k!='glyphs'},ensure_ascii=False))

if __name__=='__main__':main()

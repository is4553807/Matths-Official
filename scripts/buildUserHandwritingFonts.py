#!/usr/bin/env python3
"""Build private math fonts from actual handwritten vector outlines."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

OPERATORS=set('+−-×÷⋅·/=≠<>≤≥±∓≈≡∝∞→⇒⇔∴∵:!%∈∉⊂⊆⊃∪∩∅∀∃∠△⊥∥←↔|()[]{}')
DESCENDERS=set('fgjpqyβρφϕ')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output-dir',type=Path,required=True);args=parser.parse_args()
    source=json.loads(args.input.read_text());args.output_dir.mkdir(parents=True,exist_ok=True)
    reports=[]
    for variant in range(3):
        originals=source['glyphs']
        digit_heights=[originals[ch][variant]['bounds'][3]-originals[ch][variant]['bounds'][1] for ch in '023456789']
        scale=700/statistics.median(digit_heights)
        glyphs={};metrics={};cmap={};glyph_order=['.notdef','space']
        p=TTGlyphPen(None);p.moveTo((40,0));p.lineTo((40,700));p.lineTo((540,700));p.lineTo((540,0));p.closePath();glyphs['.notdef']=p.glyph();metrics['.notdef']=(600,40)
        glyphs['space']=TTGlyphPen(None).glyph();metrics['space']=(260,0);cmap[32]='space'
        glyph_report=[]
        for ch,versions in originals.items():
            g=versions[variant];left,bottom,right,top=g['bounds'];width=right-left;height=top-bottom
            if width<=0 or height<=0:raise ValueError(f'Empty handwritten glyph: {ch} variant {variant+1}')
            size=scale
            if ch in OPERATORS:baseline=250-height*size/2
            elif ch in DESCENDERS:baseline=-height*size*.24
            elif ch in '.,':baseline=-70 if ch==',' else 40
            elif ch in '′\'∘':baseline=520
            elif ch in '∫√∑Σ':baseline=-80
            else:baseline=0
            # Keep the stroke trajectories and proportions; normalize only their
            # common scale and baseline, then convert curves to TrueType outlines.
            name=f'u{ord(ch):04X}';pen=TTGlyphPen(None)
            transformed=TransformPen(Cu2QuPen(pen,max_err=0.7),[size,0,0,size,60-left*size,baseline-bottom*size])
            parse_path(g['svgPath'],transformed)
            glyphs[name]=pen.glyph();advance=max(380 if ch.isdigit() else 180,round(width*size+120))
            metrics[name]=(advance,60);cmap[ord(ch)]=name;glyph_order.append(name)
            glyph_report.append({'character':ch,'sourceBounds':g['bounds'],'advance':advance})
        # Familiar equivalent codepoints share the same actual pen shape.
        aliases={0x03B5:0x03B5,0x220D:0x2208,0x211D:ord('R'),0x2115:ord('N'),0x2124:ord('Z'),0x25CB:ord('0')}
        for codepoint,base in aliases.items():
            if base in cmap:cmap[codepoint]=cmap[base]
        family=f'Matths User Math {variant+1}'
        fb=FontBuilder(1024,isTTF=True);fb.setupGlyphOrder(glyph_order);fb.setupCharacterMap(cmap);fb.setupGlyf(glyphs)
        fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=1400,descent=-500)
        fb.setupNameTable({'familyName':family,'styleName':'Regular','uniqueFontIdentifier':family+'-20261012',
                          'fullName':family+' Regular','psName':f'MatthsUserMath{variant+1}-Regular','version':'Version 1.000'})
        fb.setupOS2(sTypoAscender=1400,sTypoDescender=-500,usWinAscent=1600,usWinDescent=600,sxHeight=500,sCapHeight=700)
        fb.setupPost(underlinePosition=-100,underlineThickness=24);fb.setupMaxp()
        fb.font['head'].created=fb.font['head'].modified=3874608000
        fb.font.recalcTimestamp=False
        target=args.output_dir/f'matths-user-math-{variant+1}.ttf';fb.save(target)
        reports.append({'family':family,'fileName':target.name,'glyphCount':len(cmap),'scale':scale,
                        'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'glyphs':glyph_report})
    manifest={'schemaVersion':'MATTHS_USER_MATH_FONTS_V1','sourcePdfSha256':source['sourcePdfSha256'],
              'generationMethod':'USER_HANDWRITING_FONT','isHumanSolveEvidence':False,'containsNameOrSignature':False,
              'fonts':reports}
    (args.output_dir/'font-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'fonts':3,'glyphsPerFont':len(cmap),'method':'actual user pen-vector outlines','output':str(args.output_dir.resolve())},ensure_ascii=False))

if __name__=='__main__':main()

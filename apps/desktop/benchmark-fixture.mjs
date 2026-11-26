// Deterministic synthetic book, below the current 50,000 UTF-16 character
// and 512 inline-math engine limits. No real user files or external resources.
export function benchmarkFixture(){
  const sizes=[['small',8],['medium',30],['large',75]];
  const chapters=sizes.map(([id,count])=>{
    const sections=Array.from({length:count},(_,i)=>[
      '## 節 '+(i+1),
      ('日本語と English text の実測組版を確認します。段落の折返しと行の配置を検証します。').repeat(3),
      '係数 $x^2+2x+1$ と $\\frac{1}{2}$ を比較します。',
      ...(i%5===0?[':::component{name="example"}\n例題の本文です。 $x^2$ を計算します。\n:::']:[])
    ].join('\n\n'));
    return {id,source:'# '+id+'\n\n'+sections.join('\n\n')+'\n',sections:count};
  });
  const manifest='schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: "Synthetic benchmark"\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n'+chapters.map(c=>'  - {id: '+c.id+', type: manuscript, role: body, path: manuscript/'+c.id+'.md}\n').join('');
  return {chapters,manifest};
}

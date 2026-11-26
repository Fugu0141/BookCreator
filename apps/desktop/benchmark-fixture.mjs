// Deterministic synthetic book, below the current 50,000 UTF-16 character
// 128 blocks and 512 inline-math engine limits. No real user files or external resources.
export function benchmarkFixture(){
  const sizes=[['small',6,3],['medium',10,8],['large',20,20]];
  const chapters=sizes.map(([id,count,repeat])=>{
    const sections=Array.from({length:count},(_,i)=>[
      '## 節 '+(i+1),
      ('日本語と English text の実測組版を確認します。段落の折返しと行の配置を検証します。').repeat(repeat),
      '係数 $x^2+2x+1$ と $\\frac{1}{2}$ を比較します。',
      ...(i%5===0?[':::component{name="example"}\n例題の本文です。 $x^2$ を計算します。\n:::']:[])
    ].join('\n\n'));
    return {id,source:'# '+id+'\n\n'+sections.join('\n\n')+'\n',sections:count,blocks:1+count*3+Math.ceil(count/5)};
  });
  const manifest='schemaVersion: 1\ndocumentFormat: {name: bcm, version: 1}\ntitle: "Synthetic benchmark"\nlanguage: ja\ntheme: themes/default/theme.yaml\npage: {size: A4}\nsections:\n'+chapters.map(c=>'  - {id: '+c.id+', type: manuscript, role: body, path: manuscript/'+c.id+'.md}\n').join('');
  const oversizedSource='# 上限検査\n\n'+Array.from({length:128},(_,i)=>'上限検査段落 '+(i+1)).join('\n\n')+'\n';
  return {chapters,manifest,oversizedSource};
}

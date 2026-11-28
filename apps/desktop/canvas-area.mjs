// One-shot sizing of a fixed Canvas from the actual measured child extents.
// No text height estimation, scaling, or movement of existing elements.
export function fitCanvasHeight(rects,padding,limit=100000){
  if(!Array.isArray(rects)||!rects.length||!Number.isSafeInteger(padding)||padding<0||!Number.isSafeInteger(limit)||limit<=0||rects.some(r=>!Number.isSafeInteger(r.y)||r.y<0||!Number.isSafeInteger(r.height)||r.height<=0))throw RangeError('領域の実測寸法が不正です');
  const required=2*padding+Math.max(...rects.map(r=>r.y+r.height));
  if(!Number.isSafeInteger(required)||required>limit)throw RangeError('必要な高さが領域の上限を超えています');
  return required;
}

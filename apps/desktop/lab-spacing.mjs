const STEP=500;
export function spacingLimit(value,available){
  // Preserve existing larger settings; do not silently clamp a saved design.
  return Math.min(100000,Math.max(value,Math.min(20000,Math.floor(Math.max(0,available)/STEP)*STEP)));
}
export function stepSpacing(value,delta,max){
  return Math.max(0,Math.min(max,value+delta*STEP));
}

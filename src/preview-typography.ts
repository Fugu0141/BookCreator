export type PreviewFontFamily='serif'|'sans-serif'|'monospace'|`BCFont_${string}`;
export interface PreviewTextStyle {fontFamily:PreviewFontFamily;fontWeight:number}
export interface PreviewTypography {body:PreviewTextStyle;heading:PreviewTextStyle}
const valid=(v:PreviewTextStyle)=>v&&typeof v.fontFamily==='string'&&(/^(serif|sans-serif|monospace)$/.test(v.fontFamily)||/^BCFont_[A-Za-z0-9_]{1,64}$/.test(v.fontFamily))&&Number.isInteger(v.fontWeight)&&v.fontWeight>=100&&v.fontWeight<=900;
export const DEFAULT_PREVIEW_TYPOGRAPHY:Readonly<PreviewTypography>=Object.freeze({body:Object.freeze({fontFamily:'sans-serif' as const,fontWeight:400}),heading:Object.freeze({fontFamily:'sans-serif' as const,fontWeight:400})});
export function resolvePreviewTypography(value:PreviewTypography=DEFAULT_PREVIEW_TYPOGRAPHY):PreviewTypography {
  if(!valid(value.body)||!valid(value.heading))throw RangeError('Invalid preview typography');
  return {body:{...value.body},heading:{...value.heading}};
}

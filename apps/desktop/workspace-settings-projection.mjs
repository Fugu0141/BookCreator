// Pure derived settings, independent of the manuscript and preview state.
// Inputs are immutable React state values; caller memoizes on their identity.
// Keep the previous JSON comparison semantics and recovery payload formats.
export function projectBookSettings(page,order,savedSettings){
  const bookSettingsValue=JSON.stringify({page,sections:order});
  const settingsDirty=!!savedSettings&&bookSettingsValue!==JSON.stringify({
    page:savedSettings.page,
    sections:savedSettings.sections.filter(s=>s.editable).map(s=>({id:s.id,startOn:s.startOn}))
  });
  return {settingsDirty,bookSettingsValue};
}
export function projectTypographySettings(typography,theme,{fromRoles,toRoles}){
  const themeDirty=!!theme&&JSON.stringify(typography)!==JSON.stringify(fromRoles(theme.roles));
  const typographyValue=JSON.stringify(toRoles(typography));
  return {themeDirty,typographyValue};
}
export function projectFontChoices(fonts,choices,stix,idsByFamily){
  const fontChoices=[...choices,...fonts.map(f=>({id:f.alias,label:f.family+' '+f.style+' · '+f.sha256.slice(0,8)+(f.loaded?'':'（読込失敗）'),disabled:!f.loaded}))];
  const mathFontChoices=[{id:'auto',label:'自動（システム数式フォント）'},{id:stix,label:'STIX Two Math（同梱）'},...fontChoices.filter(c=>fonts.some(f=>f.alias===c.id&&f.hasMathTable&&f.weight===400))];
  const weightsFor=family=>{const f=fonts.find(f=>f.alias===family);return f?[f.weight]:[400,500,600,700];};
  const componentFonts=fontChoices.map(c=>({id:idsByFamily[c.id]??('font-'+c.id.slice(7)),label:c.label,weights:weightsFor(c.id),disabled:c.disabled}));
  return {fontChoices,mathFontChoices,componentFonts,weightsFor};
}

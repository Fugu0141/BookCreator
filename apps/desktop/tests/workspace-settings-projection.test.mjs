import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectBookSettings,projectTypographySettings,projectFontChoices} from '../workspace-settings-projection.mjs';

test('book projection keeps editable section order and recovery serialization',()=>{
  const page={size:'A5'},order=[{id:'a',startOn:'page'},{id:'b',startOn:'continuous'}];
  const saved={page,sections:[{id:'a',editable:true,startOn:'page'},{id:'locked',editable:false},{id:'b',editable:true,startOn:'continuous'}]};
  const clean=projectBookSettings(page,order,saved);
  assert.equal(clean.settingsDirty,false);
  assert.deepEqual(JSON.parse(clean.bookSettingsValue),{page,sections:order});
  assert.equal(projectBookSettings(page,[...order].reverse(),saved).settingsDirty,true);
  assert.equal(projectBookSettings({size:'B5'},order,saved).settingsDirty,true);
  assert.equal(projectBookSettings(null,[],null).settingsDirty,false);
  assert.equal(saved.sections.length,3);
});
test('typography projection preserves dirty checks and converted recovery payload',()=>{
  const fromRoles=r=>({family:r.family,weight:r.weight});
  const toRoles=t=>({body:t});
  const value={family:'serif',weight:400};
  const theme={roles:{...value}};
  const deps={fromRoles,toRoles};
  assert.deepEqual(projectTypographySettings(value,theme,deps),{themeDirty:false,typographyValue:JSON.stringify({body:value})});
  assert.equal(projectTypographySettings({...value,weight:700},theme,deps).themeDirty,true);
  assert.equal(projectTypographySettings(value,null,deps).themeDirty,false);
});
test('font projection preserves availability, math eligibility, aliases and weights',()=>{
  const choices=[{id:'serif',label:'明朝'}],ids={serif:'system-serif'};
  const font=(alias,weight,hasMathTable,loaded)=>({alias,weight,hasMathTable,loaded,family:alias,style:'Regular',sha256:'0123456789'});
  const fonts=[font('BCFont_a',400,true,true),font('BCFont_b',700,true,true),font('BCFont_c',400,true,false)];
  const result=projectFontChoices(fonts,choices,'stix',ids);
  assert.deepEqual(result.fontChoices.map(c=>c.id),['serif','BCFont_a','BCFont_b','BCFont_c']);
  assert.deepEqual(result.mathFontChoices.map(c=>c.id),['auto','stix','BCFont_a','BCFont_c']);
  assert.equal(result.mathFontChoices.at(-1).disabled,true);
  assert.deepEqual(result.weightsFor('BCFont_b'),[700]);
  assert.deepEqual(result.weightsFor('serif'),[400,500,600,700]);
  assert.deepEqual(result.componentFonts.map(c=>c.id),['system-serif','font-a','font-b','font-c']);
  assert.equal(result.componentFonts.at(-1).disabled,true);
  assert.equal(choices.length,1);
  const next=projectFontChoices([],choices,'stix',ids);
  assert.deepEqual(next.mathFontChoices.map(c=>c.id),['auto','stix']);
});

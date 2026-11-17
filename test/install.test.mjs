import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixture, data, fail, env, root } from './helpers.mjs';
import { skillsRoot } from '../dist/install.js';

const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

test('all four agents receive two self-contained Skills in isolated user directories', t=>{
  const f=fixture(t,0); const home=path.join(f.base,'isolated home');
  const result=data(f.main,'install','--agent','all','--home',home); assert.equal(result.skills.length,8);
  for(const skill of result.skills){
    assert.ok(existsSync(path.join(skill.path,'SKILL.md')));
    const wrapper=path.join(skill.path,'scripts','hl-converge.mjs');
    const version=spawnSync(process.execPath,[wrapper,'--version'],{cwd:f.base,env,encoding:'utf8'});
    assert.equal(version.status,0,version.stderr); assert.equal(version.stdout.trim(),packageVersion);
    const status=spawnSync(process.execPath,[wrapper,'--repo',f.main,'status','--json'],{cwd:f.base,env,encoding:'utf8'});
    assert.equal(status.status,0,status.stderr); assert.equal(JSON.parse(status.stdout).ok,true);
  }
  assert.ok(result.skills.some(x=>x.path===path.join(home,'.agents','skills','hl-converge-ready')));
  assert.ok(result.skills.some(x=>x.path===path.join(home,'.omp','agent','skills','hl-converge-integrate')));
  assert.ok(data(f.main,'install','--agent','all','--home',home).skills.every(s=>s.status==='unchanged'));
});
test('installation preflight preserves foreign Skills and does not partially install other agents', t=>{
  const f=fixture(t,0); const home=path.join(f.base,'isolated home'); const foreign=path.join(home,'.agents','skills','hl-converge-ready');
  mkdirSync(foreign,{recursive:true}); writeFileSync(path.join(foreign,'SKILL.md'),'user content');
  fail(f.main,'INSTALL_FOREIGN_SKILL','install','--agent','all','--home',home,'--force');
  assert.equal(readFileSync(path.join(foreign,'SKILL.md'),'utf8'),'user content'); assert.equal(existsSync(path.join(home,'.claude')),false);
});
test('local edits in an owned Skill need explicit replacement and unrelated files remain untouched', t=>{
  const f=fixture(t,0); const skills=path.join(f.base,'custom skills'); data(f.main,'install','--agent','codex','--skills-dir',skills);
  const edited=path.join(skills,'hl-converge-ready','SKILL.md'); writeFileSync(edited,'local edit');
  writeFileSync(path.join(skills,'keep.txt'),'keep'); fail(f.main,'INSTALL_EXISTS','install','--agent','codex','--skills-dir',skills);
  assert.equal(readFileSync(edited,'utf8'),'local edit'); data(f.main,'install','--agent','codex','--skills-dir',skills,'--force');
  assert.notEqual(readFileSync(edited,'utf8'),'local edit'); assert.equal(readFileSync(path.join(skills,'keep.txt'),'utf8'),'keep');
});
test('host config roots and Oh My Pi profiles are resolved explicitly', ()=>{
  assert.equal(skillsRoot('claude-code','/users/demo',{CLAUDE_CONFIG_DIR:'/custom/claude'}),'/custom/claude/skills');
  assert.equal(skillsRoot('opencode','/users/demo',{XDG_CONFIG_HOME:'/custom/config'}),'/custom/config/opencode/skills');
  assert.equal(skillsRoot('oh-my-pi','/users/demo',{OMP_PROFILE:'work',PI_CODING_AGENT_DIR:'/ignored'}),'/users/demo/.omp/profiles/work/agent/skills');
  assert.equal(skillsRoot('oh-my-pi','/users/demo',{PI_CODING_AGENT_DIR:'/custom/omp'}),'/custom/omp/skills');
  assert.equal(skillsRoot('oh-my-pi','/users/demo',{PI_CONFIG_DIR:'.omp-special',OMP_PROFILE:'work.v2'}),'/users/demo/.omp-special/profiles/work.v2/agent/skills');
  assert.equal(skillsRoot('oh-my-pi','/users/demo',{PI_CONFIG_DIR:'.omp-special',OMP_PROFILE:' ',PI_PROFILE:'other'}),'/users/demo/.omp-special/agent/skills');
  assert.throws(()=>skillsRoot('oh-my-pi','/users/demo',{OMP_PROFILE:'con'}));
  assert.throws(()=>skillsRoot('oh-my-pi','/users/demo',{OMP_PROFILE:'../../escape'}));
});
test('a continuation never accepts a new target parameter silently',t=>{
  const f=fixture(t,1); f.prepare(); const r=f.plan(); fail(f.main,'UNEXPECTED_OPTION','integrate',r.id,'--target','other');
});

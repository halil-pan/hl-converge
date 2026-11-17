import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { fixture, data, fail, g, call } from './helpers.mjs';
import { spawnSync } from 'node:child_process';
import { cli, env } from './helpers.mjs';

test('three arbitrary tasks integrate, keep the recorded target across default changes, finish and clean idempotently', t => {
  const f=fixture(t,3); f.prepare(); f.settings(); const r=f.plan();
  assert.equal(r.targetOrigin,'project-default');
  data(f.main,'integrate',r.id);
  for(let i=1;i<=3;i++) assert.ok(existsSync(path.join(f.main,`feature-${i}.txt`)));
  assert.equal(g(f.main,'rev-parse','release/v0.2.0'),f.initial);
  g(f.main,'branch','next-default',f.initial); data(f.main,'config','set','default-target','next-default');
  data(f.main,'verify',r.id); const done=data(f.main,'finish',r.id);
  assert.equal(done.target,'release/v0.2.0'); assert.equal(g(f.main,'branch','--show-current'),'release/v0.2.0');
  assert.equal(g(f.main,'rev-parse','next-default'),f.initial);
  assert.ok(data(f.main,'cleanup',r.id).entries.every(e=>e.status==='eligible'));
  assert.ok(f.tasks.every(s=>existsSync(s.path)));
  assert.ok(data(f.main,'cleanup',r.id,'--apply','--delete-branches').entries.every(e=>e.branchDeleted));
  assert.ok(f.tasks.every(s=>!existsSync(s.path)));
  assert.ok(data(f.main,'cleanup',r.id,'--apply','--delete-branches').entries.every(e=>e.status==='already-removed'));
  assert.equal(data(f.main,'finish',r.id).finishedCommit,done.finishedCommit);
});

test('explicit target overrides default for one run without rewriting the default', t=>{
  const f=fixture(t,1); f.prepare(); f.settings(); g(f.main,'branch','hotfix'); const r=f.plan(['--target','hotfix']);
  assert.equal(r.targetOrigin,'explicit'); data(f.main,'integrate',r.id); data(f.main,'verify',r.id); data(f.main,'finish',r.id);
  assert.equal(data(f.main,'config','show').defaultTarget,'release/v0.2.0'); assert.equal(g(f.main,'rev-parse','release/v0.2.0'),f.initial);
});
test('missing target is not inferred from the current branch', t=>{
  const f=fixture(t,1); f.prepare({defaults:false}); fail(f.main,'TARGET_REQUIRED','plan','--source','task-1');
});
test('dirty source is not staged, stashed or registered', t=>{
  const f=fixture(t,1); writeFileSync(path.join(f.tasks[0].path,'unrelated.txt'),'keep');
  fail(f.tasks[0].path,'WORKSPACE_DIRTY','ready','--name','task-1');
  assert.equal(readFileSync(path.join(f.tasks[0].path,'unrelated.txt'),'utf8'),'keep'); assert.equal(g(f.tasks[0].path,'stash','list'),'');
});
test('detached source can explicitly create a named task branch', t=>{
  const f=fixture(t,1); g(f.tasks[0].path,'switch','--detach');
  fail(f.tasks[0].path,'TASK_BRANCH_REQUIRED','ready','--name','detached');
  const r=data(f.tasks[0].path,'ready','--name','detached','--branch','feature/recovered'); assert.equal(r.branch,'feature/recovered');
});
test('directory and task ID collisions are rejected', t=>{
  const f=fixture(t,2); f.prepare(); fail(f.tasks[1].path,'SOURCE_ID_COLLISION','ready','--name','task-1');
  fail(f.tasks[0].path,'INVALID_ID','ready','--name','../escape');
  data(f.tasks[0].path,'ready','--name','duplicate'); fail(f.main,'DUPLICATE_WORKTREE','plan','--source','task-1','--source','duplicate');
});
test('dirty verification directory is preserved', t=>{
  const f=fixture(t,1); f.prepare(); writeFileSync(path.join(f.main,'local.txt'),'important');
  fail(f.main,'WORKSPACE_DIRTY','plan','--source','task-1'); assert.equal(g(f.main,'branch','--show-current'),'release/v0.2.0');
});
test('target checked out elsewhere tells the caller to use its workspace', t=>{
  const f=fixture(t,2); f.prepare(); fail(f.main,'TARGET_CHECKED_OUT_ELSEWHERE','plan','--source','task-1','--workspace',f.tasks[1].path);
});
test('source branch advances after planning: fixed version integrates and cleanup preserves new work', t=>{
  const f=fixture(t,1); f.prepare(); f.settings(); const r=f.plan(); const s=f.tasks[0];
  writeFileSync(path.join(s.path,'later.txt'),'later'); g(s.path,'add','.'); g(s.path,'commit','-m','later');
  data(f.main,'integrate',r.id); assert.equal(existsSync(path.join(f.main,'later.txt')),false);
  data(f.main,'verify',r.id); data(f.main,'finish',r.id);
  const e=fail(f.main,'CLEANUP_PARTIAL','cleanup',r.id,'--apply'); assert.equal(e.details.entries[0].code,'SOURCE_BRANCH_CHANGED'); assert.ok(existsSync(s.path));
});
test('target movement before integrate refuses the obsolete plan', t=>{
  const f=fixture(t,1); f.prepare(); const r=f.plan(); writeFileSync(path.join(f.main,'new.txt'),'new'); g(f.main,'add','.'); g(f.main,'commit','-m','new base');
  fail(f.main,'TARGET_MOVED','integrate',r.id);
});
test('target movement after validation requires refresh and new validation', t=>{
  const f=fixture(t,1); const r=f.integrated(); data(f.main,'verify',r.id);
  const patcher=path.join(f.base,'patcher'); g(f.main,'worktree','add','-b','patcher',patcher,'release/v0.2.0');
  writeFileSync(path.join(patcher,'patch.txt'),'new target work'); g(patcher,'add','.'); g(patcher,'commit','-m','patch'); g(f.main,'update-ref','refs/heads/release/v0.2.0',g(patcher,'rev-parse','HEAD'));
  fail(f.main,'TARGET_MOVED','finish',r.id); data(f.main,'refresh',r.id); fail(f.main,'VERIFICATION_REQUIRED','finish',r.id);
  data(f.main,'verify',r.id); data(f.main,'finish',r.id); assert.ok(existsSync(path.join(f.main,'patch.txt')));
});
test('merge conflict is retained; resolution continues without repeating completed merges', t=>{
  const f=fixture(t,2,true); f.prepare(); f.settings(); const r=f.plan(); fail(f.main,'MERGE_BLOCKED','integrate',r.id);
  assert.equal(f.readRun(r).steps[0].status,'done'); fail(f.main,'MERGE_RESOLUTION_REQUIRED','continue',r.id);
  writeFileSync(path.join(f.main,'base.txt'),'feature 1 and feature 2\n'); g(f.main,'add','base.txt'); g(f.main,'commit','-m','resolve both');
  data(f.main,'continue',r.id); const before=g(f.main,'rev-list','--count','HEAD'); data(f.main,'integrate',r.id); assert.equal(g(f.main,'rev-list','--count','HEAD'),before);
  data(f.main,'verify',r.id); data(f.main,'finish',r.id);
});
test('aborting a conflicted merge permits a controlled retry', t=>{
  const f=fixture(t,2,true); f.prepare(); const r=f.plan(); fail(f.main,'MERGE_BLOCKED','integrate',r.id); g(f.main,'merge','--abort');
  fail(f.main,'MERGE_BLOCKED','continue',r.id); assert.equal(f.readRun(r).steps[0].status,'done');
});
test('crash after git merge but before recording completion is recovered from actual ancestry', t=>{
  const f=fixture(t,2); f.prepare(); const r=f.plan(); data(f.main,'integrate',r.id); const state=f.readRun(r);
  state.steps[1].status='merging'; state.expectedHead=state.steps[1].before; state.status='integrating'; writeFileSync(f.runFile(r),JSON.stringify(state));
  const before=g(f.main,'rev-list','--count','HEAD'); data(f.main,'continue',r.id); assert.equal(g(f.main,'rev-list','--count','HEAD'),before);
});
test('no configured validation cannot pass', t=>{
  const f=fixture(t,1); f.prepare(); const r=f.plan(); data(f.main,'integrate',r.id); fail(f.main,'NO_CHECKS_CONFIGURED','verify',r.id); fail(f.main,'VERIFICATION_REQUIRED','finish',r.id);
});
test('failed check does not update target', t=>{
  const f=fixture(t,1); const r=f.integrated(); f.settings([{name:'bad',command:[process.execPath,'-e','process.exit(3)']}]);
  const e=fail(f.main,'CHECK_FAILED','verify',r.id); assert.equal(e.details.checks[0].exitCode,3); assert.ok(existsSync(e.details.checks[0].log));
  fail(f.main,'VERIFICATION_REQUIRED','finish',r.id); assert.equal(g(f.main,'rev-parse','release/v0.2.0'),f.initial);
});
test('manual confirmation reuses successful unchanged automated checks', t=>{
  const f=fixture(t,1); const r=f.integrated(); const counter=path.join(f.base,'counter');
  f.settings([{name:'counter',command:[process.execPath,'-e',`require('fs').appendFileSync(${JSON.stringify(counter)},'x')`]}],['真机验收']);
  fail(f.main,'MANUAL_CHECK_REQUIRED','verify',r.id); assert.equal(readFileSync(counter,'utf8'),'x');
  fail(f.main,'UNKNOWN_MANUAL_CHECK','verify',r.id,'--confirm-manual','wrong');
  data(f.main,'verify',r.id,'--confirm-manual','真机验收'); assert.equal(readFileSync(counter,'utf8'),'x');
  data(f.main,'verify',r.id,'--rerun'); assert.equal(readFileSync(counter,'utf8'),'xx');
  writeFileSync(path.join(f.main,'fix.txt'),'new version'); g(f.main,'add','.'); g(f.main,'commit','-m','new version');
  fail(f.main,'MANUAL_CHECK_REQUIRED','verify',r.id); assert.equal(readFileSync(counter,'utf8'),'xxx');
});
test('checks modifying files invalidate the verification', t=>{
  const f=fixture(t,1); const r=f.integrated(); f.settings([{name:'formatter',command:[process.execPath,'-e',"require('fs').appendFileSync('base.txt','modified')"]}]);
  fail(f.main,'VERIFICATION_TREE_CHANGED','verify',r.id); assert.equal(f.readRun(r).status,'verification-failed');
});
test('validation configuration changes invalidate a previous success', t=>{
  const f=fixture(t,1); const r=f.integrated(); data(f.main,'verify',r.id); f.settings([{name:'new',command:[process.execPath,'-e','process.exit(0)']}]);
  fail(f.main,'VERIFICATION_REQUIRED','finish',r.id); data(f.main,'verify',r.id); data(f.main,'finish',r.id);
});
test('committed integration fix needs fresh validation and can be accepted', t=>{
  const f=fixture(t,1); const r=f.integrated(); data(f.main,'verify',r.id); writeFileSync(path.join(f.main,'fix.txt'),'fix'); g(f.main,'add','.'); g(f.main,'commit','-m','integration fix');
  fail(f.main,'VERIFICATION_STALE','finish',r.id); data(f.main,'verify',r.id); data(f.main,'finish',r.id);
});
test('timed-out check is terminated and fails', t=>{
  const f=fixture(t,1); const r=f.integrated(); f.settings([{name:'timeout',command:[process.execPath,'-e','setInterval(()=>{},1000)'],timeoutMs:100}]);
  const e=fail(f.main,'CHECK_FAILED','verify',r.id); assert.equal(e.details.checks[0].timedOut,true);
});
test('cleanup retains host-managed and unreleased worktrees', t=>{
  const f=fixture(t,1); const r=f.finished({owner:'codex'}); let e=fail(f.main,'CLEANUP_PARTIAL','cleanup',r.id,'--apply'); assert.equal(e.details.entries[0].code,'HOST_MANAGED');
  data(f.tasks[0].path,'ready','--name','task-1','--owner','git'); e=fail(f.main,'CLEANUP_PARTIAL','cleanup',r.id,'--apply'); assert.equal(e.details.entries[0].code,'SOURCE_NOT_RELEASED');
});
test('cleanup retains uncommitted and ignored local files', t=>{
  const f=fixture(t,1); const r=f.finished(); const s=f.tasks[0]; writeFileSync(path.join(s.path,'local.txt'),'keep');
  let e=fail(f.main,'CLEANUP_PARTIAL','cleanup',r.id,'--apply'); assert.equal(e.details.entries[0].code,'SOURCE_DIRTY'); rmSync(path.join(s.path,'local.txt'));
  writeFileSync(path.join(s.path,'.env'),'local-only'); e=fail(f.main,'CLEANUP_PARTIAL','cleanup',r.id,'--apply'); assert.equal(e.details.entries[0].code,'IGNORED_FILES_PRESENT'); assert.ok(e.details.entries[0].details.paths.includes('.env'));
  data(f.main,'cleanup',r.id,'--apply','--discard-ignored'); assert.equal(existsSync(s.path),false);
});
test('unfinished run cannot delete any sources', t=>{
  const f=fixture(t,1); const r=f.integrated(); fail(f.main,'RUN_NOT_FINISHED','cleanup',r.id,'--apply'); assert.ok(existsSync(f.tasks[0].path));
});
test('live lock is preserved, dead same-host lock is recoverable', t=>{
  const f=fixture(t,0); const lock=path.join(f.state,'lock'); mkdirSync(lock,{recursive:true});
  writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,host:hostname(),token:'live'})); fail(f.main,'REPOSITORY_BUSY','config','set','default-target','release/v0.2.0');
  assert.ok(existsSync(lock)); writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:999999999,host:hostname(),token:'dead'})); data(f.main,'config','set','default-target','release/v0.2.0'); assert.equal(existsSync(lock),false);
});
test('command strings and traversal directories in check configuration are rejected', t=>{
  const f=fixture(t,0); const file=path.join(f.base,'invalid.json'); writeFileSync(file,JSON.stringify({checks:[{name:'bad',command:'echo hi'}]}));
  fail(f.main,'INVALID_CONFIG','config','set','checks',file);
  writeFileSync(file,JSON.stringify({checks:[{name:'bad',command:['node'],cwd:'../outside'}]})); fail(f.main,'INVALID_CONFIG','config','set','checks',file);
});
test('finish recovers after target update but before state recording', t=>{
  const f=fixture(t,1); const r=f.integrated(); data(f.main,'verify',r.id); const before=f.readRun(r); data(f.main,'finish',r.id);
  before.finishIntent={commit:before.verification.commit,targetBefore:before.targetExpected}; writeFileSync(f.runFile(r),JSON.stringify(before));
  const recovered=data(f.main,'finish',r.id); assert.equal(recovered.finishedCommit,before.verification.commit);
});

test('a check that dirties files is never reused as a cached success after restoring files', t=>{
  const f=fixture(t,1); const r=f.integrated(); const counter=path.join(f.base,'formatter-count');
  f.settings([{name:'dirty',command:[process.execPath,'-e',`require('fs').appendFileSync('base.txt','x');require('fs').appendFileSync(${JSON.stringify(counter)},'x')`]}]);
  fail(f.main,'VERIFICATION_TREE_CHANGED','verify',r.id); g(f.main,'restore','base.txt');
  fail(f.main,'VERIFICATION_TREE_CHANGED','verify',r.id); assert.equal(readFileSync(counter,'utf8'),'xx');
});
test('ambient Git directory variables do not redirect an explicitly selected repository', t=>{
  const f=fixture(t,0); const other=fixture(t,0);
  const result=spawnSync(process.execPath,[cli,'--repo',f.main,'config','set','default-target','release/v0.2.0','--json'],{encoding:'utf8',env:{...env,GIT_DIR:path.join(other.main,'.git'),GIT_WORK_TREE:other.main}});
  assert.equal(result.status,0,result.stderr); assert.ok(existsSync(path.join(f.state,'config.json'))); assert.equal(existsSync(path.join(other.state,'config.json')),false);
});
test('manual-only projects require an actual named acceptance declaration', t=>{
  const f=fixture(t,1); const r=f.integrated(); f.settings([],['业务验收']);
  fail(f.main,'MANUAL_CHECK_REQUIRED','verify',r.id); data(f.main,'verify',r.id,'--confirm-manual','业务验收'); data(f.main,'finish',r.id);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('setup installs into an isolated environment, forwards arguments and reuses completed dependencies',()=>{
  if(process.platform!=='linux' || process.arch!=='x64')return;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-setup-'));
  try{
    fs.mkdirSync(path.join(dir,'karaoke'));fs.mkdirSync(path.join(dir,'bin'));
    fs.copyFileSync('karaoke/setup-and-start.sh',path.join(dir,'karaoke/setup-and-start.sh'));
    fs.writeFileSync(path.join(dir,'karaoke/requirements.txt'),'demucs==4.0.1\n');
    fs.writeFileSync(path.join(dir,'karaoke/start.sh'),'printf "started:%s\\n" "$*"\n');
    // Substitute all external tools: this test performs no network or system installs.
    fs.writeFileSync(path.join(dir,'bin/python3.12'),`#!/bin/bash
if [[ "$1" == -m && "$2" == venv ]]; then
  mkdir -p "$3/bin"
  cp "$0" "$3/bin/python"
elif [[ "$1" == -m && "$2" == pip ]]; then
  if [[ "$3" == --version && -f "$ECHO_SETUP_LOG.missing-pip" ]]; then exit 1;fi
  echo "$*" >> "$ECHO_SETUP_LOG"
elif [[ "$1" == -m && "$2" == ensurepip ]]; then
  rm -f "$ECHO_SETUP_LOG.missing-pip"
fi
`,{mode:0o755});
    for(const name of ['ffmpeg','ffprobe','node'])fs.writeFileSync(path.join(dir,'bin',name),'#!/bin/bash\nexit 0\n',{mode:0o755});
    const log=path.join(dir,'install.log');
    const run=()=>spawnSync('bash',[path.join(dir,'karaoke/setup-and-start.sh'),'--port','8766'],{encoding:'utf8',cwd:os.tmpdir(),env:{...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,ECHO_SETUP_LOG:log}});
    const first=run();assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/started:--port 8766/);
    const installed=fs.readFileSync(log,'utf8');assert.match(installed,/https:\/\/download.pytorch.org\/whl\/cpu/);
    assert.equal(fs.readFileSync(path.join(dir,'.venv/.echo-requirements'),'utf8'),'demucs==4.0.1\n');
    const again=run();assert.equal(again.status,0,again.stderr);assert.equal(fs.readFileSync(log,'utf8'),installed);
    fs.rmSync(path.join(dir,'.venv/.echo-requirements'));fs.writeFileSync(log+'.missing-pip','');
    const repaired=run();assert.equal(repaired.status,0,repaired.stderr);
    assert.match(repaired.stdout,/修复未完成安装的 pip/);assert.equal(fs.existsSync(log+'.missing-pip'),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

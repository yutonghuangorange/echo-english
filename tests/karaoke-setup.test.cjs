const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('setup installs into an isolated environment, forwards arguments and reuses completed dependencies', {skip:!['linux','darwin'].includes(process.platform)},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo setup 中文-'));
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
elif [[ "$1" == -c && "$2" == *torch.version.cuda* && -f "$ECHO_SETUP_LOG.cuda" ]]; then
  echo cuda
fi
`,{mode:0o755});
    for(const name of ['ffmpeg','ffprobe','node'])fs.writeFileSync(path.join(dir,'bin',name),'#!/bin/bash\nexit 0\n',{mode:0o755});
    fs.writeFileSync(path.join(dir,'bin/uname'),'#!/bin/bash\nif [[ "$1" == -s ]]; then echo Linux;else echo x86_64;fi\n',{mode:0o755});
    const log=path.join(dir,'install.log');
    const run=()=>spawnSync('/bin/bash',[path.join(dir,'karaoke/setup-and-start.sh'),'--port','8766'],{encoding:'utf8',cwd:os.tmpdir(),env:{...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,ECHO_SETUP_LOG:log}});
    const first=run();assert.equal(first.status,0,first.stderr);assert.match(first.stdout,/started:--port 8766/);
    const installed=fs.readFileSync(log,'utf8');assert.match(installed,/https:\/\/download.pytorch.org\/whl\/cpu/);
    assert.equal(fs.readFileSync(path.join(dir,'.venv/.echo-requirements'),'utf8'),'demucs==4.0.1\n');
    const again=run();assert.equal(again.status,0,again.stderr);assert.equal(fs.readFileSync(log,'utf8'),installed);
    fs.rmSync(path.join(dir,'.venv/.echo-requirements'));fs.writeFileSync(log+'.missing-pip','');
    const repaired=run();assert.equal(repaired.status,0,repaired.stderr);
    assert.match(repaired.stdout,/修复未完成安装的 pip/);assert.equal(fs.existsSync(log+'.missing-pip'),false);
    // Updating unrelated dependencies must preserve an existing CUDA wheel.
    fs.rmSync(path.join(dir,'.venv/.echo-requirements'));fs.writeFileSync(log+'.cuda','');fs.writeFileSync(log,'');
    const gpu=run();assert.equal(gpu.status,0,gpu.stderr);
    assert.match(fs.readFileSync(log,'utf8'),/install -r/);
    assert.doesNotMatch(fs.readFileSync(log,'utf8'),/download.pytorch.org\/whl\/cpu/);
    fs.rmSync(log+'.cuda');
    // Simulate both Homebrew layouts with keg-only Python absent from PATH.
    const brew=path.join(dir,'Homebrew with spaces');
    fs.mkdirSync(path.join(brew,'opt/python@3.12/bin'),{recursive:true});
    fs.renameSync(path.join(dir,'bin/python3.12'),path.join(brew,'opt/python@3.12/bin/python3.12'));
    fs.writeFileSync(path.join(dir,'bin/brew'),`#!/bin/bash\nprintf '%s\\n' '${brew}'\n`,{mode:0o755});
    for(const arch of ['arm64','x86_64']){
      fs.writeFileSync(path.join(dir,'bin/uname'),`#!/bin/bash\nif [[ "$1" == -s ]]; then echo Darwin;else echo ${arch};fi\n`,{mode:0o755});
      fs.rmSync(path.join(dir,'.venv/.echo-requirements'));
      fs.writeFileSync(log,'');
      const mac=run();assert.equal(mac.status,0,mac.stderr);
      const macInstall=fs.readFileSync(log,'utf8');
      assert.match(macInstall,/install -r/);assert.doesNotMatch(macInstall,/download.pytorch.org/);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

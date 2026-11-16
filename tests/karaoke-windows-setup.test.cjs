const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('Windows launcher parses in PowerShell and shows help without installing', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo setup 中文 '));
  try{
    const script=path.join(dir,'start-karaoke.ps1');
    fs.copyFileSync('start-karaoke.ps1',script);
    const parsed=spawnSync('powershell.exe',['-NoProfile','-Command',
      '$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:ECHO_TEST_SCRIPT,[ref]$tokens,[ref]$errors) | Out-Null;if($errors.Count){$errors | Out-String | Write-Error;exit 1}'],
      {encoding:'utf8',env:{...process.env,ECHO_TEST_SCRIPT:script}});
    assert.equal(parsed.status,0,parsed.stderr);
    const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'--help'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Python 3\.10-3\.12/);
    assert.equal(fs.existsSync(path.join(dir,'.venv')),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

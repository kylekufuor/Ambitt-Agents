import os,sys,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
env=dict(os.environ)
for line in (root/'.codex/reviews/workspace/qa.env').read_text().splitlines():
 if '=' in line:
  key,value=line.split('=',1);env[key]=value
env.pop('NODE_OPTIONS',None)
args=sys.argv[1:]
if args[0]=='build':
 env.pop('PORTAL_DEV_AS',None)
 command=['npm','run','build']
else:command=['npm','run','dev','--','--port','4312','--hostname','127.0.0.1']
raise SystemExit(subprocess.call(command,cwd=root/'client-portal',env=env))

"""Independent Python oracle for the checked unsigned and modular APIs."""
from pathlib import Path
import json
import math
import os
import random
import subprocess

ROOT=Path(__file__).resolve().parents[1]
PROBE=Path(os.environ.get('HANDCRAFTED_PROBE',str(ROOT/'build/probe')))
rng=random.Random(20261003)
widths=[3,15,16,31,32,33,63,64,65,127,128,224,256,384,521,1024,2047,2048]
maximum=(1<<2048)-1
cases=[];expected=[]

def add(op,p,a,b,result,status=0,remainder=0):
    cases.append(f'{op} {p} {a} {b}')
    expected.append((status,result,remainder))

for i in range(1250):
    bits=widths[i%len(widths)]
    p=max(5,(1<<bits)-1 if i%3==0 else rng.getrandbits(bits)|(1<<(bits-1))|1)
    a,b=(p-1,p-1) if i%4==0 else (rng.randrange(p),rng.randrange(p))
    for op,value in [('add',(a+b)%p),('sub',(a-b)%p),('mul',a*b%p)]:add(op,p,a,b,value)
    e=i%65;add('pow',p,a,e,pow(a,e,p))
    wide=rng.getrandbits(min(2048,bits+64))
    add('reduce',p,wide,0,wide%p)
    add('intadd',0,a,b,a+b if a+b<=maximum else 0,int(a+b>maximum))
    add('intsub',0,a,b,a-b if a>=b else 0,int(a<b))
    add('intmul',0,a,b,a*b if a*b<=maximum else 0,int(a*b>maximum))
    q,r=divmod(wide,b or 1);add('div',0,wide,b or 1,q,remainder=r)
    add('bytes',0,wide,0,wide)
    if i%5==0:
        coprime=math.gcd(a,p)==1
        add('inv',p,a,0,pow(a,-1,p) if coprime else 0,int(not coprime))
for a in [0,1,maximum,1<<2047]:
    for b in [0,1,2,maximum]:
        if b:
            q,r=divmod(a,b);add('div',0,a,b,q,remainder=r)
        else:add('div',0,a,b,0,1)
# Noncanonical operands and an invalid modulus must be rejected.
for op in ['add','sub','mul','pow','inv']:
    add(op,17,17,1,0,1)
add('mul',2,1,1,0,1)
run=subprocess.run([str(PROBE)],input='\n'.join(cases)+'\n',text=True,capture_output=True)
assert run.returncode==0,run.stderr
actual=[tuple(map(int,line.split())) for line in run.stdout.splitlines()]
assert len(actual)==len(expected),(len(actual),len(expected))
for i,(got,want) in enumerate(zip(actual,expected)):
    assert got==want,(cases[i],got,want)
(ROOT/'build/vectors.json').write_text(json.dumps({'cases':cases,'expected':[list(map(str, row)) for row in expected]}))
print(f'PASS: {len(cases)} checked operations against Python, 3..2048 bits, odd composite moduli, quotient/remainder, inverses and overflow rejection.')

"""Oraculo independiente de Python; no es una dependencia del ejecutable C."""
import ast
import json
import random
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'build/elliptic-curve'
PROBE = ROOT / 'build/arithmetic-probe'
rng = random.Random(7301)

def run(args, binary=BIN, valid=True):
    result = subprocess.run([str(binary), *map(str,args)], capture_output=True, text=True)
    assert (result.returncode == 0) == valid, (args, result.stdout, result.stderr)
    return result.stdout

def expected(p,a,P,Q):
    if P[2] == 0: return Q
    if Q[2] == 0: return P
    x,y,_=P; u,v,_=Q
    if x == u and (y+v)%p == 0: return (0,1,0)
    m=((3*x*x+a)*pow(2*y,-1,p) if P==Q else (v-y)*pow(u-x,-1,p))%p
    X=(m*m-x-u)%p
    return (X,(m*(x-X)-y)%p,1)

# Cruces de palabra, acarreo superior y valores de hasta 2048 bits.
for bits in [3,16,31,32,33,63,64,65,127,256,512,1024,2048]:
    for _ in range(8):
        p=rng.getrandbits(bits)|(1<<(bits-1))|1
        if p<=3: p=5
        a,b=rng.randrange(p),rng.randrange(p)
        for op, want in [('add',(a+b)%p),('sub',(a-b)%p),('mul',a*b%p),('pow',pow(a,b,p))]:
            assert int(run([op,p,a,b],PROBE))==want,(bits,op)
        assert int(run(['mul',p,p-1,p-1],PROBE))==1
        assert int(run(['add',p,p-1,p-1],PROBE))==p-2

for p in range(110):
    prime=p>=2 and all(p%d for d in range(2,int(p**0.5)+1))
    assert int(run(['prime',p],PROBE))==prime
for p in [561,1105,1729,3215031751,3825123056546413051,(1<<2048)-1]:
    assert run(['prime',p],PROBE).strip()=='0'
for p in [65537,4294967311,(1<<61)-1,(1<<127)-1,(1<<521)-1]:
    assert run(['prime',p],PROBE).strip()=='1'

CASES=[
 (65537,1,1,(49606,64426,1),(2565,62370,1)),
 (4294967311,30,97,(433318550,1866632789,1),(408186704,4022951807,1)),
 ((1<<31)-1,125,2,(1506532484,1041296099,1),(1624813594,253477454,1)),
 ((1<<61)-1,1,1300,(1317571598731990128,494998261481053431,1),(590181223958911612,1863749232038030155,1)),
]
for p,a,b,P,Q in CASES:
    for args,want in [(['add',p,a,b,*P,*Q],expected(p,a,P,Q)),
                      (['double',p,a,b,*P],expected(p,a,P,P)),
                      (['double',p,a,b,*Q],expected(p,a,Q,Q))]:
        assert ast.literal_eval(run(args).split(' = ')[1])==want

# Operaciones con coordenadas grandes: construimos una curva que contiene P.
generated=json.loads((ROOT/'assets/resultados/curvas-generadas.json').read_text())
for p in [(1<<127)-1, (1<<521)-1, (1<<1279)-1, int(generated[-1]['p'])]:
    a=1; P=(p//3,p//7,1); b=(P[1]**2-P[0]**3-a*P[0])%p
    assert (4*a**3+27*b*b)%p
    Q=expected(p,a,P,P)
    assert ast.literal_eval(run(['double',p,a,b,*P]).split(' = ')[1])==Q
    assert ast.literal_eval(run(['add',p,a,b,*P,*Q]).split(' = ')[1])==expected(p,a,P,Q)

# Todos los pares de puntos de una curva, incluidos infinito y opuestos.
for p,a,b in [(5,1,1),(7,2,3),(17,2,2)]:
    points=[(0,1,0)]+[(x,y,1) for x in range(p) for y in range(p) if (y*y-x**3-a*x-b)%p==0]
    for P in points:
        assert ast.literal_eval(run(['double',p,a,b,*P]).split(' = ')[1])==expected(p,a,P,P)
        for Q in points:
            assert ast.literal_eval(run(['add',p,a,b,*P,*Q]).split(' = ')[1])==expected(p,a,P,Q)

for args in [ ['double',7,2,3,0,0,1], ['double',7,2,3,0,1,2],
              ['double',7,2,3,1,1,0], ['double',7,0,0,0,0,1],
              ['add',7,2,3,0,1,0,0,0,1], ['double',7,2,3,7,1,1],
              ['generate',2], ['generate',2049], ['generate','abc'],
              ['generate',16,-1], ['double',1<<2048,1,1,0,1,1] ]:
    run(args,valid=False)
# La semilla reproduce una corrida en la misma implementacion de rand.
assert run(['generate',16,123])==run(['generate',16,123])
print('OK: aritmetica hasta 2048 bits, primalidad, 4 casos y todos los pares de 3 curvas.')

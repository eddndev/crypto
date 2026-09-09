"""Ejecuta el programa C, guarda respuestas y grafica sus archivos de puntos."""
import ast
import json
import subprocess
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1] / 'STIC/01-elliptic-curve'
OUT = ROOT / 'assets/resultados'
BIN = ROOT / 'build/elliptic-curve'
OUT.mkdir(parents=True,exist_ok=True)

def execute(args):
    return subprocess.check_output([str(BIN),*map(str,args)],cwd=ROOT,text=True)

fig, axes = plt.subplots(3,1,figsize=(7.5,11))
for ax,(p,a,b) in zip(axes,[(17,2,2),(97,2,3),(101,1,1)]):
    filename=f'assets/resultados/puntos-{p}.txt'
    execute(['curve',p,a,b,filename])
    text=(ROOT/filename).read_text()
    points=[ast.literal_eval(line) for line in text.splitlines() if line.startswith('(')]
    finite=[(x,y) for x,y,z in points if z==1]
    assert len(points)==1+len(finite)
    assert len(set(points))==len(points)
    assert all((y*y-x*x*x-a*x-b)%p==0 for x,y in finite)
    ax.scatter(*zip(*finite),s=18,color='#006699')
    ax.set(xlabel='x',ylabel='y',xlim=(-1,p),ylim=(-1,p))
    ax.set_title(f'y² = x³ + {a}x + {b} (mod {p}) · {len(points)} puntos con infinito',fontsize=11)
    ax.grid(alpha=.2)
fig.tight_layout(h_pad=2)
fig.savefig(OUT/'graficas.png',dpi=220)
fig.savefig(OUT/'graficas.pdf')
plt.close(fig)

cases=[
 (65537,1,1,(49606,64426,1),(2565,62370,1)),
 (4294967311,30,97,(433318550,1866632789,1),(408186704,4022951807,1)),
 ((1<<31)-1,125,2,(1506532484,1041296099,1),(1624813594,253477454,1)),
 ((1<<61)-1,1,1300,(1317571598731990128,494998261481053431,1),(590181223958911612,1863749232038030155,1)),
]
results=[]; transcript=''
for label,(p,a,b,P,Q) in zip('abcd',cases):
    row={'case':label,'p':str(p),'a':str(a),'b':str(b),'P':list(map(str,P)),'Q':list(map(str,Q))}
    transcript += f'Caso {label})\n'
    for key,args in [('P+Q',['add',p,a,b,*P,*Q]),('2P',['double',p,a,b,*P]),('2Q',['double',p,a,b,*Q])]:
        output=execute(args)
        transcript+='$ ./build/elliptic-curve '+' '.join(map(str,args))+'\n'+output+'\n'
        row[key]=list(map(str,ast.literal_eval(output.split(' = ')[1])))
    results.append(row)
(OUT/'operaciones.txt').write_text(transcript)
(OUT/'operaciones.json').write_text(json.dumps(results,indent=2)+'\n')
print('Graficas trazadas desde 3 archivos; 12 operaciones guardadas.')

"""Genera los seis ejemplos con C; guarda los decimales sin perder precision."""
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'STIC/01-elliptic-curve'
OUT=ROOT/'assets/resultados'
OUT.mkdir(parents=True,exist_ok=True)
rows=[]
for bits in [16,32,64,512,1024,2048]:
    seed=20260908+bits
    text=subprocess.check_output([str(ROOT/'build/elliptic-curve'),'generate',str(bits),str(seed)],text=True)
    values={k:int(v) for k,v in (line.split(' = ') for line in text.splitlines() if ' = ' in line)}
    p,a,b=values['p'],values['a'],values['b']
    assert p.bit_length()==bits and 0<=a<p and 0<=b<p and (4*a**3+27*b*b)%p
    (OUT/f'curva-{bits}.txt').write_text(f'$ ./build/elliptic-curve generate {bits} {seed}\n'+text)
    # Los campos grandes se guardan como cadenas para los lectores de JavaScript.
    rows.append({'bits':bits,'seed':seed,'p':str(p),'a':str(a),'b':str(b)})
    print(f'{bits} bits: curva generada',flush=True)
(OUT/'curvas-generadas.json').write_text(json.dumps(rows,indent=2)+'\n')

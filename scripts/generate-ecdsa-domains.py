"""Construct reproducible classroom domains; no cryptographic library is used.

For prime p = 4q-1, the curve y^2=x^3+x has p+1=4q points.
Multiplying a non-torsion point by 4 gives a generator of the prime q subgroup.
Miller-Rabin uses 40 fixed bases for fixture generation; C checks 32 random bases.
"""
import json
from pathlib import Path

BASES = (2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,
         73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173)

def prime(n):
    if n < 2: return False
    if any(n % b == 0 for b in BASES): return n in BASES
    d, s = n-1, 0
    while d % 2 == 0: d //= 2; s += 1
    for b in BASES:
        x=pow(b,d,n)
        if x in (1,n-1): continue
        for _ in range(s-1):
            x=x*x%n
            if x==n-1: break
        else: return False
    return True

def add(P,Q,p):
    if P is None: return Q
    if Q is None: return P
    x,y=P; u,v=Q
    if x==u and (y+v)%p==0: return None
    slope=((3*x*x+1)*pow(2*y,-1,p) if P==Q else (v-y)*pow(u-x,-1,p))%p
    z=(slope*slope-x-u)%p
    return z,(slope*(x-z)-y)%p

def mul(k,P,p):
    Q=None
    while k:
        if k&1:Q=add(Q,P,p)
        P=add(P,P,p);k>>=1
    return Q

rows=[]
for bits in (128,256,512,1024):
    q=(1 << (bits-3))+1
    while not prime(q) or not prime(4*q-1): q+=2
    p=4*q-1
    x=1
    while True:
        rhs=(x*x*x+x)%p
        y=pow(rhs,(p+1)//4,p)
        if y*y%p==rhs:
            A=mul(4,(x,y),p)
            if A is not None:break
        x+=1
    assert p.bit_length()==bits and mul(q,A,p) is None
    rows.append(dict(bits=bits,p=str(p),a='1',b='0',q=str(q),A=[str(A[0]),str(A[1]),'1']))
    print('Generated',bits,'bits',flush=True)
path=Path(__file__).resolve().parents[1]/'c/toy_ecdsa/tests/fixtures/large.json'
path.write_text(json.dumps(rows,indent=2)+'\n')

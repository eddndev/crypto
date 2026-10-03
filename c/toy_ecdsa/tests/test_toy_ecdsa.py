"""Independent small-curve checks for the C key and signature commands."""

import re
import subprocess
from pathlib import Path


PROGRAM = Path(__file__).resolve().parents[1] / "build" / "toy_ecdsa"
DOMAINS = [
    (1009, 1006, 4, 967, 256, 155),
    (1009, 1006, 8, 1069, 436, 973),
    (1013, 1010, 1, 1051, 339, 877),
    (131071, 131068, 1005, 130841, 20473, 81394),
]


def run(*args, succeeds=True):
    result = subprocess.run(
        [str(PROGRAM), *map(str, args)], capture_output=True, text=True, check=False
    )
    assert (result.returncode == 0) == succeeds, (result.stdout, result.stderr)
    return result.stdout


def values(output):
    return {
        key: int(value)
        for key, value in re.findall(r"^(?:Private key )?(d|m|r|s) = (\d+)$", output, re.M)
    }


def point(output, label):
    match = re.search(rf"^{label} = \((\d+), (\d+), 1\)$", output, re.M)
    assert match, output
    return tuple(map(int, match.groups()))


def add(p, a, point1, point2):
    if point1 is None:
        return point2
    if point2 is None:
        return point1
    x1, y1 = point1
    x2, y2 = point2
    if x1 == x2 and (y1 + y2) % p == 0:
        return None
    if point1 == point2:
        slope = (3 * x1 * x1 + a) * pow(2 * y1, -1, p) % p
    else:
        slope = (y2 - y1) * pow(x2 - x1, -1, p) % p
    x3 = (slope * slope - x1 - x2) % p
    y3 = (slope * (x1 - x3) - y1) % p
    return x3, y3


def multiply(p, a, scalar, point):
    result = None
    while scalar:
        if scalar & 1:
            result = add(p, a, result, point)
        point = add(p, a, point, point)
        scalar >>= 1
    return result


for p, a, b, q, gx, gy in DOMAINS:
    domain = (p, a, b, q, gx, gy)
    key_output = run("keygen", *domain)
    d = values(key_output)["d"]
    base = (gx, gy)
    public = point(key_output, "B")
    assert 0 < d < q
    assert public == multiply(p, a, d, base)
    assert multiply(p, a, q, base) is None

    for message in (1, q // 2, q - 1):
        signed = run("sign", *domain, d, message)
        fields = values(signed)
        r, s = fields["r"], fields["s"]
        assert fields["m"] == message
        assert point(signed, "B") == public
        assert 0 < r < q and 0 < s < q
        w = pow(s, -1, q)
        check = add(
            p, a, multiply(p, a, message * w % q, base),
            multiply(p, a, r * w % q, public)
        )
        assert check is not None and check[0] % q == r

    run("sign", *domain, d, 0, succeeds=False)
    run("sign", *domain, d, q, succeeds=False)
    run("sign", *domain, 0, 1, succeeds=False)

run("keygen", 1009, 1006, 4, 967, 1, 1, succeeds=False)
run("keygen", 1009, 1006, 4, 971, 256, 155, succeeds=False)
print("PASS: four supplied domains, 12 signatures, boundary and invalid inputs")

# Verification and logarithms are checked independently of the C signing path.
for p, a, b, q, gx, gy in DOMAINS:
    domain = (p, a, b, q, gx, gy)
    for secret in (1, q // 2, q - 1):
        public = multiply(p, a, secret, (gx, gy))
        recovered = run('dlog', *domain, *public)
        assert f'Recovered d = {secret}\n' in recovered
    secret = 19
    public = multiply(p, a, secret, (gx, gy))
    nonce = 23
    R = multiply(p, a, nonce, (gx, gy))
    r = R[0] % q
    message = 37
    s = (message + secret * r) * pow(nonce, -1, q) % q
    assert 'signature = VALID' in run('verify', *domain, *public, message, r, s)
    for invalid_r, invalid_s in ((0, s), (q, s), (r, 0), (r, q)):
        assert 'signature = INVALID' in run('verify', *domain, *public, message, invalid_r, invalid_s)
    assert 'signature = INVALID' in run('verify', *domain, *public, 0, r, s)
    assert 'signature = INVALID' in run('verify', *domain, *public, q, r, s)
    # An independently constructed signature that sends P to infinity.
    assert 'signature = INVALID' in run('verify', *domain, *public, q-secret, 1, 1)
run('verify', *DOMAINS[0], 1, 1, 37, 1, 1, succeeds=False)
run('keygen', 1009, 1006, 4, 966, 256, 155, succeeds=False)
run('verify', *DOMAINS[0], 1009, 1, 37, 1, 1, succeeds=False)
registered = (*DOMAINS[-1], 109322, 95671)
assert 'signature = VALID' in run('verify', *registered, 20045, 73780, 106591)
assert 'signature = INVALID' in run('verify', *registered, 20046, 73780, 106591)
print('PASS: independent signatures, infinity, malformed domains and 12 discrete logarithms', flush=True)

# Check the bounded logarithm search at its inclusive 32-bit boundary.
bounded = (2305843009213693951, 2305843009213693948, 1000,
           2305843008114440489, 797673362355646766, 866485585223612178)
for secret in (2**32-1, 2**32):
    public = multiply(bounded[0], bounded[1], secret, bounded[-2:])
    recovered = run('dlog', *bounded, *public)
    if secret < 2**32:
        assert f'Recovered d = {secret}\n' in recovered
    else:
        assert 'No private scalar found' in recovered
print('PASS: inclusive discrete logarithm search bound', flush=True)

import json
import time
large = json.loads((PROGRAM.parents[1] / 'tests/fixtures/large.json').read_text())
records = []
for item in large:
    domain = [item[k] for k in ('p','a','b','q')] + item['A'][:2]
    started = time.perf_counter()
    output = run('demo', *domain, 20045, 20260928 + item['bits'])
    assert output.count('signature = VALID') == 2, output
    assert output.count('modified signature = INVALID') == 2, output
    blocks = re.split(r'(?:Alice|Bob) signs; (?:Alice|Bob) verifies\n', output)[1:]
    signatures = []
    p,a,q = (int(item[k]) for k in ('p','a','q'))
    base = tuple(map(int, item['A'][:2]))
    for block in blocks:
        public = point(block, 'B')
        v = values(block)
        w = pow(v['s'], -1, q)
        P = add(p,a,multiply(p,a,v['m']*w%q,base),multiply(p,a,v['r']*w%q,public))
        assert P is not None and P[0]%q == v['r']
        tampered = add(p,a,multiply(p,a,w,base),multiply(p,a,v['r']*w%q,public))
        assert tampered is None or tampered[0]%q != v['r']
        signatures.append(dict(B=list(map(str,public)),**{k:str(v[k]) for k in ('m','r','s')}))
    elapsed = time.perf_counter()-started
    records.append(dict(**item,signatures=signatures,seconds=round(elapsed,3),output=output))
    print(f"PASS: local Alice/Bob, {item['bits']} bits, modified messages rejected ({elapsed:.2f}s)", flush=True)
(PROGRAM.parent / 'large-results.json').write_text(json.dumps(records,indent=2)+'\n')

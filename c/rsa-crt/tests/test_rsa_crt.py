"""Compare the rsa-crt CLI with Python integers (keygen, Algorithm 1, encrypt, CRT decrypt)."""
import math
import os
from pathlib import Path
import random
import subprocess

EXE = Path(os.environ.get('RSA_CRT_EXE', str(Path(__file__).resolve().parents[1] / 'build/rsa-crt'))).resolve()
RNG = random.Random(20261020)
PUBLIC = ('e', 'n')
PRIVATE = ('p', 'q', 'n', 'd', 'dp', 'dq')
TRACE = ('cp', 'cq', 'mp', 'mq', 'q_inv', 'h', 'm')


def call(*args, code=0):
    result = subprocess.run([str(EXE), *map(str, args)], capture_output=True, text=True)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    if code:
        assert result.stdout == '' and result.stderr.strip(), (args, result.stdout, result.stderr)
    return result.stdout


def miller_rabin(n, rounds=40):
    """Test-only primality check (the C program uses OpenSSL's generator)."""
    if n < 2:
        return False
    for small in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % small == 0:
            return n == small
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for _ in range(rounds):
        a = RNG.randrange(2, n - 1)
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


def parse_lines(text, names):
    lines = text.strip().split('\n')
    assert len(lines) == len(names), (lines, names)
    values = []
    for line, name in zip(lines, names):
        label, value = line.split(' = ')
        assert label == name and value.isdigit() and (value == '0' or value[0] != '0'), line
        values.append(int(value))
    return values


def keygen(bits):
    lines = call('keygen', bits).strip().split('\n')
    assert lines[0] == 'Public key (e, n)' and lines[3] == 'Private key (p, q, n, d, dp, dq)', lines
    e, n = parse_lines('\n'.join(lines[1:3]), PUBLIC)
    p, q, n2, d, dp, dq = parse_lines('\n'.join(lines[4:]), PRIVATE)
    phi = (p - 1) * (q - 1)
    assert n == n2 == p * q
    assert p.bit_length() == q.bit_length() == bits and p != q
    assert miller_rabin(p) and miller_rabin(q), (p, q)
    assert e % 2 == 1 and 1 < e < phi and e not in (3, 65537) and math.gcd(e, phi) == 1
    assert 0 < d < phi and e * d % phi == 1
    assert dp == d % (p - 1) and dq == d % (q - 1)
    return e, n, (p, q, n, d, dp, dq)


def encrypt(m, e, n):
    (c,) = parse_lines(call('encrypt', m, e, n), ('c',))
    assert c == pow(m, e, n), (m, e, n, c)
    return c


def decrypt(c, key):
    p, q, n, d, dp, dq = key
    trace = parse_lines(call('decrypt', c, *key), TRACE)
    cp, cq = c % p, c % q
    mp, mq = pow(cp, dp, p), pow(cq, dq, q)
    q_inv = pow(q, -1, p)
    h = q_inv * (mp - mq) % p
    expected = [cp, cq, mp, mq, q_inv, h, mq + h * q]
    assert trace == expected, (c, key, trace, expected)
    assert trace[-1] == pow(c, d, n)
    return trace[-1]


counts = {'keys': 0, 'round trips': 0, 'algorithm 1': 0, 'rejections': 0}

# Key generation for every supported size, round trips with random messages.
sizes = [4] * 30 + [5] * 20 + [6] * 10 + [7] * 10 + [8] * 10 + [16] * 10 + [32] * 6 \
    + [64] * 4 + [128] * 3 + [256] * 2 + [512] * 2 + [1024] * 2
small_primes = set()
keys = {}
for bits in sizes:
    e, n, key = keygen(bits)
    counts['keys'] += 1
    keys.setdefault(bits, (e, n, key))
    if bits == 4:
        small_primes.update(key[:2])
    messages = {1, 2, n - 1, RNG.randrange(1, n), RNG.randrange(1, n)}
    for m in messages:
        c = encrypt(m, e, n)
        if c == 0:
            continue
        assert decrypt(c, key) == m
        counts['round trips'] += 1
assert small_primes == {11, 13}, small_primes

# Algorithm 1 on arbitrary odd moduli (also composite), including H = 1, 2^k and 2^k - 1.
for _ in range(400):
    n = RNG.getrandbits(RNG.choice([3, 8, 31, 32, 33, 64, 65, 200, 1024, 2047, 2048])) | 1
    if n <= 3:
        continue
    x = RNG.randrange(1, n)
    for e in {2, 4, n - 1, 1 << RNG.randrange(1, max(2, n.bit_length() - 1)),
              (1 << RNG.randrange(2, max(3, n.bit_length()))) - 1, RNG.randrange(2, n)}:
        if 1 < e < n:
            encrypt(x, e, n)
            counts['algorithm 1'] += 1
# The pseudocode version (loop from t-1) would give x^(H + 2^(t-1)); make sure it does not.
assert encrypt(2, 5, 143) == 32 and pow(2, 5 + 4, 143) != 32
assert encrypt(142, 2, 143) == 1
encrypt(5, 7, 2**2048 - 1)
encrypt(2**2048 - 2, 2**2048 - 3, 2**2048 - 1)

# Decryption with c sharing a factor with n (c mod p = 0) still follows the CRT.
e, n, key = keys[8]
p, q = key[0], key[1]
for c in (p, q, 2 * p, n - p, n - q):
    if 0 < c < n:
        decrypt(c, key)

# Invalid inputs exit with status 1 and an error on stderr.
e, n, key = keys[16]
p, q, n, d, dp, dq = key
other = keys[32][2]
invalid = [
    (), ('keygen',), ('keygen', 3), ('keygen', 1025), ('keygen', 0), ('keygen', -8),
    ('keygen', 'abc'), ('keygen', '8x'), ('keygen', ''), ('keygen', 8, 9), ('unknown', 1),
    ('encrypt', 0, e, n), ('encrypt', n, e, n), ('encrypt', n + 5, e, n),
    ('encrypt', 5, 1, n), ('encrypt', 5, 0, n), ('encrypt', 5, n, n),
    ('encrypt', 5, e, n + 1), ('encrypt', 2, 3, 3), ('encrypt', 'x', e, n),
    ('encrypt', '-5', e, n), ('encrypt', '5.0', e, n), ('encrypt', '', e, n),
    ('encrypt', '0x10', e, n), ('encrypt', 5, e), ('encrypt', 5, e, n, 1),
    ('encrypt', 2, 3, str(2**2048 + 1)),
    ('decrypt', 0, *key), ('decrypt', n, *key), ('decrypt', n + 1, *key),
    ('decrypt', 5, p, q, n + 2, d, dp, dq), ('decrypt', 5, p, p, p * p, d, dp, dq),
    ('decrypt', 5, p, q, n, d, dp + 1, dq), ('decrypt', 5, p, q, n, d, dp, dq + 1),
    ('decrypt', 5, p, q, n, d + 1, dp, dq), ('decrypt', 5, 2, q, 2 * q, d, d % 1, dq),
    ('decrypt', 5, 3, q, 3 * q, d, d % 2, dq), ('decrypt', 5, p, q, n, d, dp),
    ('decrypt', 5, p, q, n, other[3], dp, dq), ('decrypt', 'c', *key), ('decrypt', 5, p, q, n, d, dp, 'dq'),
    ('decrypt', 5, p, q, n, d, dp, dq, 1), ('decrypt', 48, 9, 15, 135, 53, 5, 11),
]
for args in invalid:
    call(*args, code=1)
    counts['rejections'] += 1

print('PASS: ' + ', '.join(f'{v} {k}' for k, v in counts.items())
      + '; 4-bit keys use both 11 and 13; CRT traces match Python.')

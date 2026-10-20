"""Native tests for Lab 06, Section 2: RSA-OAEP (CRT private key) + AES-128-GCM."""
import base64
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

EXE = Path(os.environ.get(
    'RSA_OAEP_EXE', str(Path(__file__).resolve().parents[1] / 'build/rsa-oaep'))).resolve()
OAEP = ['-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256',
        '-pkeyopt', 'rsa_mgf1_md:sha256']
MAX_INPUT = 16 * 1024 * 1024

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # The AES cross-check is optional.
    AESGCM = None


def call(*args, code=0, cwd=None):
    result = subprocess.run([str(a) for a in args], capture_output=True, cwd=cwd)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    return result.stdout.decode()


def tool(*args, code=0, cwd=None):
    return call(EXE, *args, code=code, cwd=cwd)


def b64(path):
    return base64.b64decode(Path(path).read_text().strip(), validate=True)


def field(output, name):
    match = re.search(rf'^{re.escape(name)} = (\S+)$', output, re.M)
    assert match, (name, output)
    return match.group(1)


def openssl_components(private):
    """Parse `openssl pkey -text` into integers (colon hex blocks)."""
    text = call('openssl', 'pkey', '-in', private, '-text', '-noout')
    values = {}
    for name in ('modulus', 'privateExponent', 'prime1', 'prime2',
                 'exponent1', 'exponent2', 'coefficient'):
        match = re.search(rf'^{name}:\n((?:\s+[0-9a-f:]+\n)+)', text, re.M)
        assert match, (name, text)
        values[name] = int(re.sub(r'[\s:]', '', match.group(1)), 16)
    values['publicExponent'] = int(re.search(r'^publicExponent: (\d+)', text, re.M).group(1))
    return values


def check_inspect(private, cwd):
    output = tool('inspect', private, cwd=cwd)
    lines = output.strip().splitlines()
    assert [line.split(' = ')[0] for line in lines] == \
        ['n', 'e', 'd', 'p', 'q', 'dP', 'dQ', 'qInv'], output
    ours = {line.split(' = ')[0]: int(line.split(' = ')[1], 16) for line in lines}
    for line in lines:
        value = line.split(' = ')[1]
        assert value == value.lower() and (value == '0' or not value.startswith('0')), line
    ref = openssl_components(Path(cwd) / private)
    assert ours['n'] == ref['modulus'] and ours['e'] == ref['publicExponent']
    assert ours['d'] == ref['privateExponent']
    assert ours['p'] == ref['prime1'] and ours['q'] == ref['prime2']
    assert ours['dP'] == ref['exponent1'] and ours['dQ'] == ref['exponent2']
    assert ours['qInv'] == ref['coefficient']
    n, p, q, d = ours['n'], ours['p'], ours['q'], ours['d']
    assert n == p * q and p != q
    assert ours['dP'] == d % (p - 1) and ours['dQ'] == d % (q - 1)
    assert ours['qInv'] * q % p == 1
    return ours


def flip(path, index, out):
    raw = bytearray(b64(path))
    raw[index] ^= 1
    Path(out).write_text(base64.b64encode(bytes(raw)).decode() + '\n')


with tempfile.TemporaryDirectory() as root:
    alice = Path(root) / 'alice'
    bob = Path(root) / 'bob'
    alice.mkdir()
    bob.mkdir()

    # Alice: key pair with a CRT private key, in two separate files.
    out = tool('keygen', 'alice private.pem', 'alice public.pem', cwd=alice)
    assert '3072' in out
    private_text = (alice / 'alice private.pem').read_text()
    public_text = (alice / 'alice public.pem').read_text()
    assert private_text.startswith('-----BEGIN PRIVATE KEY-----\n')
    assert public_text.startswith('-----BEGIN PUBLIC KEY-----\n')
    call('openssl', 'pkey', '-in', 'alice private.pem', '-check', '-noout', cwd=alice)
    text = call('openssl', 'pkey', '-in', 'alice private.pem', '-text', '-noout', cwd=alice)
    assert 'Private-Key: (3072 bit, 2 primes)' in text
    for name in ('prime1:', 'prime2:', 'exponent1:', 'exponent2:', 'coefficient:'):
        assert name in text, name
    components = check_inspect('alice private.pem', alice)
    assert components['n'].bit_length() == 3072
    shutil.copy(alice / 'alice public.pem', bob / 'alice.pem')

    # Bob: K, AES files (binary and empty) and K wrapped for Alice.
    Path(bob / 'photo.bin').write_bytes(os.urandom(70000) + bytes(range(256)) * 9)
    Path(bob / 'empty').write_bytes(b'')
    out = tool('aes-keygen', 'K.b64', cwd=bob)
    k_text = field(out, 'K')
    k = b64(bob / 'K.b64')
    assert len(k) == 16 and base64.b64decode(k_text) == k
    tool('aes-encrypt', 'K.b64', 'photo.bin', 'photo.enc.b64', cwd=bob)
    tool('aes-encrypt', 'K.b64', 'empty', 'empty.enc.b64', cwd=bob)
    raw = b64(bob / 'photo.enc.b64')
    assert len(raw) == 12 + (bob / 'photo.bin').stat().st_size + 16
    assert len(b64(bob / 'empty.enc.b64')) == 28
    out = tool('wrap', 'alice.pem', 'K.b64', 'K.wrapped.b64', cwd=bob)
    wrapped = b64(bob / 'K.wrapped.b64')
    assert len(wrapped) == 384 and base64.b64decode(field(out, 'C')) == wrapped
    tool('wrap', 'alice.pem', 'K.b64', 'second.b64', cwd=bob)
    assert b64(bob / 'second.b64') != wrapped  # OAEP is randomized.

    # Bob shares the wrapped key and both ciphertexts with Alice.
    for name in ('K.wrapped.b64', 'photo.enc.b64', 'empty.enc.b64'):
        shutil.copy(bob / name, alice / name)
    out = tool('unwrap', 'alice private.pem', 'K.wrapped.b64', 'K.b64', cwd=alice)
    assert field(out, 'K') == k_text and b64(alice / 'K.b64') == k
    tool('aes-decrypt', 'K.b64', 'photo.enc.b64', 'photo.bin', cwd=alice)
    tool('aes-decrypt', 'K.b64', 'empty.enc.b64', 'empty', cwd=alice)
    assert (alice / 'photo.bin').read_bytes() == (bob / 'photo.bin').read_bytes()
    assert (alice / 'empty').exists() and (alice / 'empty').read_bytes() == b''

    # The AES file layout is IV (12) || C || tag (16), checked against another library.
    if AESGCM:
        plain = (bob / 'photo.bin').read_bytes()
        assert AESGCM(k).decrypt(raw[:12], raw[12:], None) == plain
        nonce = os.urandom(12)
        (alice / 'py.b64').write_text(
            base64.b64encode(nonce + AESGCM(k).encrypt(nonce, b'python', None)).decode())
        tool('aes-decrypt', 'K.b64', 'py.b64', 'py.txt', cwd=alice)
        assert (alice / 'py.txt').read_bytes() == b'python'

    # OpenSSL CLI interoperability in both directions (OAEP, SHA-256, MGF1-SHA-256).
    (bob / 'K.bin').write_bytes(k)
    call('openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', 'alice.pem', '-in', 'K.bin',
         '-out', 'cli.bin', *OAEP, cwd=bob)
    (alice / 'cli.b64').write_bytes(base64.b64encode((bob / 'cli.bin').read_bytes()))
    out = tool('unwrap', 'alice private.pem', 'cli.b64', 'cli-K.b64', cwd=alice)
    assert b64(alice / 'cli-K.b64') == k and field(out, 'K') == k_text
    (alice / 'ours.bin').write_bytes(wrapped)
    call('openssl', 'pkeyutl', '-decrypt', '-inkey', 'alice private.pem', '-in', 'ours.bin',
         '-out', 'ours-K.bin', *OAEP, cwd=alice)
    assert (alice / 'ours-K.bin').read_bytes() == k
    # A SHA-1 OAEP ciphertext uses a different profile and must be rejected.
    call('openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', 'alice.pem', '-in', 'K.bin',
         '-out', 'sha1.bin', '-pkeyopt', 'rsa_padding_mode:oaep', cwd=bob)
    (alice / 'sha1.b64').write_bytes(base64.b64encode((bob / 'sha1.bin').read_bytes()))
    tool('unwrap', 'alice private.pem', 'sha1.b64', 'sha1-K.b64', code=1, cwd=alice)
    assert not (alice / 'sha1-K.b64').exists()

    # Keys from the OpenSSL CLI (other approved sizes, PKCS#1 PEM) also work.
    work = Path(root) / 'work'
    work.mkdir()
    for bits in (2048, 4096):
        call('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', f'rsa_keygen_bits:{bits}',
             '-out', f'{bits}.pem', cwd=work)
        call('openssl', 'pkey', '-in', f'{bits}.pem', '-pubout', '-out', f'{bits}-pub.pem',
             cwd=work)
        check_inspect(f'{bits}.pem', work)
        tool('aes-keygen', f'{bits}-K.b64', cwd=work)
        tool('wrap', f'{bits}-pub.pem', f'{bits}-K.b64', f'{bits}-w.b64', cwd=work)
        assert len(b64(work / f'{bits}-w.b64')) == bits // 8
        tool('unwrap', f'{bits}.pem', f'{bits}-w.b64', f'{bits}-K2.b64', cwd=work)
        assert b64(work / f'{bits}-K2.b64') == b64(work / f'{bits}-K.b64')
    call('openssl', 'rsa', '-in', '2048.pem', '-traditional', '-out', 'pkcs1.pem', cwd=work)
    assert (work / 'pkcs1.pem').read_text().startswith('-----BEGIN RSA PRIVATE KEY-----')
    tool('unwrap', 'pkcs1.pem', '2048-w.b64', 'pkcs1-K.b64', cwd=work)

    # Tampering: any bit of IV, C or tag; truncated file; wrong K.
    for index, name in ((0, 'iv'), (12, 'c'), (len(raw) - 1, 'tag')):
        flip(alice / 'photo.enc.b64', index, alice / f'bad-{name}.b64')
        tool('aes-decrypt', 'K.b64', f'bad-{name}.b64', f'bad-{name}.out', code=1, cwd=alice)
        assert not (alice / f'bad-{name}.out').exists()
    flip(alice / 'empty.enc.b64', 20, alice / 'bad-empty.b64')
    tool('aes-decrypt', 'K.b64', 'bad-empty.b64', 'bad-empty.out', code=1, cwd=alice)
    assert not (alice / 'bad-empty.out').exists()
    (alice / 'short.b64').write_text(base64.b64encode(b'\0' * 27).decode())
    tool('aes-decrypt', 'K.b64', 'short.b64', 'short.out', code=1, cwd=alice)
    tool('aes-keygen', 'other-K.b64', cwd=alice)
    tool('aes-decrypt', 'other-K.b64', 'photo.enc.b64', 'other.out', code=1, cwd=alice)
    assert not (alice / 'other.out').exists()

    # Tampered or malformed wrapped keys and the wrong private key are rejected.
    for index in (0, 200, 383):
        flip(alice / 'K.wrapped.b64', index, alice / f'w{index}.b64')
        tool('unwrap', 'alice private.pem', f'w{index}.b64', f'w{index}-K.b64', code=1, cwd=alice)
        assert not (alice / f'w{index}-K.b64').exists()
    (alice / 'w-short.b64').write_text(base64.b64encode(wrapped[1:]).decode())
    tool('unwrap', 'alice private.pem', 'w-short.b64', 'ws-K.b64', code=1, cwd=alice)
    (alice / 'w-long.b64').write_text(base64.b64encode(wrapped + b'\0').decode())
    tool('unwrap', 'alice private.pem', 'w-long.b64', 'wl-K.b64', code=1, cwd=alice)
    tool('keygen', 'eve private.pem', 'eve public.pem', cwd=alice)
    tool('unwrap', 'eve private.pem', 'K.wrapped.b64', 'eve-K.b64', code=1, cwd=alice)
    assert not (alice / 'eve-K.b64').exists()
    tool('unwrap', '2048.pem', '2048-w.b64', 'x.b64', cwd=work)
    tool('unwrap', '4096.pem', '2048-w.b64', 'y.b64', code=1, cwd=work)
    # A wrapped value that encodes more than 16 bytes is not a valid K.
    (bob / 'K17.bin').write_bytes(os.urandom(17))
    call('openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', 'alice.pem', '-in', 'K17.bin',
         '-out', 'K17.w', *OAEP, cwd=bob)
    (alice / 'K17.b64').write_bytes(base64.b64encode((bob / 'K17.w').read_bytes()))
    tool('unwrap', 'alice private.pem', 'K17.b64', 'K17-K.b64', code=1, cwd=alice)
    assert not (alice / 'K17-K.b64').exists()

    # K must be exactly 16 bytes of strict Base64.
    for name, text in (('k15', base64.b64encode(b'a' * 15).decode()),
                       ('k17', base64.b64encode(b'a' * 17).decode()),
                       ('k32', base64.b64encode(b'a' * 32).decode()),
                       ('kbad', '!' * 24), ('kpad', 'AAAAAAAAAAAAAAAAAAAAAB=='),
                       ('kempty', '')):
        (bob / f'{name}.b64').write_text(text)
        tool('aes-encrypt', f'{name}.b64', 'photo.bin', f'{name}.out', code=1, cwd=bob)
        tool('wrap', 'alice.pem', f'{name}.b64', f'{name}.w', code=1, cwd=bob)
        assert not (bob / f'{name}.out').exists() and not (bob / f'{name}.w').exists()
    (bob / 'k-lines.b64').write_text(k_text[:10] + '\r\n' + k_text[10:] + '\n\n')
    tool('wrap', 'alice.pem', 'k-lines.b64', 'k-lines.w', cwd=bob)

    # Key profile checks.
    tool('wrap', 'alice private.pem', 'K.b64', 'x.w', code=1, cwd=alice)
    tool('unwrap', 'alice public.pem', 'K.wrapped.b64', 'x.k', code=1, cwd=alice)
    tool('inspect', 'alice public.pem', code=1, cwd=alice)
    call('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:1024',
         '-out', 'weak.pem', cwd=work)
    call('openssl', 'pkey', '-in', 'weak.pem', '-pubout', '-out', 'weak-pub.pem', cwd=work)
    tool('inspect', 'weak.pem', code=1, cwd=work)
    tool('wrap', 'weak-pub.pem', '2048-K.b64', 'weak.w', code=1, cwd=work)
    call('openssl', 'genpkey', '-algorithm', 'RSA-PSS', '-pkeyopt', 'rsa_keygen_bits:2048',
         '-out', 'pss.pem', cwd=work)
    call('openssl', 'pkey', '-in', 'pss.pem', '-pubout', '-out', 'pss-pub.pem', cwd=work)
    tool('wrap', 'pss-pub.pem', '2048-K.b64', 'pss.w', code=1, cwd=work)
    tool('inspect', 'pss.pem', code=1, cwd=work)
    call('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
         '-pkeyopt', 'rsa_keygen_pubexp:3', '-out', 'e3.pem', cwd=work)
    call('openssl', 'pkey', '-in', 'e3.pem', '-pubout', '-out', 'e3-pub.pem', cwd=work)
    tool('wrap', 'e3-pub.pem', '2048-K.b64', 'e3.w', code=1, cwd=work)
    call('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072',
         '-pkeyopt', 'rsa_keygen_primes:3', '-out', 'three.pem', cwd=work)
    tool('inspect', 'three.pem', code=1, cwd=work)
    call('openssl', 'genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256',
         '-out', 'ec.pem', cwd=work)
    tool('inspect', 'ec.pem', code=1, cwd=work)
    (work / 'trailing.pem').write_text((work / '2048.pem').read_text() + 'junk')
    tool('inspect', 'trailing.pem', code=1, cwd=work)
    # A private key without the CRT values (p, q, dP, dQ, qInv set to 0).
    n_d = check_inspect('2048.pem', work)
    (work / 'nocrt.cnf').write_text(
        'asn1=SEQUENCE:k\n[k]\nv=INTEGER:0\n'
        f'n=INTEGER:0x{n_d["n"]:X}\ne=INTEGER:0x{n_d["e"]:X}\nd=INTEGER:0x{n_d["d"]:X}\n'
        'p=INTEGER:0\nq=INTEGER:0\ndp=INTEGER:0\ndq=INTEGER:0\nqi=INTEGER:0\n')
    call('openssl', 'asn1parse', '-genconf', 'nocrt.cnf', '-out', 'nocrt.der', '-noout', cwd=work)
    der = (work / 'nocrt.der').read_bytes()
    body = base64.encodebytes(der).decode().replace('\n', '')
    lines = '\n'.join(body[i:i + 64] for i in range(0, len(body), 64))
    (work / 'nocrt.pem').write_text(
        f'-----BEGIN RSA PRIVATE KEY-----\n{lines}\n-----END RSA PRIVATE KEY-----\n')
    tool('inspect', 'nocrt.pem', code=1, cwd=work)
    tool('unwrap', 'nocrt.pem', '2048-w.b64', 'nocrt-K.b64', code=1, cwd=work)
    assert not (work / 'nocrt-K.b64').exists()

    # Existing files are never overwritten, and partial outputs are removed.
    before = {p.name: p.read_bytes() for p in alice.iterdir()}
    tool('keygen', 'alice private.pem', 'new public.pem', code=1, cwd=alice)
    assert not (alice / 'new public.pem').exists()
    tool('keygen', 'new private.pem', 'alice public.pem', code=1, cwd=alice)
    assert not (alice / 'new private.pem').exists()
    tool('keygen', 'same.pem', 'same.pem', code=1, cwd=alice)
    assert not (alice / 'same.pem').exists()
    tool('aes-keygen', 'K.b64', code=1, cwd=alice)
    tool('aes-encrypt', 'K.b64', 'photo.bin', 'photo.enc.b64', code=1, cwd=alice)
    tool('aes-decrypt', 'K.b64', 'photo.enc.b64', 'photo.bin', code=1, cwd=alice)
    tool('wrap', 'alice public.pem', 'K.b64', 'K.wrapped.b64', code=1, cwd=alice)
    tool('unwrap', 'alice private.pem', 'K.wrapped.b64', 'K.b64', code=1, cwd=alice)
    assert {p.name: p.read_bytes() for p in alice.iterdir()} == before
    tool('aes-keygen', 'missing-dir/K.b64', code=1, cwd=alice)
    tool('aes-encrypt', 'K.b64', 'missing', 'm.out', code=1, cwd=alice)
    assert not (alice / 'm.out').exists()

    # Input size limit: 16 MiB is accepted, one byte more is rejected.
    (work / 'K.b64').write_text(k_text + '\n')
    big = os.urandom(1 << 20) * 16
    (work / 'big.bin').write_bytes(big)
    tool('aes-encrypt', 'K.b64', 'big.bin', 'big.b64', cwd=work)
    tool('aes-decrypt', 'K.b64', 'big.b64', 'big.out', cwd=work)
    assert (work / 'big.out').read_bytes() == big
    (work / 'big1.bin').write_bytes(big + b'!')
    tool('aes-encrypt', 'K.b64', 'big1.bin', 'big1.b64', code=1, cwd=work)
    assert not (work / 'big1.b64').exists()
    # Base64 with line breaks every 76 characters is still accepted.
    (work / 'wrapped76.b64').write_bytes(base64.encodebytes(b64(work / 'big.b64')))
    tool('aes-decrypt', 'K.b64', 'wrapped76.b64', 'big76.out', cwd=work)
    assert (work / 'big76.out').read_bytes() == big

    # Wrong argument counts, unknown commands and empty file names.
    for args in ([], ['keygen'], ['keygen', 'a.pem'], ['keygen', 'a', 'b', 'c'],
                 ['inspect'], ['inspect', 'a', 'b'], ['aes-keygen'], ['aes-keygen', 'a', 'b'],
                 ['aes-encrypt', 'a', 'b'], ['aes-encrypt', 'a', 'b', 'c', 'd'],
                 ['aes-decrypt', 'a', 'b'], ['aes-decrypt', 'a', 'b', 'c', 'd'],
                 ['wrap', 'a', 'b'], ['wrap', 'a', 'b', 'c', 'd'],
                 ['unwrap', 'a', 'b'], ['unwrap', 'a', 'b', 'c', 'd'],
                 ['encrypt', 'a', 'b', 'c'], ['KEYGEN', 'a', 'b'], ['aes-keygen', '']):
        result = subprocess.run([str(EXE), *args], capture_output=True, cwd=work)
        assert result.returncode == 1 and result.stdout == b'' and result.stderr, args
    assert not (work / 'a').exists() and not (work / 'b').exists()

print('PASS: Alice/Bob flow (3072-bit CRT key, binary and empty files); openssl pkeyutl OAEP '
      'interoperability both ways; CRT components match openssl pkey -text; tampering, wrong '
      'keys, key profiles, K length, no overwrite, 16 MiB limit and argument counts.')

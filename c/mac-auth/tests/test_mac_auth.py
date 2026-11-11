"""Native tests for Lab 07, Section 2: ECDH P-256 + HKDF, HMAC challenge, AES-128-GCM."""
import base64
import hashlib
import hmac
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

EXE = Path(os.environ.get(
    'MAC_AUTH_EXE', str(Path(__file__).resolve().parents[1] / 'build/mac-auth'))).resolve()


def call(*args, code=0, cwd=None):
    result = subprocess.run([str(a) for a in args], capture_output=True, cwd=cwd)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    return result.stdout.decode()


def tool(*args, code=0, cwd=None):
    return call(EXE, *args, code=code, cwd=cwd)


def run(*args, cwd=None):
    return subprocess.run([str(EXE), *[str(a) for a in args]], capture_output=True, cwd=cwd)


def b64(path):
    return base64.b64decode(Path(path).read_text().strip(), validate=True)


def field(output, name):
    match = re.search(rf'^{re.escape(name)} = (\S+)$', output, re.M)
    assert match, (name, output)
    return match.group(1)


def write_b64(path, data):
    Path(path).write_text(base64.b64encode(data).decode() + '\n')


def hkdf(ikm, info, length, salt=b''):
    """RFC 5869 HKDF-SHA-256 (an empty salt acts as HashLen zero bytes)."""
    prk = hmac.new(salt or b'\0' * 32, ikm, hashlib.sha256).digest()
    out, block = b'', b''
    for counter in range(1, -(-length // 32) + 1):
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        out += block
    return out[:length]


# RFC 5869, Test Case 3 (SHA-256, empty salt and info) checks the reference HKDF.
assert hkdf(bytes.fromhex('0b' * 22), b'', 42).hex() == (
    '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d'
    '9d201395faa4b61a96c8')


def keygen(party, cwd):
    out = tool('keygen', f'{party} private.pem', f'{party} public.pem', cwd=cwd)
    assert out.splitlines()[0] == 'Curve = P-256', out
    point = base64.b64decode(field(out, 'Public'), validate=True)
    assert len(point) == 65 and point[0] == 4
    private_text = (cwd / f'{party} private.pem').read_text()
    public_text = (cwd / f'{party} public.pem').read_text()
    assert private_text.startswith('-----BEGIN PRIVATE KEY-----\n')
    assert public_text.startswith('-----BEGIN PUBLIC KEY-----\n')
    call('openssl', 'pkey', '-in', f'{party} private.pem', '-check', '-noout', cwd=cwd)
    text = call('openssl', 'pkey', '-pubin', '-in', f'{party} public.pem', '-text', '-noout',
                cwd=cwd)
    assert 'NIST CURVE: P-256' in text, text
    # The printed point is the one stored in the SPKI file (last 65 bytes of the DER).
    der = subprocess.run(
        ['openssl', 'pkey', '-pubin', '-in', f'{party} public.pem', '-outform', 'DER'],
        capture_output=True, cwd=cwd, check=True).stdout
    assert der[-65:] == point
    return point


def protocol(challenger, responder, root):
    """Steps 1 to 5 between two parties, each one in its own directory."""
    a_dir = root / challenger
    b_dir = root / responder
    a_dir.mkdir()
    b_dir.mkdir()
    a, b = challenger, responder

    # Step 1: key pairs, exchange of public keys only, ECDH and K = KDF(s).
    keygen(a, a_dir)
    keygen(b, b_dir)
    shutil.copy(a_dir / f'{a} public.pem', b_dir / f'{a} public.pem')
    shutil.copy(b_dir / f'{b} public.pem', a_dir / f'{b} public.pem')
    out_a = tool('derive', f'{a} private.pem', f'{b} public.pem', 'K.b64', cwd=a_dir)
    out_b = tool('derive', f'{b} private.pem', f'{a} public.pem', 'K.b64', cwd=b_dir)
    for out in (out_a, out_b):
        assert out.splitlines()[:2] == ['Curve = P-256', 'KDF = HKDF-SHA-256'], out
    s = base64.b64decode(field(out_a, 's'), validate=True)
    assert len(s) == 32 and field(out_b, 's') == field(out_a, 's')
    reference = subprocess.run(
        ['openssl', 'pkeyutl', '-derive', '-inkey', f'{a} private.pem',
         '-peerkey', f'{b} public.pem'], capture_output=True, cwd=a_dir, check=True).stdout
    assert reference == s
    k = hkdf(s, b'STIC-Lab07-K', 32)
    assert b64(a_dir / 'K.b64') == k == b64(b_dir / 'K.b64')
    assert field(out_a, 'K') == base64.b64encode(k).decode() == field(out_b, 'K')

    # Step 2: the challenger creates r and sends it.
    out = tool('challenge', 'r.b64', cwd=a_dir)
    r = b64(a_dir / 'r.b64')
    assert len(r) == 32 and field(out, 'r') == base64.b64encode(r).decode()
    assert field(out, 'rBits') == '256'
    shutil.copy(a_dir / 'r.b64', b_dir / 'r.b64')

    # Step 3: the responder answers with tau = HMAC-SHA-256_K(r).
    out = tool('respond', 'K.b64', 'r.b64', 'tau.b64', cwd=b_dir)
    tau = hmac.new(k, r, hashlib.sha256).digest()
    assert out.splitlines()[0] == 'MAC = HMAC-SHA-256'
    assert b64(b_dir / 'tau.b64') == tau and field(out, 'tau') == base64.b64encode(tau).decode()
    shutil.copy(b_dir / 'tau.b64', a_dir / 'tau.b64')

    # Step 4: the challenger computes tau' and compares.
    out = tool('check', 'K.b64', 'r.b64', 'tau.b64', cwd=a_dir)
    assert field(out, 'tau') == field(out, 'tau_prime') == base64.b64encode(tau).decode()
    assert out.splitlines()[-1] == 'Result = authenticated', out

    # Step 5: KE = KDF(tau) on both sides; files are exchanged in both directions.
    out_a = tool('session-key', 'tau.b64', 'KE.b64', cwd=a_dir)
    out_b = tool('session-key', 'tau.b64', 'KE.b64', cwd=b_dir)
    ke = hkdf(tau, b'STIC-Lab07-KE', 16)
    assert out_a.splitlines()[0] == 'KDF = HKDF-SHA-256'
    assert field(out_a, 'KE') == field(out_b, 'KE') == base64.b64encode(ke).decode()
    assert b64(a_dir / 'KE.b64') == ke == b64(b_dir / 'KE.b64')

    a_file = os.urandom(70000) + bytes(range(256)) * 9
    b_file = b'%PDF-1.7\n' + os.urandom(3000) + b'\0\xff'
    (a_dir / 'photo.png').write_bytes(a_file)
    (b_dir / 'document.pdf').write_bytes(b_file)
    (b_dir / 'empty').write_bytes(b'')
    out = tool('encrypt', 'KE.b64', 'photo.png', 'photo.enc.b64', cwd=a_dir)
    assert out.splitlines()[0] == 'Cipher = AES-128-GCM' and field(out, 'Bytes') == str(len(a_file))
    raw = b64(a_dir / 'photo.enc.b64')
    assert base64.b64decode(field(out, 'IV')) == raw[:12]
    assert len(raw) == 12 + len(a_file) + 16
    assert AESGCM(ke).decrypt(raw[:12], raw[12:], None) == a_file
    tool('encrypt', 'KE.b64', 'document.pdf', 'document.enc.b64', cwd=b_dir)
    tool('encrypt', 'KE.b64', 'empty', 'empty.enc.b64', cwd=b_dir)
    assert len(b64(b_dir / 'empty.enc.b64')) == 28
    shutil.copy(a_dir / 'photo.enc.b64', b_dir / 'photo.enc.b64')
    for name in ('document.enc.b64', 'empty.enc.b64'):
        shutil.copy(b_dir / name, a_dir / name)
    out = tool('decrypt', 'KE.b64', 'photo.enc.b64', 'photo.png', cwd=b_dir)
    assert field(out, 'Bytes') == str(len(a_file))
    assert (b_dir / 'photo.png').read_bytes() == a_file
    tool('decrypt', 'KE.b64', 'document.enc.b64', 'document.pdf', cwd=a_dir)
    assert (a_dir / 'document.pdf').read_bytes() == b_file
    out = tool('decrypt', 'KE.b64', 'empty.enc.b64', 'empty', cwd=a_dir)
    assert field(out, 'Bytes') == '0' and (a_dir / 'empty').read_bytes() == b''
    # A file encrypted by another library with KE decrypts as well.
    nonce = os.urandom(12)
    write_b64(a_dir / 'py.b64', nonce + AESGCM(ke).encrypt(nonce, b'python', None))
    tool('decrypt', 'KE.b64', 'py.b64', 'py.txt', cwd=a_dir)
    assert (a_dir / 'py.txt').read_bytes() == b'python'
    return a_dir, b_dir, k, r, tau, ke


with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)

    # Alice and Bob, then Bob (challenger) and Carol (responder) with fresh keys.
    alice, bob, k_ab, r_ab, tau_ab, ke_ab = protocol('alice', 'bob', root)
    bob2, carol, k_bc, r_bc, tau_bc, ke_bc = protocol('bob2', 'carol', root)
    assert k_ab != k_bc and tau_ab != tau_bc and ke_ab != ke_bc

    # Rejections at step 4: tampered tau, wrong K and wrong r stop the communication.
    flipped = bytearray(tau_ab)
    flipped[0] ^= 1
    write_b64(alice / 'bad tau.b64', bytes(flipped))
    write_b64(alice / 'wrong K.b64', k_bc)
    write_b64(alice / 'wrong r.b64', r_bc)
    write_b64(alice / 'carol tau.b64', tau_bc)
    for key, r, tau in (('K.b64', 'r.b64', 'bad tau.b64'), ('wrong K.b64', 'r.b64', 'tau.b64'),
                        ('K.b64', 'wrong r.b64', 'tau.b64'), ('K.b64', 'r.b64', 'carol tau.b64')):
        result = run('check', key, r, tau, cwd=alice)
        out = result.stdout.decode()
        assert result.returncode == 2, (key, r, tau, result)
        assert out.splitlines()[-1] == 'Result = rejected', out
        assert field(out, 'tau') != field(out, 'tau_prime')
        assert b'stops the communication' in result.stderr
    # Bob answering with a wrong K is detected by Alice.
    tool('respond', 'wrong K.b64', 'r.b64', 'eve tau.b64', cwd=alice)
    assert run('check', 'K.b64', 'r.b64', 'eve tau.b64', cwd=alice).returncode == 2

    # Rejections at step 5: tampered IV, ciphertext or tag, truncation and wrong KE.
    raw = b64(alice / 'photo.enc.b64')
    for index, name in ((0, 'iv'), (12, 'c'), (len(raw) - 1, 'tag')):
        bad = bytearray(raw)
        bad[index] ^= 1
        write_b64(bob / f'bad-{name}.b64', bytes(bad))
        tool('decrypt', 'KE.b64', f'bad-{name}.b64', f'bad-{name}.out', code=1, cwd=bob)
        assert not (bob / f'bad-{name}.out').exists()
    write_b64(bob / 'short.b64', raw[:27])
    tool('decrypt', 'KE.b64', 'short.b64', 'short.out', code=1, cwd=bob)
    write_b64(bob / 'carol KE.b64', ke_bc)
    tool('decrypt', 'carol KE.b64', 'photo.enc.b64', 'other.out', code=1, cwd=bob)
    assert not (bob / 'short.out').exists() and not (bob / 'other.out').exists()

    # Peer keys must be EC P-256 public keys: P-384, secp256k1, X25519, RSA and private PEM fail.
    work = root / 'work'
    work.mkdir()
    shutil.copy(alice / 'alice private.pem', work / 'alice.pem')
    shutil.copy(alice / 'alice public.pem', work / 'alice.pub')
    others = {
        'p384': ['-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-384'],
        'k256': ['-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:secp256k1'],
        'x25519': ['-algorithm', 'X25519'],
        'rsa': ['-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048'],
    }
    for name, options in others.items():
        call('openssl', 'genpkey', *options, '-out', f'{name}.pem', cwd=work)
        call('openssl', 'pkey', '-in', f'{name}.pem', '-pubout', '-out', f'{name}.pub', cwd=work)
        tool('derive', 'alice.pem', f'{name}.pub', f'{name}-K.b64', code=1, cwd=work)
        tool('derive', f'{name}.pem', 'alice.pub', f'{name}-K2.b64', code=1, cwd=work)
        assert not (work / f'{name}-K.b64').exists() and not (work / f'{name}-K2.b64').exists()
    tool('derive', 'alice.pem', 'alice.pem', 'priv-K.b64', code=1, cwd=work)
    tool('derive', 'alice.pub', 'alice.pub', 'pub-K.b64', code=1, cwd=work)
    (work / 'trailing.pub').write_text((work / 'alice.pub').read_text() + 'junk')
    tool('derive', 'alice.pem', 'trailing.pub', 'trailing-K.b64', code=1, cwd=work)
    # P-256 keys from the OpenSSL CLI (also SEC1 private PEM) are accepted.
    call('openssl', 'genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256',
         '-out', 'cli.pem', cwd=work)
    call('openssl', 'ec', '-in', 'cli.pem', '-out', 'sec1.pem', cwd=work)
    assert (work / 'sec1.pem').read_text().startswith('-----BEGIN EC PRIVATE KEY-----')
    call('openssl', 'pkey', '-in', 'cli.pem', '-pubout', '-out', 'cli.pub', cwd=work)
    out1 = tool('derive', 'alice.pem', 'cli.pub', 'cli-K.b64', cwd=work)
    out2 = tool('derive', 'sec1.pem', 'alice.pub', 'sec1-K.b64', cwd=work)
    assert field(out1, 's') == field(out2, 's') and field(out1, 'K') == field(out2, 'K')
    # A compressed public point is still P-256 and gives the same s.
    call('openssl', 'pkey', '-in', 'cli.pem', '-pubout', '-ec_conv_form', 'compressed',
         '-out', 'compressed.pub', cwd=work)
    out3 = tool('derive', 'alice.pem', 'compressed.pub', 'compressed-K.b64', cwd=work)
    assert field(out3, 's') == field(out1, 's')

    # Lengths: K 32, r 32, tau 32 and KE 16 bytes of strict Base64.
    good = {'K': k_ab, 'r': r_ab, 'tau': tau_ab, 'KE': ke_ab}
    for name, value in good.items():
        write_b64(work / f'{name}.b64', value)
    bad = {
        'short': base64.b64encode(b'a' * 15).decode(),
        'long': base64.b64encode(b'a' * 33).decode(),
        'k31': base64.b64encode(b'a' * 31).decode(),
        'k17': base64.b64encode(b'a' * 17).decode(),
        'chars': '!' * 44,
        'pad': 'AAAAAAAAAAAAAAAAAAAAAB==',
        'empty': '',
    }
    for name, text in bad.items():
        (work / f'{name}.bad').write_text(text)
        n = f'{name}.bad'
        tool('respond', n, 'r.b64', f'{name}.t1', code=1, cwd=work)
        tool('respond', 'K.b64', n, f'{name}.t2', code=1, cwd=work)
        tool('check', n, 'r.b64', 'tau.b64', code=1, cwd=work)
        tool('check', 'K.b64', n, 'tau.b64', code=1, cwd=work)
        tool('check', 'K.b64', 'r.b64', n, code=1, cwd=work)
        tool('session-key', n, f'{name}.ke', code=1, cwd=work)
        tool('encrypt', n, 'alice.pub', f'{name}.enc', code=1, cwd=work)
        for out in ('t1', 't2', 'ke', 'enc'):
            assert not (work / f'{name}.{out}').exists()
    # K and tau are not KE, and KE is not tau.
    tool('encrypt', 'K.b64', 'alice.pub', 'k.enc', code=1, cwd=work)
    tool('session-key', 'KE.b64', 'ke2.b64', code=1, cwd=work)
    # Line breaks and spaces inside Base64 are ignored.
    text = base64.b64encode(k_ab).decode()
    (work / 'K lines.b64').write_text(' ' + text[:10] + '\r\n' + text[10:] + '\n\n')
    tool('check', 'K lines.b64', 'r.b64', 'tau.b64', cwd=work)

    # Existing files are never overwritten.
    before = {p.name: p.read_bytes() for p in alice.iterdir()}
    tool('keygen', 'alice private.pem', 'new public.pem', code=1, cwd=alice)
    tool('keygen', 'new private.pem', 'alice public.pem', code=1, cwd=alice)
    tool('keygen', 'same.pem', 'same.pem', code=1, cwd=alice)
    tool('derive', 'alice private.pem', 'bob public.pem', 'K.b64', code=1, cwd=alice)
    tool('challenge', 'r.b64', code=1, cwd=alice)
    tool('respond', 'K.b64', 'r.b64', 'tau.b64', code=1, cwd=alice)
    tool('session-key', 'tau.b64', 'KE.b64', code=1, cwd=alice)
    tool('encrypt', 'KE.b64', 'photo.png', 'photo.enc.b64', code=1, cwd=alice)
    tool('decrypt', 'KE.b64', 'document.enc.b64', 'document.pdf', code=1, cwd=alice)
    after = {p.name: p.read_bytes() for p in alice.iterdir()}
    assert after == before
    tool('challenge', 'missing-dir/r.b64', code=1, cwd=alice)
    tool('encrypt', 'KE.b64', 'missing', 'm.out', code=1, cwd=alice)
    assert not (alice / 'm.out').exists()

    # Input size limit: 16 MiB is accepted, one byte more is rejected.
    big = os.urandom(1 << 20) * 16
    (work / 'big.bin').write_bytes(big)
    tool('encrypt', 'KE.b64', 'big.bin', 'big.b64', cwd=work)
    tool('decrypt', 'KE.b64', 'big.b64', 'big.out', cwd=work)
    assert (work / 'big.out').read_bytes() == big
    (work / 'big1.bin').write_bytes(big + b'!')
    tool('encrypt', 'KE.b64', 'big1.bin', 'big1.b64', code=1, cwd=work)
    assert not (work / 'big1.b64').exists()

    # A failed stdout write (full disk) is an error and leaves no output file.
    if Path('/dev/full').exists():
        def full(*args):
            with open('/dev/full', 'wb') as sink:
                return subprocess.run([str(EXE), *args], stdout=sink,
                                      stderr=subprocess.PIPE, cwd=work).returncode
        assert full('keygen', 'full.pem', 'full.pub') == 1
        assert full('derive', 'alice.pem', 'cli.pub', 'full-K.b64') == 1
        assert full('challenge', 'full-r.b64') == 1
        assert full('respond', 'K.b64', 'r.b64', 'full-tau.b64') == 1
        assert full('check', 'K.b64', 'r.b64', 'tau.b64') == 1
        assert full('session-key', 'tau.b64', 'full-KE.b64') == 1
        assert full('encrypt', 'KE.b64', 'big.bin', 'full.b64') == 1
        assert full('decrypt', 'KE.b64', 'big.b64', 'full.out') == 1
        assert not list(work.glob('full*'))

    # Wrong argument counts, unknown commands and empty file names.
    for args in ([], ['keygen'], ['keygen', 'a'], ['keygen', 'a', 'b', 'c'],
                 ['derive', 'a', 'b'], ['derive', 'a', 'b', 'c', 'd'],
                 ['challenge'], ['challenge', 'a', 'b'],
                 ['respond', 'a', 'b'], ['respond', 'a', 'b', 'c', 'd'],
                 ['check', 'a', 'b'], ['check', 'a', 'b', 'c', 'd'],
                 ['session-key', 'a'], ['session-key', 'a', 'b', 'c'],
                 ['encrypt', 'a', 'b'], ['encrypt', 'a', 'b', 'c', 'd'],
                 ['decrypt', 'a', 'b'], ['decrypt', 'a', 'b', 'c', 'd'],
                 ['mac', 'a', 'b', 'c'], ['KEYGEN', 'a', 'b'], ['challenge', '']):
        result = run(*args, cwd=work)
        assert result.returncode == 1 and result.stdout == b'' and result.stderr, args
    assert not (work / 'a').exists() and not (work / 'b').exists()

print('PASS: Alice/Bob and Bob/Carol flows (s matches openssl pkeyutl -derive; K, tau and KE '
      'match Python HKDF/HMAC; AES-128-GCM files checked with cryptography); tampered tau, '
      'wrong K or r rejected with exit 2; tampered ciphertexts, non-P-256 keys, lengths, '
      'no overwrite, 16 MiB limit, failed stdout writes and argument counts.')

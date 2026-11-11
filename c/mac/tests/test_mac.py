"""Native tests for Lab 07, Section 1: HMAC-SHA-256 and CMAC-AES-128 over files."""
import base64
import hashlib
import hmac
import os
from pathlib import Path
import re
import subprocess
import tempfile

EXE = Path(os.environ.get(
    'MAC_EXE', str(Path(__file__).resolve().parents[1] / 'build/mac'))).resolve()
LABEL = {'hmac': 'HMAC-SHA-256', 'cmac': 'CMAC-AES-128'}
KEY_BYTES = {'hmac': 32, 'cmac': 16}

try:
    from cryptography.hazmat.primitives import cmac as py_cmac
    from cryptography.hazmat.primitives.ciphers import algorithms
except ImportError:  # The Python CMAC cross-check is optional.
    py_cmac = None


def call(*args, code=0, cwd=None):
    result = subprocess.run([str(a) for a in args], capture_output=True, cwd=cwd)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    return result


def tool(*args, code=0, cwd=None):
    result = call(EXE, *args, code=code, cwd=cwd)
    if code == 1:  # Errors print nothing on stdout and explain themselves on stderr.
        assert result.stdout == b'' and result.stderr, (args, result)
    return result.stdout.decode()


def b64(path):
    return base64.b64decode(Path(path).read_text().strip(), validate=True)


def put_b64(path, raw):
    Path(path).write_text(base64.b64encode(raw).decode() + '\n')


def fields(output):
    return dict(re.findall(r'^(\w+) = (.*)$', output, re.M))


def reference(algorithm, key, data):
    if algorithm == 'hmac':
        return hmac.new(key, data, hashlib.sha256).digest()
    if py_cmac is None:
        return None
    mac = py_cmac.CMAC(algorithms.AES(key))
    mac.update(data)
    return mac.finalize()


def openssl_mac(algorithm, key, path):
    option = ['-digest', 'SHA256'] if algorithm == 'hmac' else ['-cipher', 'AES-128-CBC']
    out = call('openssl', 'mac', *option, '-macopt', f'hexkey:{key.hex()}', '-in', path,
               algorithm.upper()).stdout.decode().strip()
    return bytes.fromhex(out)


def tag_and_verify(algorithm, key_name, file_name, tag_name, cwd):
    data = (Path(cwd) / file_name).read_bytes()
    out = fields(tool('tag', algorithm, key_name, file_name, tag_name, cwd=cwd))
    tag = b64(Path(cwd) / tag_name)
    assert out == {'Algorithm': LABEL[algorithm], 'File': file_name, 'Bytes': str(len(data)),
                   'TagBits': str(len(tag) * 8), 'Tag': base64.b64encode(tag).decode()}, out
    out = fields(tool('verify', algorithm, key_name, file_name, tag_name, cwd=cwd))
    assert out['Result'] == 'valid' and out['Expected'] == out['Computed'] == \
        base64.b64encode(tag).decode() and out['Bytes'] == str(len(data)), out
    return tag


with tempfile.TemporaryDirectory() as root:
    work = Path(root)

    # Key generation: length, Base64 file and exact stdout lines.
    for algorithm, bits in (('hmac', 256), ('cmac', 128)):
        out = tool('keygen', algorithm, f'{algorithm} key.b64', cwd=work)
        key = b64(work / f'{algorithm} key.b64')
        assert len(key) * 8 == bits
        assert (work / f'{algorithm} key.b64').read_text() == base64.b64encode(key).decode() + '\n'
        assert out.splitlines() == [f'Algorithm = {LABEL[algorithm]}', f'KeyBits = {bits}',
                                    f'Key = {base64.b64encode(key).decode()}'], out
        tool('keygen', algorithm, f'{algorithm} key2.b64', cwd=work)
        assert b64(work / f'{algorithm} key2.b64') != key  # Fresh random keys.

    # CMAC-AES-128 known answers: NIST SP 800-38B, Appendix D.1 (Examples 1-4).
    message = bytes.fromhex(
        '6bc1bee22e409f96e93d7e117393172a' 'ae2d8a571e03ac9c9eb76fac45af8e51'
        '30c81c46a35ce411e5fbc1191a0a52ef' 'f69f2445df4f9b17ad2b417be66c3710')
    put_b64(work / 'nist.b64', bytes.fromhex('2b7e151628aed2a6abf7158809cf4f3c'))
    for length, expected in ((0, 'bb1d6929e95937287fa37d129b756746'),
                             (16, '070a16b46b4d4144f79bdd9dd04a287c'),
                             (40, 'dfa66747de9ae63030ca32611497c827'),
                             (64, '51f0bebf7e3b9d92fc49741779363cfe')):
        (work / f'm{length}').write_bytes(message[:length])
        tag = tag_and_verify('cmac', 'nist.b64', f'm{length}', f'm{length}.tag', work)
        assert tag.hex() == expected, (length, tag.hex())

    # HMAC-SHA-256: the RFC 4231 keys (20, 4, 25 and 131 bytes) are not 256-bit keys,
    # so they are rejected; the reference implementations are checked against RFC 4231.
    rfc4231 = (
        (b'\x0b' * 20, b'Hi There',
         'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'),
        (b'Jefe', b'what do ya want for nothing?',
         '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'),
        (bytes(range(1, 26)), b'\xcd' * 50,
         '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b'),
        (b'\xaa' * 131, b'Test Using Larger Than Block-Size Key - Hash Key First',
         '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'))
    for index, (key, data, expected) in enumerate(rfc4231):
        assert reference('hmac', key, data).hex() == expected
        (work / f'rfc{index}').write_bytes(data)
        assert openssl_mac('hmac', key, work / f'rfc{index}').hex() == expected
        put_b64(work / f'rfc{index}.key', key)
        tool('tag', 'hmac', f'rfc{index}.key', f'rfc{index}', f'rfc{index}.tag', code=1, cwd=work)
        assert not (work / f'rfc{index}.tag').exists()

    # Random keys and files (empty, small, 3 MiB binary) against Python and the OpenSSL CLI.
    (work / 'empty').write_bytes(b'')
    (work / 'small.txt').write_bytes(b'Selected Topics in Cryptography\n')
    (work / 'big.bin').write_bytes(os.urandom(3 << 20) + bytes(range(256)))
    (work / 'odd.bin').write_bytes(os.urandom(65537))  # Crosses the 64 KiB chunk boundary.
    for algorithm in ('hmac', 'cmac'):
        for trial in range(3):
            name = f'{algorithm}-{trial}.key'
            if trial == 0:
                tool('keygen', algorithm, name, cwd=work)
            else:
                put_b64(work / name, os.urandom(KEY_BYTES[algorithm]))
            key = b64(work / name)
            for file in ('empty', 'small.txt', 'big.bin', 'odd.bin'):
                tag = tag_and_verify(algorithm, name, file, f'{file}.{name}.tag', work)
                data = (work / file).read_bytes()
                ref = reference(algorithm, key, data)
                if ref is not None:
                    assert tag == ref, (algorithm, file)
                assert tag == openssl_mac(algorithm, key, work / file), (algorithm, file)

    # Tampering: one file bit, one tag bit, wrong key -> Result = invalid, exit 2.
    for algorithm in ('hmac', 'cmac'):
        key = f'{algorithm}-0.key'
        tag = f'big.bin.{key}.tag'
        data = bytearray((work / 'big.bin').read_bytes())
        for index in (0, len(data) // 2, len(data) - 1):
            data[index] ^= 1
            (work / 'changed.bin').write_bytes(data)
            data[index] ^= 1
            out = fields(tool('verify', algorithm, key, 'changed.bin', tag, code=2, cwd=work))
            assert out['Result'] == 'invalid' and out['Expected'] != out['Computed'], out
        (work / 'longer.bin').write_bytes(bytes(data) + b'\0')
        tool('verify', algorithm, key, 'longer.bin', tag, code=2, cwd=work)
        raw = b64(work / tag)
        for index in (0, len(raw) - 1):
            bad = bytearray(raw)
            bad[index] ^= 0x80
            put_b64(work / f'{algorithm}-bad.tag', bytes(bad))
            out = fields(tool('verify', algorithm, key, 'big.bin', f'{algorithm}-bad.tag',
                              code=2, cwd=work))
            assert out['Expected'] == base64.b64encode(bytes(bad)).decode()
            (work / f'{algorithm}-bad.tag').unlink()
        tool('verify', algorithm, f'{algorithm}-1.key', 'big.bin', tag, code=2, cwd=work)
        # The tag of the empty file does not authenticate another file.
        tool('verify', algorithm, key, 'small.txt', f'empty.{key}.tag', code=2, cwd=work)

    # Keys and tags of the other algorithm, or of the wrong length, are errors (exit 1).
    tool('tag', 'hmac', 'cmac-0.key', 'small.txt', 'x.tag', code=1, cwd=work)
    tool('tag', 'cmac', 'hmac-0.key', 'small.txt', 'x.tag', code=1, cwd=work)
    tool('verify', 'hmac', 'cmac-0.key', 'small.txt', 'small.txt.hmac-0.key.tag', code=1, cwd=work)
    tool('verify', 'cmac', 'hmac-0.key', 'small.txt', 'small.txt.cmac-0.key.tag', code=1, cwd=work)
    tool('verify', 'hmac', 'hmac-0.key', 'small.txt', 'small.txt.cmac-0.key.tag', code=1, cwd=work)
    tool('verify', 'cmac', 'cmac-0.key', 'small.txt', 'small.txt.hmac-0.key.tag', code=1, cwd=work)
    hkey = b64(work / 'hmac-0.key')
    htag = b64(work / 'small.txt.hmac-0.key.tag')
    for name, raw in (('t31', htag[:31]), ('t33', htag + b'\0'), ('t16', htag[:16])):
        put_b64(work / name, raw)
        tool('verify', 'hmac', 'hmac-0.key', 'small.txt', name, code=1, cwd=work)
    for name, raw in (('k31', hkey[:31]), ('k33', hkey + b'\0'), ('k1', b'\1'),
                      ('k64', os.urandom(64)), ('k3k', os.urandom(3000))):
        put_b64(work / name, raw)
        tool('tag', 'hmac', name, 'small.txt', f'{name}.tag', code=1, cwd=work)
        tool('verify', 'hmac', name, 'small.txt', 'small.txt.hmac-0.key.tag', code=1, cwd=work)
        assert not (work / f'{name}.tag').exists()

    # Strict Base64 files: canonical padding only, whitespace ignored, 4 KiB limit.
    text = base64.b64encode(hkey).decode()
    for name, content in (('bad-chars', '!' * 44), ('bad-pad', text[:-2] + 'B='),
                          ('no-pad', text.rstrip('=')), ('empty.key', ''), ('blank', ' \n\n'),
                          ('big.key', text + ' ' * 4096), ('binary', hkey)):
        if isinstance(content, bytes):
            (work / name).write_bytes(content)
        else:
            (work / name).write_text(content)
        tool('tag', 'hmac', name, 'small.txt', f'{name}.tag', code=1, cwd=work)
        assert not (work / f'{name}.tag').exists()
    (work / 'lines.key').write_text(' ' + text[:10] + '\r\n' + text[10:] + '\n\n')
    tool('tag', 'hmac', 'lines.key', 'small.txt', 'lines.tag', cwd=work)
    assert b64(work / 'lines.tag') == htag
    (work / 'lines.tag2').write_text('\t' + base64.b64encode(htag).decode()[:7] + '\n' +
                                     base64.b64encode(htag).decode()[7:])
    tool('verify', 'hmac', 'hmac-0.key', 'small.txt', 'lines.tag2', cwd=work)

    # Existing files are never overwritten; failed commands leave no output.
    before = {p.name: p.read_bytes() for p in work.iterdir() if p.name != 'big.bin'}
    tool('keygen', 'hmac', 'hmac-0.key', code=1, cwd=work)
    tool('keygen', 'cmac', 'small.txt', code=1, cwd=work)
    tool('tag', 'hmac', 'hmac-0.key', 'small.txt', 'small.txt.hmac-0.key.tag', code=1, cwd=work)
    tool('tag', 'hmac', 'hmac-0.key', 'small.txt', 'small.txt', code=1, cwd=work)
    tool('tag', 'hmac', 'hmac-0.key', 'small.txt', 'hmac-0.key', code=1, cwd=work)
    assert {p.name: p.read_bytes() for p in work.iterdir() if p.name != 'big.bin'} == before
    tool('keygen', 'hmac', 'missing-dir/k.b64', code=1, cwd=work)
    # The message names the real cause: an existing file or a missing folder.
    result = call(EXE, 'keygen', 'hmac', 'hmac-0.key', code=1, cwd=work)
    assert b'already exists' in result.stderr, result.stderr
    result = call(EXE, 'tag', 'hmac', 'hmac-0.key', 'small.txt', 'missing-dir/t', code=1, cwd=work)
    assert b'already exists' not in result.stderr and b'missing-dir/t' in result.stderr, result.stderr
    tool('tag', 'hmac', 'hmac-0.key', 'missing', 'missing.tag', code=1, cwd=work)
    tool('tag', 'hmac', 'missing.key', 'small.txt', 'missing.tag', code=1, cwd=work)
    tool('verify', 'hmac', 'hmac-0.key', 'missing', 'small.txt.hmac-0.key.tag', code=1, cwd=work)
    tool('verify', 'hmac', 'hmac-0.key', 'small.txt', 'missing.tag', code=1, cwd=work)
    (work / 'folder').mkdir()
    tool('tag', 'hmac', 'hmac-0.key', 'folder', 'folder.tag', code=1, cwd=work)
    assert not (work / 'missing.tag').exists() and not (work / 'folder.tag').exists()

    # Wrong argument counts, unknown commands or algorithms and empty arguments.
    for args in ([], ['keygen'], ['keygen', 'hmac'], ['keygen', 'hmac', 'a', 'b'],
                 ['keygen', 'kmac', 'a'], ['keygen', 'HMAC', 'a'], ['keygen', '', 'a'],
                 ['keygen', 'hmac', ''], ['tag', 'hmac', 'a', 'b'],
                 ['tag', 'hmac', 'a', 'b', 'c', 'd'], ['tag', 'sha256', 'hmac-0.key', 'small.txt', 'a'],
                 ['verify', 'hmac', 'a', 'b'], ['verify', 'gmac', 'cmac-0.key', 'small.txt', 'a'],
                 ['sign', 'hmac', 'a', 'b', 'c'], ['KEYGEN', 'hmac', 'a']):
        result = subprocess.run([str(EXE), *args], capture_output=True, cwd=work)
        assert result.returncode == 1 and result.stdout == b'' and result.stderr, args
    assert not (work / 'a').exists() and not (work / 'b').exists()

print('PASS: keygen (256/128-bit keys); CMAC-AES-128 NIST SP 800-38B D.1 vectors; HMAC-SHA-256 '
      'and CMAC against Python and openssl mac (empty, 64 KiB+1 and 3 MiB files); tampered '
      'file/tag and wrong key -> invalid (exit 2); other-algorithm keys, tag lengths, strict '
      'Base64, no overwrite and argument errors -> exit 1.')

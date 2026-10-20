import base64
import os
from pathlib import Path
import subprocess
import tempfile

EXE = Path(os.environ.get('RSA_PSS_EXE', str(Path(__file__).resolve().parents[1] / 'build/rsa-pss'))).resolve()

def call(*args, code=0):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    assert result.returncode == code, (args, result.returncode, result.stdout, result.stderr)
    return result.stdout

with tempfile.TemporaryDirectory() as directory:
    os.chdir(directory)
    Path('message file.bin').write_bytes(bytes(range(256)) * 41)
    Path('empty').write_bytes(b'')
    for bits in (2048, 3072, 4096):
        private, public = f'{bits} private.pem', f'{bits} public.pem'
        call(EXE, 'keygen', bits, private, public)
        call('openssl', 'pkey', '-in', private, '-check', '-noout')
        for message in ('message file.bin', 'empty'):
            signature = f'{bits}-{message}.b64'
            call(EXE, 'sign', private, message, signature)
            assert call(EXE, 'verify', public, message, signature).strip() == 'true'
            raw = base64.b64decode(Path(signature).read_text(), validate=False)
            assert len(raw) == bits // 8
            Path('sig.bin').write_bytes(raw)
            opts = ['-sigopt', 'rsa_padding_mode:pss', '-sigopt', 'rsa_pss_saltlen:32', '-sigopt', 'rsa_mgf1_md:sha256']
            call('openssl', 'dgst', '-sha256', '-verify', public, '-signature', 'sig.bin', *opts, message)
            call('openssl', 'dgst', '-sha256', '-sign', private, '-out', 'cli.bin', *opts, message)
            Path('cli.b64').write_bytes(base64.b64encode(Path('cli.bin').read_bytes()))
            call(EXE, 'verify', public, message, 'cli.b64')
            Path('modified').write_bytes(Path(message).read_bytes() + b'!')
            assert call(EXE, 'verify', public, 'modified', signature, code=2).strip() == 'false'
        call(EXE, 'sign', private, 'empty', f'{bits}-second.b64')
        assert Path(f'{bits}-empty.b64').read_bytes() != Path(f'{bits}-second.b64').read_bytes()
        before = Path(private).read_bytes()
        call(EXE, 'keygen', bits, private, 'new.pem', code=1)
        assert Path(private).read_bytes() == before and not Path('new.pem').exists()
        call(EXE, 'keygen', bits, 'temporary.pem', public, code=1)
        assert not Path('temporary.pem').exists()
        call(EXE, 'sign', private, 'empty', f'{bits}-empty.b64', code=1)
        for salt in (0, 33):
            call('openssl', 'dgst', '-sha256', '-sign', private, '-out', 'other.bin', '-sigopt', 'rsa_padding_mode:pss', '-sigopt', f'rsa_pss_saltlen:{salt}', 'empty')
            Path('other.b64').write_bytes(base64.b64encode(Path('other.bin').read_bytes()))
            call(EXE, 'verify', public, 'empty', 'other.b64', code=2)
    call(EXE, 'verify', '3072 public.pem', 'empty', '2048-empty.b64', code=2)
    for text in ('', '!!!!', 'AAAA=', 'A' * 3000, 'AA=A', 'AB=='):
        Path('bad.b64').write_text(text)
        call(EXE, 'verify', '2048 public.pem', 'empty', 'bad.b64', code=1)
    call(EXE, 'sign', '2048 public.pem', 'empty', 'no.b64', code=1)
    call(EXE, 'sign', '2048 private.pem', 'missing', 'no.b64', code=1)
    call(EXE, 'keygen', 1024, 'weak.pem', 'weak-public.pem', code=1)
    call(EXE, 'keygen', 2048, 'same.pem', 'same.pem', code=1)
    call('openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:1024', '-out', 'weak.pem')
    call(EXE, 'sign', 'weak.pem', 'empty', 'no.b64', code=1)
    Path('trailing.pem').write_bytes(Path('2048 private.pem').read_bytes() + b'junk')
    call(EXE, 'sign', 'trailing.pem', 'empty', 'no.b64', code=1)
print('PASS: 2048/3072/4096; native/OpenSSL interoperability; binary/empty/modified files; PSS profile and input rejection.')

"""Compare the C executable against independent exhaustive enumeration."""
import re
import subprocess
import tempfile
from pathlib import Path

BINARY = Path(__file__).resolve().parents[1] / 'build/elliptic-curve'

def run(*args):
    return subprocess.run([str(BINARY), *map(str, args)], capture_output=True, text=True)

def points(text):
    return [tuple(map(int, match)) for match in re.findall(r'^\((\d+), (\d+), (\d+)\)$', text, re.M)]

for p in [5, 7, 11, 17, 97]:
    result = run('qr', p)
    assert result.returncode == 0, result.stderr
    actual = {int(r): list(map(int, ys.split(', '))) for r, ys in
              re.findall(r'^(\d+) -> \{([^}]+)\}', result.stdout, re.M)}
    expected = {}
    for y in range(p):
        expected.setdefault(y*y % p, []).append(y)
    assert actual == expected, (p, actual, expected)

count = 0
with tempfile.TemporaryDirectory() as tmp:
    output = Path(tmp) / 'points.txt'
    for p in [5, 7, 11, 17]:
        for a in range(p):
            for b in range(p):
                if (4*a**3 + 27*b*b) % p == 0:
                    continue
                result = run('curve', p, a, b, output)
                assert result.returncode == 0, result.stderr
                actual = points(result.stdout)
                expected = {(x, y, 1) for x in range(p) for y in range(p)
                            if (y*y-x**3-a*x-b) % p == 0} | {(0, 1, 0)}
                assert set(actual) == expected, (p, a, b)
                assert len(actual) == len(expected), 'Duplicate points'
                assert f'Total points (including infinity): {len(expected)}' in result.stdout
                text = output.read_text()
                assert text == result.stdout.split('Saved to:')[0]
                assert text.startswith(f'p = {p}\na = {a}\nb = {b}\n')
                count += 1
    assert run('curve', 7, 2, 3, Path(tmp)/'missing'/'points.txt').returncode != 0
    output.write_text('existing result')
    assert run('curve', 7, 0, 0, output).returncode != 0
    assert output.read_text() == 'existing result', 'Invalid input must not overwrite output'

for args in [(), ('qr', 3), ('qr', 4), ('qr', '-7'), ('qr', '7x'),
             ('qr', '4294967296'), ('curve', 7, 0, 0), ('curve', 7, 7, 1),
             ('curve', 7, 1, 7), ('curve', 7, 1), ('unknown', 7)]:
    assert run(*args).returncode != 0, args

print(f'PASS: 5 residue tables, {count} nonsingular curves, input and file errors.')

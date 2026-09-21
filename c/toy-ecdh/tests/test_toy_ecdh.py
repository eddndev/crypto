"""Independent integer oracle for the C implementation and its complete traces."""
import json
import os
from pathlib import Path
import random
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
BINARY = Path(os.environ.get("TOY_ECDH_BINARY", ROOT / "build/toy-ecdh"))
O = (0, 1, 0)
sys.setrecursionlimit(5000)
CASES = [
    (17, 2, 2, (5, 1, 1), 13),
    (97, 2, 3, (3, 6, 1), 11),
    (23, 1, 1, (3, 10, 1), 9),
    (127, 1, 7, (1, 3, 1), 29),
    (5, 1, 0, (0, 0, 1), 6),
]


def add(p, a, point1, point2):
    if point1 == O:
        return point2
    if point2 == O:
        return point1
    x1, y1, _ = point1
    x2, y2, _ = point2
    if x1 == x2 and (y1 + y2) % p == 0:
        return O
    numerator = 3*x1*x1 + a if point1 == point2 else y2 - y1
    denominator = 2*y1 if point1 == point2 else x2 - x1
    slope = numerator * pow(denominator, -1, p) % p
    x3 = (slope*slope - x1 - x2) % p
    return (x3, (slope*(x1 - x3) - y1) % p, 1)


def multiply(p, a, k, point):
    # A recursive oracle, separate from either iterative C implementation.
    if k == 0:
        return O
    half = multiply(p, a, k // 2, point)
    result = add(p, a, half, half)
    return add(p, a, result, point) if k % 2 else result


def run(*args, success=True):
    result = subprocess.run([str(BINARY), *map(str, args)], capture_output=True, text=True)
    if (result.returncode == 0) != success:
        raise AssertionError(f"{args}: {result.returncode}\n{result.stdout}\n{result.stderr}")
    return result.stdout


def parse_point(output, label="kP"):
    match = re.search(rf"^{re.escape(label)} = \((\d+), (\d+), ([01])\)$", output, re.M)
    assert match, output
    return tuple(map(int, match.groups()))


def probable_prime(n):
    # Fixed independent witnesses make fixture generation reproducible.
    witnesses = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53)
    if any(n % base == 0 for base in witnesses):
        return n in witnesses
    d, twos = n - 1, 0
    while d % 2 == 0:
        d //= 2
        twos += 1
    for base in witnesses:
        x = pow(base, d, n)
        if x in (1, n-1):
            continue
        for _ in range(twos-1):
            x = x*x % n
            if x == n-1:
                break
        else:
            return False
    return True


def large_cases():
    fixtures = []
    for bits, offset in ((128, 159), (256, 189), (512, 569), (1024, 105)):
        p = 2**bits - offset
        assert probable_prime(p)
        x1, y1 = p//3, p//7
        a = 1
        b = (y1*y1-x1**3-a*x1) % p
        assert (4*a**3+27*b*b) % p
        # Both secrets exercise the complete requested width.
        fixtures.append(dict(bits=bits, p=str(p), a=str(a), b=str(b),
                             G=[str(x1), str(y1), "1"],
                             r=str(2**(bits-1)+13), s=str(2**(bits-1)+29)))
    return fixtures


class ToyEcdhTests(unittest.TestCase):
    def test_five_complete_traces(self):
        for p, a, b, point, k in CASES:
            expected = O
            for _ in range(k):
                expected = add(p, a, expected, point)
            for method in ("rtl", "ltr"):
                with self.subTest(p=p, k=k, method=method):
                    output = run("multiply", method, p, a, b, k, *point, "trace")
                    self.assertEqual(parse_point(output), expected)
                    steps = re.findall(r"step=(\d+) i=(\d+) bit=(\d+) Q=\((\d+), (\d+), ([01])\) P=\((\d+), (\d+), ([01])\)", output)
                    indices = list(range(k.bit_length()))
                    if method == "ltr":
                        indices.reverse()
                    self.assertEqual(len(steps), len(indices))
                    for iteration, (index, step) in enumerate(zip(indices, steps), 1):
                        values = tuple(map(int, step))
                        self.assertEqual(values[:3], (iteration, index, (k >> index) & 1))
                        partial = k % 2**(index+1) if method == "rtl" else k >> index
                        working = multiply(p, a, 2**(index+1), point) if method == "rtl" else point
                        self.assertEqual(values[3:6], multiply(p, a, partial, point))
                        self.assertEqual(values[6:], working)

    def test_random_and_boundary_scalars(self):
        rng = random.Random(20260915)
        for p, a, b, point, _ in CASES:
            scalars = [0, 1, 2, 2**31, 2**32+1, 2**64-1, 2**2048-1]
            scalars += [rng.randrange(200) for _ in range(8)]
            for k in scalars:
                for method in ("rtl", "ltr"):
                    expected = multiply(p, a, k, point) if k.bit_length() < 1000 else None
                    if expected is None:
                        # Determine the small group order before reducing this huge scalar.
                        order, acc = 1, point
                        while acc != O:
                            acc = add(p, a, acc, point)
                            order += 1
                        expected = multiply(p, a, k % order, point)
                    self.assertEqual(parse_point(run("multiply", method, p, a, b, k, *point)), expected)
            for method in ("rtl", "ltr"):
                self.assertEqual(parse_point(run("multiply", method, p, a, b, 15, *O)), O)

    def test_ecdh_roles_and_random_keys(self):
        p, a, b, point, r, s = 127, 1, 7, (1, 3, 1), 13, 29
        output = run("demo", p, a, b, *point, r, s)
        expected = multiply(p, a, r*s, point)
        for label in ("K_A", "K_B"):
            self.assertEqual(parse_point(output, label), expected)
        for role, secret, public_label, shared_label, peer in (
            ("alice", r, "A", "K_A", multiply(p, a, s, point)),
            ("bob", s, "B", "K_B", multiply(p, a, r, point)),
        ):
            for method in ("rtl", "ltr"):
                self.assertEqual(parse_point(run("public", role, method, p, a, b, secret, *point), public_label), multiply(p, a, secret, point))
                self.assertEqual(parse_point(run("shared", role, method, p, a, b, secret, *peer), shared_label), expected)
                generated = run("keygen", role, method, p, a, b, *point, 42)
                name = "r" if role == "alice" else "s"
                private = int(re.search(rf"^{name} = (\d+)$", generated, re.M)[1])
                self.assertTrue(0 < private < p)
                self.assertEqual(parse_point(generated, public_label), multiply(p, a, private, point))
                self.assertNotEqual(parse_point(generated, public_label), O)

    def test_large_fields_and_full_width_secrets(self):
        for fixture in large_cases():
            p, a, b, r, s = (int(fixture[name]) for name in ("p", "a", "b", "r", "s"))
            point = tuple(map(int, fixture["G"]))
            with self.subTest(bits=fixture["bits"]):
                output = run("demo", p, a, b, *point, r, s)
                public_a = multiply(p, a, r, point)
                public_b = multiply(p, a, s, point)
                expected = multiply(p, a, r, public_b)
                self.assertEqual(parse_point(output, "A"), public_a)
                self.assertEqual(parse_point(output, "B"), public_b)
                self.assertEqual(parse_point(output, "K_A"), expected)
                self.assertEqual(parse_point(output, "K_B"), expected)

    def test_rejected_inputs(self):
        commands = [
            [], ["unknown"], ["multiply"],
            ["multiply", "other", 17, 2, 2, 13, 5, 1, 1],
            ["multiply", "rtl", 15, 2, 2, 13, 5, 1, 1],
            ["multiply", "rtl", 17, 0, 0, 13, 5, 1, 1],
            ["multiply", "rtl", 17, 17, 2, 13, 5, 1, 1],
            ["multiply", "rtl", 17, 2, 2, 13, 0, 0, 1],
            ["multiply", "rtl", 17, 2, 2, 13, 5, 1, 2],
            ["multiply", "rtl", 17, 2, 2, 13, 0, 0, 0],
            ["multiply", "rtl", 17, 2, 2, -1, 5, 1, 1],
            ["multiply", "rtl", 17, 2, 2, "1x", 5, 1, 1],
            ["multiply", "rtl", 17, 2, 2, 2**2048, 5, 1, 1],
            ["multiply", "rtl", 17, 2, 2, 1, 5, 1, 1, "extra"],
            ["demo", 17, 2, 2, 5, 1, 1, 2, 3],
            ["demo", 127, 1, 7, 1, 3, 1, 0, 29],
            ["demo", 127, 1, 7, 1, 3, 1, 127, 29],
            ["demo", 127, 1, 7, 1, 3, 1, 109, 29],
            ["demo", 127, 1, 7, 0, 1, 0, 13, 29],
            ["keygen", "eve", "rtl", 127, 1, 7, 1, 3, 1],
            ["keygen", "alice", "rtl", 127, 1, 7, 1, 3, 1, 2**32],
        ]
        for command in commands:
            with self.subTest(command=command):
                run(*command, success=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)

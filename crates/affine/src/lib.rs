use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize, Debug)]
pub struct ComputeResult {
    pub alpha: i64,
    pub beta: i64,
    pub n: i64,
    pub remainders: Vec<i64>,
    pub quotients: Vec<i64>,
    pub gcd: i64,
    pub coprime: bool,
    pub inverse: Option<i64>,
    pub back_sub: Option<BackSub>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BackSub {
    pub init_lo: usize,
    pub init_c_a: i64,
    pub init_c_b: i64,
    pub steps: Vec<BackSubStep>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BackSubStep {
    pub lo: usize,
    pub q_sub: i64,
    pub c_a_old: i64,
    pub c_b_old: i64,
    pub c_a_new: i64,
    pub c_b_new: i64,
    pub new_lo: usize,
}

/// Floor division matching JavaScript's `Math.floor(a / b)`.
fn floor_div(a: i64, b: i64) -> i64 {
    let d = a / b;
    let r = a % b;
    if r != 0 && ((r ^ b) < 0) {
        d - 1
    } else {
        d
    }
}

/// Compute the modular multiplicative inverse of `a` mod `n`
/// using the Extended Euclidean Algorithm.
fn mod_inverse(a: i64, n: i64) -> i64 {
    let (mut r0, mut r1) = (n, a);
    let (mut t0, mut t1): (i64, i64) = (0, 1);

    while r1 != 0 {
        let q = floor_div(r0, r1);
        let tmp_r = r1;
        r1 = r0 - q * r1;
        r0 = tmp_r;
        let tmp_t = t1;
        t1 = t0 - q * t1;
        t0 = tmp_t;
    }

    ((t0 % n) + n) % n
}

/// Compute the Extended Euclidean Algorithm for the affine cipher.
///
/// Takes parameters α (alpha), β (beta), and n (modulus).
/// Returns a JSON string containing all computation results:
/// remainders, quotients, GCD, coprimality, modular inverse,
/// and back-substitution steps.
#[wasm_bindgen]
pub fn compute(alpha: i64, beta: i64, n: i64) -> Result<String, String> {
    if n <= 0 {
        return Err("n must be greater than 0".into());
    }

    // --- Euclidean divisions ---
    let mut remainders = vec![n, alpha];
    let mut quotients: Vec<i64> = Vec::new();
    let (mut a, mut b) = (n, alpha);

    while b != 0 {
        let q = floor_div(a, b);
        let r = a - q * b;
        quotients.push(q);
        remainders.push(r);
        a = b;
        b = r;
    }

    let gcd = a;
    let coprime = gcd == 1;

    // --- Modular inverse ---
    let inverse = if coprime {
        Some(mod_inverse(alpha, n))
    } else {
        None
    };

    // --- Back-substitution ---
    // Only possible when coprime and we have enough remainders
    // (m >= 2 means remainders.len() >= 4)
    let back_sub = if coprime && remainders.len() >= 4 {
        let m = remainders.len() - 2; // index of the GCD in remainders
        let init_lo = m - 2;
        let mut c_a: i64 = 1;
        let mut c_b: i64 = -quotients[m - 2];
        let init_c_a = c_a;
        let init_c_b = c_b;

        let mut steps = Vec::new();
        let mut lo = init_lo;

        while lo > 0 {
            let q_sub = quotients[lo - 1];
            let c_a_old = c_a;
            let c_b_old = c_b;

            // Substitute: r[lo+1] = r[lo-1] - q_sub * r[lo]
            // new coefficients after collecting terms
            let new_a = c_b;
            let new_b = c_a - c_b * q_sub;
            c_a = new_a;
            c_b = new_b;
            let new_lo = lo - 1;

            steps.push(BackSubStep {
                lo,
                q_sub,
                c_a_old,
                c_b_old,
                c_a_new: c_a,
                c_b_new: c_b,
                new_lo,
            });

            lo = new_lo;
        }

        Some(BackSub {
            init_lo,
            init_c_a,
            init_c_b,
            steps,
        })
    } else {
        None
    };

    let result = ComputeResult {
        alpha,
        beta,
        n,
        remainders,
        quotients,
        gcd,
        coprime,
        inverse,
        back_sub,
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_div() {
        assert_eq!(floor_div(26, 3), 8);
        assert_eq!(floor_div(26, -3), -9);
        assert_eq!(floor_div(-26, 3), -9);
        assert_eq!(floor_div(-26, -3), 8);
        assert_eq!(floor_div(6, 3), 2);
    }

    #[test]
    fn test_mod_inverse_3_26() {
        assert_eq!(mod_inverse(3, 26), 9);
        // 3 * 9 = 27 ≡ 1 (mod 26)
    }

    #[test]
    fn test_mod_inverse_5_26() {
        assert_eq!(mod_inverse(5, 26), 21);
        // 5 * 21 = 105 ≡ 1 (mod 26)
    }

    #[test]
    fn test_mod_inverse_7_26() {
        assert_eq!(mod_inverse(7, 26), 15);
        // 7 * 15 = 105 ≡ 1 (mod 26)
    }

    #[test]
    fn test_compute_coprime() {
        let json = compute(3, 5, 26).unwrap();
        let result: ComputeResult = serde_json::from_str(&json).unwrap();
        assert!(result.coprime);
        assert_eq!(result.gcd, 1);
        assert_eq!(result.inverse, Some(9));
    }

    #[test]
    fn test_compute_not_coprime() {
        let json = compute(4, 5, 26).unwrap();
        let result: ComputeResult = serde_json::from_str(&json).unwrap();
        assert!(!result.coprime);
        assert_eq!(result.gcd, 2);
        assert_eq!(result.inverse, None);
    }

    #[test]
    fn test_compute_n_invalid() {
        assert!(compute(3, 5, 0).is_err());
        assert!(compute(3, 5, -1).is_err());
    }

    #[test]
    fn test_euclidean_divisions() {
        let json = compute(3, 5, 26).unwrap();
        let result: ComputeResult = serde_json::from_str(&json).unwrap();
        // 26 = 3·8 + 2
        // 3 = 2·1 + 1
        // 2 = 1·2 + 0
        assert_eq!(result.remainders, vec![26, 3, 2, 1, 0]);
        assert_eq!(result.quotients, vec![8, 1, 2]);
    }

    #[test]
    fn test_back_substitution_structure() {
        let json = compute(3, 5, 26).unwrap();
        let result: ComputeResult = serde_json::from_str(&json).unwrap();
        let bs = result.back_sub.unwrap();

        // m = 3 (gcd at index 3), init_lo = 1
        assert_eq!(bs.init_lo, 1);
        assert_eq!(bs.init_c_a, 1);
        assert_eq!(bs.init_c_b, -1); // -quotients[1] = -1

        // One substitution step (lo=1 → 0)
        assert_eq!(bs.steps.len(), 1);
        assert_eq!(bs.steps[0].lo, 1);
        assert_eq!(bs.steps[0].q_sub, 8); // quotients[0]
    }

    #[test]
    fn test_inverse_verification() {
        // For various coprime pairs, verify a * a_inv ≡ 1 (mod n)
        let pairs = [(3, 26), (5, 26), (7, 26), (11, 26), (17, 30), (3, 7)];
        for (a, n) in pairs {
            let inv = mod_inverse(a, n);
            assert_eq!((a * inv) % n, 1, "Failed for a={a}, n={n}, inv={inv}");
        }
    }
}

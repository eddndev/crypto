use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Matrix {
    pub rows: usize,
    pub cols: usize,
    pub data: Vec<Vec<i64>>,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Atom {
    Scalar {
        value: i64,
    },
    Matrix {
        rows: usize,
        cols: usize,
        data: Vec<Vec<i64>>,
    },
    System {
        consistent: bool,
        particular: Option<Vec<i64>>,
        homogeneous_basis: Vec<Vec<i64>>,
        pivot_cols: Vec<usize>,
        free_cols: Vec<usize>,
        rref: Vec<Vec<i64>>,
    },
    Rref {
        rows: usize,
        cols: usize,
        data: Vec<Vec<i64>>,
        pivot_cols: Vec<usize>,
        rank: usize,
    },
}

#[derive(Serialize, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Step {
    Note { text: String },
    Swap { i: usize, j: usize },
    Scale { row: usize, by: i64, inv_of: i64 },
    Eliminate { target: usize, source: usize, factor: i64 },
    Pivot { row: usize, col: usize, value: i64 },
    Snapshot { data: Vec<Vec<i64>> },
    Cofactor { i: usize, j: usize, sign: i64, minor: Vec<Vec<i64>>, det: i64 },
}

#[derive(Serialize, Debug)]
pub struct OpResponse {
    pub n: i64,
    pub result: Atom,
    pub trace: Vec<Step>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub struct OpRequest {
    pub kind: String,
    pub n: i64,
    #[serde(default)]
    pub a: Option<Matrix>,
    #[serde(default)]
    pub b: Option<Matrix>,
    #[serde(default)]
    pub k: Option<i64>,
    #[serde(default)]
    pub p: Option<u64>,
    #[serde(default)]
    pub row_sel: Option<Vec<usize>>,
    #[serde(default)]
    pub col_sel: Option<Vec<usize>>,
}

// ---------------------------------------------------------------------------
// Modular helpers
// ---------------------------------------------------------------------------

pub fn mod_red(x: i64, n: i64) -> i64 {
    ((x % n) + n) % n
}

pub fn egcd(a: i64, b: i64) -> (i64, i64, i64) {
    if b == 0 {
        (a, 1, 0)
    } else {
        let (g, x1, y1) = egcd(b, a.rem_euclid(b));
        (g, y1, x1 - (a.div_euclid(b)) * y1)
    }
}

pub fn gcd(a: i64, b: i64) -> i64 {
    let (g, _, _) = egcd(a.abs(), b.abs());
    g.abs()
}

/// Returns `Some(a_inv)` in `[0, n)` when `gcd(a, n) = 1`, else `None`.
pub fn mod_inverse(a: i64, n: i64) -> Option<i64> {
    let a = mod_red(a, n);
    let (g, x, _) = egcd(a, n);
    if g != 1 {
        None
    } else {
        Some(mod_red(x, n))
    }
}

fn reduce_matrix(m: &mut Matrix, n: i64) {
    for row in &mut m.data {
        for v in row {
            *v = mod_red(*v, n);
        }
    }
}

fn zeros(rows: usize, cols: usize) -> Matrix {
    Matrix {
        rows,
        cols,
        data: vec![vec![0i64; cols]; rows],
    }
}

fn identity(sz: usize) -> Matrix {
    let mut m = zeros(sz, sz);
    for i in 0..sz {
        m.data[i][i] = 1;
    }
    m
}

fn validate_matrix(m: &Matrix) -> Result<(), String> {
    if m.data.len() != m.rows {
        return Err(format!("matrix rows mismatch: declared {}, got {}", m.rows, m.data.len()));
    }
    for (i, row) in m.data.iter().enumerate() {
        if row.len() != m.cols {
            return Err(format!("row {i} has {} cols, expected {}", row.len(), m.cols));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

fn op_add(a: &Matrix, b: &Matrix, n: i64, neg: bool) -> Result<Matrix, String> {
    if a.rows != b.rows || a.cols != b.cols {
        return Err(format!(
            "dimension mismatch: {}×{} {} {}×{}",
            a.rows, a.cols, if neg { "−" } else { "+" }, b.rows, b.cols
        ));
    }
    let mut out = zeros(a.rows, a.cols);
    for i in 0..a.rows {
        for j in 0..a.cols {
            let v = if neg { a.data[i][j] - b.data[i][j] } else { a.data[i][j] + b.data[i][j] };
            out.data[i][j] = mod_red(v, n);
        }
    }
    Ok(out)
}

fn op_scalar_mul(k: i64, a: &Matrix, n: i64) -> Matrix {
    let mut out = zeros(a.rows, a.cols);
    for i in 0..a.rows {
        for j in 0..a.cols {
            out.data[i][j] = mod_red(k * a.data[i][j], n);
        }
    }
    out
}

fn op_mul(a: &Matrix, b: &Matrix, n: i64) -> Result<Matrix, String> {
    if a.cols != b.rows {
        return Err(format!(
            "incompatible for product: {}×{} · {}×{} (cols A must equal rows B)",
            a.rows, a.cols, b.rows, b.cols
        ));
    }
    let mut out = zeros(a.rows, b.cols);
    for i in 0..a.rows {
        for j in 0..b.cols {
            let mut s: i64 = 0;
            for t in 0..a.cols {
                s += a.data[i][t] * b.data[t][j];
                s = mod_red(s, n);
            }
            out.data[i][j] = s;
        }
    }
    Ok(out)
}

fn op_transpose(a: &Matrix) -> Matrix {
    let mut out = zeros(a.cols, a.rows);
    for i in 0..a.rows {
        for j in 0..a.cols {
            out.data[j][i] = a.data[i][j];
        }
    }
    out
}

fn op_concat_h(a: &Matrix, b: &Matrix, n: i64) -> Result<Matrix, String> {
    if a.rows != b.rows {
        return Err(format!(
            "concat_h requires same rows: got {} and {}",
            a.rows, b.rows
        ));
    }
    let mut out = zeros(a.rows, a.cols + b.cols);
    for i in 0..a.rows {
        for j in 0..a.cols {
            out.data[i][j] = mod_red(a.data[i][j], n);
        }
        for j in 0..b.cols {
            out.data[i][a.cols + j] = mod_red(b.data[i][j], n);
        }
    }
    Ok(out)
}

fn op_concat_v(a: &Matrix, b: &Matrix, n: i64) -> Result<Matrix, String> {
    if a.cols != b.cols {
        return Err(format!(
            "concat_v requires same cols: got {} and {}",
            a.cols, b.cols
        ));
    }
    let mut out = zeros(a.rows + b.rows, a.cols);
    for i in 0..a.rows {
        for j in 0..a.cols {
            out.data[i][j] = mod_red(a.data[i][j], n);
        }
    }
    for i in 0..b.rows {
        for j in 0..b.cols {
            out.data[a.rows + i][j] = mod_red(b.data[i][j], n);
        }
    }
    Ok(out)
}

fn op_submatrix(a: &Matrix, rows: &[usize], cols: &[usize]) -> Result<Matrix, String> {
    for &r in rows {
        if r >= a.rows {
            return Err(format!("row index {r} out of range (rows = {})", a.rows));
        }
    }
    for &c in cols {
        if c >= a.cols {
            return Err(format!("col index {c} out of range (cols = {})", a.cols));
        }
    }
    let mut out = zeros(rows.len(), cols.len());
    for (i, &r) in rows.iter().enumerate() {
        for (j, &c) in cols.iter().enumerate() {
            out.data[i][j] = a.data[r][c];
        }
    }
    Ok(out)
}

fn op_pow(a: &Matrix, p: u64, n: i64) -> Result<Matrix, String> {
    if a.rows != a.cols {
        return Err(format!(
            "power requires square matrix, got {}×{}",
            a.rows, a.cols
        ));
    }
    if p > 10_000 {
        return Err("exponent too large (max 10000)".into());
    }
    let mut base = a.clone();
    reduce_matrix(&mut base, n);
    let mut result = identity(a.rows);
    let mut e = p;
    while e > 0 {
        if e & 1 == 1 {
            result = op_mul(&result, &base, n)?;
        }
        e >>= 1;
        if e > 0 {
            base = op_mul(&base, &base, n)?;
        }
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Determinant via cofactor expansion (first row).
// Traces the expansion for any square matrix ≥ 1×1.
// ---------------------------------------------------------------------------

fn det_expand(a: &Matrix, n: i64, trace: &mut Vec<Step>, depth: usize) -> Result<i64, String> {
    if a.rows != a.cols {
        return Err(format!("det requires square, got {}×{}", a.rows, a.cols));
    }
    let sz = a.rows;
    if sz == 1 {
        return Ok(mod_red(a.data[0][0], n));
    }
    if sz == 2 {
        let d = a.data[0][0] * a.data[1][1] - a.data[0][1] * a.data[1][0];
        return Ok(mod_red(d, n));
    }
    let mut total: i64 = 0;
    for j in 0..sz {
        let rows: Vec<usize> = (1..sz).collect();
        let cols: Vec<usize> = (0..sz).filter(|&c| c != j).collect();
        let minor = op_submatrix(a, &rows, &cols)?;
        let sign: i64 = if j % 2 == 0 { 1 } else { -1 };
        let sub_det = det_expand(&minor, n, trace, depth + 1)?;
        let term = mod_red(sign * a.data[0][j] * sub_det, n);
        total = mod_red(total + term, n);
        if depth == 0 {
            trace.push(Step::Cofactor {
                i: 0,
                j,
                sign,
                minor: minor.data.clone(),
                det: mod_red(sub_det, n),
            });
        }
    }
    Ok(total)
}

// ---------------------------------------------------------------------------
// Adjugate (classical adjoint): transpose of cofactor matrix.
// ---------------------------------------------------------------------------

fn op_adj(a: &Matrix, n: i64) -> Result<Matrix, String> {
    if a.rows != a.cols {
        return Err(format!("adj requires square, got {}×{}", a.rows, a.cols));
    }
    let sz = a.rows;
    if sz == 1 {
        return Ok(Matrix { rows: 1, cols: 1, data: vec![vec![1]] });
    }
    let mut cof = zeros(sz, sz);
    for i in 0..sz {
        for j in 0..sz {
            let rows: Vec<usize> = (0..sz).filter(|&r| r != i).collect();
            let cols: Vec<usize> = (0..sz).filter(|&c| c != j).collect();
            let minor = op_submatrix(a, &rows, &cols)?;
            let mut dummy = Vec::new();
            let md = det_expand(&minor, n, &mut dummy, 1)?;
            let sign: i64 = if (i + j) % 2 == 0 { 1 } else { -1 };
            cof.data[i][j] = mod_red(sign * md, n);
        }
    }
    Ok(op_transpose(&cof))
}

// ---------------------------------------------------------------------------
// Inverse via adjugate: A⁻¹ = (det A)⁻¹ · adj(A)
// ---------------------------------------------------------------------------

fn op_inv(
    a: &Matrix,
    n: i64,
    trace: &mut Vec<Step>,
    warnings: &mut Vec<String>,
) -> Result<Matrix, String> {
    if a.rows != a.cols {
        return Err(format!("inverse requires square, got {}×{}", a.rows, a.cols));
    }
    let det = det_expand(a, n, trace, 0)?;
    trace.push(Step::Note {
        text: format!("det(A) ≡ {} (mod {})", det, n),
    });
    let inv_det = match mod_inverse(det, n) {
        Some(v) => v,
        None => {
            let g = gcd(det, n);
            return Err(format!(
                "A is not invertible mod {}: gcd(det, n) = gcd({}, {}) = {} ≠ 1",
                n, det, n, g
            ));
        }
    };
    trace.push(Step::Note {
        text: format!("(det A)⁻¹ ≡ {} (mod {})", inv_det, n),
    });
    let adj = op_adj(a, n)?;
    trace.push(Step::Note {
        text: format!("adj(A) computed ({}×{})", adj.rows, adj.cols),
    });
    if gcd(n, 1) == 0 {
        warnings.push("N is 0".into());
    }
    Ok(op_scalar_mul(inv_det, &adj, n))
}

// ---------------------------------------------------------------------------
// Row reduction (RREF) with pivoting by units of ℤ/Nℤ.
// Returns (reduced matrix, pivot columns).
// ---------------------------------------------------------------------------

fn op_rref(
    a: &Matrix,
    n: i64,
    trace: &mut Vec<Step>,
    warnings: &mut Vec<String>,
) -> (Matrix, Vec<usize>) {
    let mut m = a.clone();
    reduce_matrix(&mut m, n);
    let rows = m.rows;
    let cols = m.cols;
    let mut pivot_cols: Vec<usize> = Vec::new();
    let mut pivot_row = 0usize;

    let mut n_is_prime_like = true;
    // A lightweight hint: warn about composite moduli.
    if n > 1 && !is_probably_prime(n) {
        n_is_prime_like = false;
    }

    for col in 0..cols {
        if pivot_row >= rows {
            break;
        }
        // Find a row at or below pivot_row whose entry in `col` is a UNIT mod n.
        let mut unit_row: Option<usize> = None;
        for r in pivot_row..rows {
            let v = m.data[r][col];
            if v != 0 && mod_inverse(v, n).is_some() {
                unit_row = Some(r);
                break;
            }
        }
        // Fallback: any nonzero entry (cannot scale to 1 but can still eliminate below).
        let chosen = match unit_row {
            Some(r) => r,
            None => {
                let mut fallback: Option<usize> = None;
                for r in pivot_row..rows {
                    if m.data[r][col] != 0 {
                        fallback = Some(r);
                        break;
                    }
                }
                match fallback {
                    None => continue, // no pivot in this column
                    Some(r) => {
                        if !n_is_prime_like {
                            warnings.push(format!(
                                "column {}: no unit pivot available mod {}; using zero-divisor {} (result may not be unique RREF)",
                                col, n, m.data[r][col]
                            ));
                        }
                        r
                    }
                }
            }
        };

        if chosen != pivot_row {
            m.data.swap(chosen, pivot_row);
            trace.push(Step::Swap { i: chosen, j: pivot_row });
        }

        let piv = m.data[pivot_row][col];
        if let Some(inv) = mod_inverse(piv, n) {
            if piv != 1 {
                for j in 0..cols {
                    m.data[pivot_row][j] = mod_red(m.data[pivot_row][j] * inv, n);
                }
                trace.push(Step::Scale { row: pivot_row, by: inv, inv_of: piv });
            }
        }
        // Eliminate in all other rows.
        for r in 0..rows {
            if r == pivot_row {
                continue;
            }
            let factor = m.data[r][col];
            if factor != 0 {
                for j in 0..cols {
                    let v = m.data[r][j] - factor * m.data[pivot_row][j];
                    m.data[r][j] = mod_red(v, n);
                }
                trace.push(Step::Eliminate {
                    target: r,
                    source: pivot_row,
                    factor: mod_red(factor, n),
                });
            }
        }

        trace.push(Step::Pivot {
            row: pivot_row,
            col,
            value: m.data[pivot_row][col],
        });
        pivot_cols.push(col);
        pivot_row += 1;
    }

    (m, pivot_cols)
}

fn is_probably_prime(n: i64) -> bool {
    if n < 2 {
        return false;
    }
    if n < 4 {
        return true;
    }
    if n % 2 == 0 {
        return false;
    }
    let mut i = 3i64;
    while i * i <= n {
        if n % i == 0 {
            return false;
        }
        i += 2;
    }
    true
}

// ---------------------------------------------------------------------------
// Solve Ax = b via RREF on [A | b].
// ---------------------------------------------------------------------------

fn op_solve(
    a: &Matrix,
    b: &Matrix,
    n: i64,
    trace: &mut Vec<Step>,
    warnings: &mut Vec<String>,
) -> Result<Atom, String> {
    if a.rows != b.rows {
        return Err(format!(
            "solve: rows(A) = {} must equal rows(b) = {}",
            a.rows, b.rows
        ));
    }
    if b.cols != 1 {
        return Err("solve: b must be a column vector".into());
    }
    let aug = op_concat_h(a, b, n)?;
    let (rref, pivots) = op_rref(&aug, n, trace, warnings);
    let cols_a = a.cols;

    // Consistency: no pivot in the augmented column.
    let consistent = !pivots.contains(&cols_a);

    let free_cols: Vec<usize> = (0..cols_a).filter(|c| !pivots.contains(c)).collect();

    if !consistent {
        return Ok(Atom::System {
            consistent: false,
            particular: None,
            homogeneous_basis: vec![],
            pivot_cols: pivots,
            free_cols,
            rref: rref.data,
        });
    }

    // Particular solution: free vars ← 0, pivot vars from RREF column.
    let mut particular = vec![0i64; cols_a];
    for (row, &pcol) in pivots.iter().enumerate() {
        if pcol < cols_a {
            particular[pcol] = mod_red(rref.data[row][cols_a], n);
        }
    }

    // Homogeneous basis: one vector per free column (requires unit pivots).
    let mut homogeneous_basis: Vec<Vec<i64>> = Vec::new();
    if !free_cols.is_empty() && !is_probably_prime(n) {
        warnings.push(format!(
            "N = {} is composite; homogeneous basis may not span all solutions",
            n
        ));
    }
    for &fc in &free_cols {
        let mut v = vec![0i64; cols_a];
        v[fc] = 1;
        for (row, &pcol) in pivots.iter().enumerate() {
            if pcol < cols_a {
                v[pcol] = mod_red(-rref.data[row][fc], n);
            }
        }
        homogeneous_basis.push(v);
    }

    Ok(Atom::System {
        consistent: true,
        particular: Some(particular),
        homogeneous_basis,
        pivot_cols: pivots,
        free_cols,
        rref: rref.data,
    })
}

// ---------------------------------------------------------------------------
// Left / Right inverses.
// A (m×n). Right: A·X = I_m, requires m ≤ n and full row rank.
//          Left:  Y·A = I_n, requires m ≥ n and full column rank (solve Aᵀ·Yᵀ = I_n).
// ---------------------------------------------------------------------------

fn op_right_inverse(
    a: &Matrix,
    n: i64,
    trace: &mut Vec<Step>,
    warnings: &mut Vec<String>,
) -> Result<Matrix, String> {
    if a.rows > a.cols {
        return Err(format!(
            "right inverse requires rows ≤ cols (got {}×{})",
            a.rows, a.cols
        ));
    }
    // Solve A · X = I_m column by column.
    let m = a.rows;
    let mut x = zeros(a.cols, m);
    for j in 0..m {
        let mut e = zeros(m, 1);
        e.data[j][0] = 1;
        let sys = op_solve(a, &e, n, trace, warnings)?;
        match sys {
            Atom::System { consistent: true, particular: Some(p), .. } => {
                for i in 0..a.cols {
                    x.data[i][j] = p[i];
                }
            }
            _ => {
                return Err(format!(
                    "right inverse does not exist: system A·x = e_{} is inconsistent",
                    j
                ));
            }
        }
    }
    Ok(x)
}

fn op_left_inverse(
    a: &Matrix,
    n: i64,
    trace: &mut Vec<Step>,
    warnings: &mut Vec<String>,
) -> Result<Matrix, String> {
    if a.cols > a.rows {
        return Err(format!(
            "left inverse requires rows ≥ cols (got {}×{})",
            a.rows, a.cols
        ));
    }
    let at = op_transpose(a);
    let y_t = op_right_inverse(&at, n, trace, warnings)?;
    Ok(op_transpose(&y_t))
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

fn run(req: OpRequest) -> Result<OpResponse, String> {
    if req.n < 2 {
        return Err(format!("modulus must be ≥ 2 (got {})", req.n));
    }
    let n = req.n;
    if let Some(a) = &req.a {
        validate_matrix(a)?;
    }
    if let Some(b) = &req.b {
        validate_matrix(b)?;
    }

    let mut trace: Vec<Step> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    if !is_probably_prime(n) {
        warnings.push(format!(
            "N = {} is composite; not every nonzero element has an inverse",
            n
        ));
    }

    let result: Atom = match req.kind.as_str() {
        "add" => {
            let a = req.a.ok_or("add: missing A")?;
            let b = req.b.ok_or("add: missing B")?;
            let r = op_add(&a, &b, n, false)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "sub" => {
            let a = req.a.ok_or("sub: missing A")?;
            let b = req.b.ok_or("sub: missing B")?;
            let r = op_add(&a, &b, n, true)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "scalar_mul" => {
            let a = req.a.ok_or("scalar_mul: missing A")?;
            let k = req.k.ok_or("scalar_mul: missing k")?;
            let r = op_scalar_mul(k, &a, n);
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "mul" => {
            let a = req.a.ok_or("mul: missing A")?;
            let b = req.b.ok_or("mul: missing B")?;
            let r = op_mul(&a, &b, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "transpose" => {
            let a = req.a.ok_or("transpose: missing A")?;
            let r = op_transpose(&a);
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "det" => {
            let a = req.a.ok_or("det: missing A")?;
            let d = det_expand(&a, n, &mut trace, 0)?;
            Atom::Scalar { value: mod_red(d, n) }
        }
        "adj" => {
            let a = req.a.ok_or("adj: missing A")?;
            let r = op_adj(&a, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "inv" => {
            let a = req.a.ok_or("inv: missing A")?;
            let r = op_inv(&a, n, &mut trace, &mut warnings)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "pow" => {
            let a = req.a.ok_or("pow: missing A")?;
            let p = req.p.ok_or("pow: missing p")?;
            let r = op_pow(&a, p, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "rref" => {
            let a = req.a.ok_or("rref: missing A")?;
            let (r, pivots) = op_rref(&a, n, &mut trace, &mut warnings);
            let rank = pivots.len();
            Atom::Rref {
                rows: r.rows,
                cols: r.cols,
                data: r.data,
                pivot_cols: pivots,
                rank,
            }
        }
        "rank" => {
            let a = req.a.ok_or("rank: missing A")?;
            let (_r, pivots) = op_rref(&a, n, &mut trace, &mut warnings);
            Atom::Scalar { value: pivots.len() as i64 }
        }
        "concat_h" => {
            let a = req.a.ok_or("concat_h: missing A")?;
            let b = req.b.ok_or("concat_h: missing B")?;
            let r = op_concat_h(&a, &b, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "concat_v" => {
            let a = req.a.ok_or("concat_v: missing A")?;
            let b = req.b.ok_or("concat_v: missing B")?;
            let r = op_concat_v(&a, &b, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "augment" => {
            let a = req.a.ok_or("augment: missing A")?;
            let b = req.b.ok_or("augment: missing b (column vector)")?;
            if b.cols != 1 {
                return Err("augment: b must be a column vector".into());
            }
            let r = op_concat_h(&a, &b, n)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "submatrix" => {
            let a = req.a.ok_or("submatrix: missing A")?;
            let rs = req.row_sel.ok_or("submatrix: missing row_sel")?;
            let cs = req.col_sel.ok_or("submatrix: missing col_sel")?;
            let r = op_submatrix(&a, &rs, &cs)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "solve" => {
            let a = req.a.ok_or("solve: missing A")?;
            let b = req.b.ok_or("solve: missing b")?;
            op_solve(&a, &b, n, &mut trace, &mut warnings)?
        }
        "right_inverse" => {
            let a = req.a.ok_or("right_inverse: missing A")?;
            let r = op_right_inverse(&a, n, &mut trace, &mut warnings)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        "left_inverse" => {
            let a = req.a.ok_or("left_inverse: missing A")?;
            let r = op_left_inverse(&a, n, &mut trace, &mut warnings)?;
            Atom::Matrix { rows: r.rows, cols: r.cols, data: r.data }
        }
        other => return Err(format!("unknown operation: {other}")),
    };

    Ok(OpResponse { n, result, trace, warnings })
}

// ---------------------------------------------------------------------------
// WASM entry point
// ---------------------------------------------------------------------------

/// Dispatch a matrix operation. `request_json` is a JSON-serialized `OpRequest`.
/// Returns a JSON-serialized `OpResponse` on success, or an error string.
#[wasm_bindgen]
pub fn op(request_json: &str) -> Result<String, String> {
    let req: OpRequest = serde_json::from_str(request_json).map_err(|e| e.to_string())?;
    let resp = run(req)?;
    serde_json::to_string(&resp).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn m(data: Vec<Vec<i64>>) -> Matrix {
        Matrix {
            rows: data.len(),
            cols: data[0].len(),
            data,
        }
    }

    #[test]
    fn test_mod_red() {
        assert_eq!(mod_red(-3, 26), 23);
        assert_eq!(mod_red(29, 26), 3);
        assert_eq!(mod_red(0, 26), 0);
    }

    #[test]
    fn test_mod_inverse() {
        assert_eq!(mod_inverse(3, 26), Some(9));
        assert_eq!(mod_inverse(5, 26), Some(21));
        assert_eq!(mod_inverse(2, 26), None);
        assert_eq!(mod_inverse(13, 26), None);
    }

    #[test]
    fn test_add_sub() {
        let a = m(vec![vec![1, 2], vec![3, 4]]);
        let b = m(vec![vec![25, 1], vec![0, 22]]);
        let s = op_add(&a, &b, 26, false).unwrap();
        assert_eq!(s.data, vec![vec![0, 3], vec![3, 0]]);
        let d = op_add(&a, &b, 26, true).unwrap();
        assert_eq!(d.data, vec![vec![2, 1], vec![3, 8]]);
    }

    #[test]
    fn test_mul_nonsquare() {
        let a = m(vec![vec![1, 2, 3], vec![4, 5, 6]]);
        let b = m(vec![vec![7], vec![8], vec![9]]);
        let p = op_mul(&a, &b, 100).unwrap();
        // row 0: 7 + 16 + 27 = 50
        // row 1: 28 + 40 + 54 = 122 % 100 = 22
        assert_eq!(p.data, vec![vec![50], vec![22]]);
        assert_eq!(p.rows, 2);
        assert_eq!(p.cols, 1);
    }

    #[test]
    fn test_mul_incompatible() {
        let a = m(vec![vec![1, 2]]);
        let b = m(vec![vec![1], vec![2], vec![3]]);
        assert!(op_mul(&a, &b, 26).is_err());
    }

    #[test]
    fn test_transpose() {
        let a = m(vec![vec![1, 2, 3], vec![4, 5, 6]]);
        let t = op_transpose(&a);
        assert_eq!(t.rows, 3);
        assert_eq!(t.cols, 2);
        assert_eq!(t.data, vec![vec![1, 4], vec![2, 5], vec![3, 6]]);
    }

    #[test]
    fn test_det_2x2() {
        let a = m(vec![vec![3, 3], vec![2, 5]]);
        let mut trace = Vec::new();
        let d = det_expand(&a, 26, &mut trace, 0).unwrap();
        // 3*5 - 3*2 = 9
        assert_eq!(d, 9);
    }

    #[test]
    fn test_det_3x3() {
        let a = m(vec![
            vec![1, 2, 3],
            vec![0, 1, 4],
            vec![5, 6, 0],
        ]);
        let mut trace = Vec::new();
        let d = det_expand(&a, 100, &mut trace, 0).unwrap();
        // Standard det = 1
        assert_eq!(d, 1);
    }

    #[test]
    fn test_inverse_hill() {
        // Classic Hill example: K = [[3,3],[2,5]] mod 26, K⁻¹ = [[15,17],[20,9]]
        let a = m(vec![vec![3, 3], vec![2, 5]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let inv = op_inv(&a, 26, &mut trace, &mut warnings).unwrap();
        assert_eq!(inv.data, vec![vec![15, 17], vec![20, 9]]);
        // Verify A · A⁻¹ = I
        let prod = op_mul(&a, &inv, 26).unwrap();
        assert_eq!(prod.data, vec![vec![1, 0], vec![0, 1]]);
    }

    #[test]
    fn test_inverse_non_invertible() {
        let a = m(vec![vec![2, 4], vec![6, 8]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        assert!(op_inv(&a, 26, &mut trace, &mut warnings).is_err());
    }

    #[test]
    fn test_rref_square() {
        let a = m(vec![vec![3, 3], vec![2, 5]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let (r, pivots) = op_rref(&a, 26, &mut trace, &mut warnings);
        assert_eq!(pivots, vec![0, 1]);
        assert_eq!(r.data, vec![vec![1, 0], vec![0, 1]]);
    }

    #[test]
    fn test_rref_rank_deficient() {
        // Rows linearly dependent: r2 = 2*r1 mod 7
        let a = m(vec![vec![1, 2, 3], vec![2, 4, 6]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let (_r, pivots) = op_rref(&a, 7, &mut trace, &mut warnings);
        assert_eq!(pivots.len(), 1);
    }

    #[test]
    fn test_solve_consistent() {
        // 2x + 3y = 5,  x + y = 2 (mod 7): x=1, y=1
        let a = m(vec![vec![2, 3], vec![1, 1]]);
        let b = m(vec![vec![5], vec![2]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let sys = op_solve(&a, &b, 7, &mut trace, &mut warnings).unwrap();
        if let Atom::System { consistent, particular, .. } = sys {
            assert!(consistent);
            assert_eq!(particular.unwrap(), vec![1, 1]);
        } else {
            panic!("expected System");
        }
    }

    #[test]
    fn test_solve_underdetermined() {
        // x + y = 3 (mod 7) → one free variable, basis vector size 1
        let a = m(vec![vec![1, 1]]);
        let b = m(vec![vec![3]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let sys = op_solve(&a, &b, 7, &mut trace, &mut warnings).unwrap();
        if let Atom::System { consistent, homogeneous_basis, free_cols, .. } = sys {
            assert!(consistent);
            assert_eq!(free_cols.len(), 1);
            assert_eq!(homogeneous_basis.len(), 1);
        } else {
            panic!("expected System");
        }
    }

    #[test]
    fn test_pow() {
        let a = m(vec![vec![1, 1], vec![1, 0]]); // Fibonacci matrix
        let p = op_pow(&a, 5, 1000).unwrap();
        // F_6 = 8, F_5 = 5, F_4 = 3
        assert_eq!(p.data, vec![vec![8, 5], vec![5, 3]]);
    }

    #[test]
    fn test_right_inverse() {
        // A is 2×3 full row rank mod 7
        let a = m(vec![vec![1, 0, 1], vec![0, 1, 1]]);
        let mut trace = Vec::new();
        let mut warnings = Vec::new();
        let r = op_right_inverse(&a, 7, &mut trace, &mut warnings).unwrap();
        // Verify A · R = I_2
        let prod = op_mul(&a, &r, 7).unwrap();
        assert_eq!(prod.data, vec![vec![1, 0], vec![0, 1]]);
    }

    #[test]
    fn test_concat() {
        let a = m(vec![vec![1, 2], vec![3, 4]]);
        let b = m(vec![vec![5], vec![6]]);
        let h = op_concat_h(&a, &b, 100).unwrap();
        assert_eq!(h.cols, 3);
        assert_eq!(h.data, vec![vec![1, 2, 5], vec![3, 4, 6]]);

        let c = m(vec![vec![7, 8]]);
        let v = op_concat_v(&a, &c, 100).unwrap();
        assert_eq!(v.rows, 3);
        assert_eq!(v.data, vec![vec![1, 2], vec![3, 4], vec![7, 8]]);
    }

    #[test]
    fn test_dispatch_det() {
        let req = serde_json::json!({
            "kind": "det",
            "n": 26,
            "a": { "rows": 2, "cols": 2, "data": [[3, 3], [2, 5]] }
        });
        let resp = op(&req.to_string()).unwrap();
        assert!(resp.contains("\"value\":9"));
    }

    #[test]
    fn test_dispatch_unknown() {
        let req = serde_json::json!({ "kind": "xyz", "n": 26 });
        assert!(op(&req.to_string()).is_err());
    }
}

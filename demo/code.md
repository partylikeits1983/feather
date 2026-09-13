# Code snippets

## Lean

A definition and two small proofs, using Lean 4's standard library.

```lean
def twice (n : Nat) : Nat := 2 * n

example : twice 21 = 42 := by
  decide

theorem add_commutes (a b : Nat) : a + b = b + a := by
  exact Nat.add_comm a b

#eval twice 21
```

## Rust

Horner's method evaluates $p(x) = 1 + 2x + 3x^2$. Coefficients go from the constant term upward.

```rust
fn evaluate(coefficients: &[i64], x: i64) -> i64 {
    coefficients
        .iter()
        .rev()
        .fold(0, |value, &coefficient| value * x + coefficient)
}

fn main() {
    let result = evaluate(&[1, 2, 3], 2);
    assert_eq!(result, 17);
    println!("p(2) = {result}");
}
```

# Code snippets

Language names on fenced blocks enable highlighting in the editor, preview, and PDF export.

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

## TypeScript

The same polynomial, with typed parameters and a template string.

```typescript
function evaluate(coefficients: number[], x: number): number {
  return coefficients.reduceRight(
    (value, coefficient) => value * x + coefficient,
    0,
  );
}

const result = evaluate([1, 2, 3], 2);
console.log(`p(2) = ${result}`); // 17
```

## Python

```python
def evaluate(coefficients: list[int], x: int) -> int:
    result = 0
    for coefficient in reversed(coefficients):
        result = result * x + coefficient
    return result


print(f"p(2) = {evaluate([1, 2, 3], 2)}")  # 17
```

## An unknown language

An unrecognized label such as `somelang` uses C highlighting. Use `text` to keep a block plain.

```somelang
// This block falls back to C.
int square(int x) {
    return x * x;
}
```

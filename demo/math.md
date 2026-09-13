# A little mathematics

Inline math fits into a sentence: $p(x) = 1 + 2x + 3x^2$.

## Evaluate a polynomial

At $x = 2$,

$$
p(2) = 1 + 2 \cdot 2 + 3 \cdot 2^2 = 17.
$$

| Input $x$ | Output $p(x)$ |
| --- | --- |
| $0$ | $1$ |
| $1$ | $6$ |
| $2$ | $17$ |

## A familiar sum

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}.
$$

For $n = 5$, the sum is $1 + 2 + 3 + 4 + 5 = 15$.

> Try changing a coefficient or adding another equation.

The [Rust snippet](code.md#rust) evaluates the same polynomial.

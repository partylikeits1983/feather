# LaTeX in Markdown

Use LaTeX notation directly in your notes: \(e^{i\pi} + 1 = 0\).

## Aligned equations

$$
\begin{aligned}
(a+b)^2 &= (a+b)(a+b) \\
        &= a^2 + ab + ba + b^2 \\
        &= a^2 + 2ab + b^2.
\end{aligned}
$$

## A matrix

\[
\begin{pmatrix}
1 & 2 \\
3 & 4
\end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
=
\begin{pmatrix} x + 2y \\ 3x + 4y \end{pmatrix}.
\]

## A piecewise function

$$
|x| = \begin{cases}
 x, & x \geq 0, \\
-x, & x < 0.
\end{cases}
$$

For a full LaTeX document, open [paper.tex](paper.tex).

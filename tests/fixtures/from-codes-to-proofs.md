# From codes to proofs

This visual connects Reed–Solomon codes to STARKs. The first five experiments introduce code geometry. This experiment shows where interpolation, low-degree extension, and proximity checks enter a proof system.

## The prover: trace, interpolation, extension

For one trace column, choose a domain $H=\{h_0,\ldots,h_{m-1}\}$ and values $v_i$. These specify the unique polynomial $p$ of degree less than $m$ satisfying $p(h_i)=v_i$. The trace is an evaluation representation, whereas the first experiment's message tape is a coefficient representation.

The visual derives the trace from the shared polynomial so the connection stays visible. Editing a trace value interpolates a new shared polynomial. We round the number of coefficient slots up to a power of two and pad with zeros.

An inverse FFT recovers the coefficients. Evaluating on a larger domain $D$ produces

$$c=(p(x))_{x\in D},\qquad \rho=\frac{m}{|D|}.$$

This is a low-degree extension (LDE), computed here by a forward FFT. The original polynomial's degree bound is unchanged. [The STARK paper, §2.4](https://starkware.co/wp-content/uploads/2022/05/STARK-paper.pdf) describes the interpolation-and-evaluation construction.

The demo uses multiplicative subgroups in small prime fields. A real STARK can use cosets or other suitable structured domains. This example omits trace masking and computation constraints.

## The verifier: a local fold relation

Split $p(X)=p_{\rm even}(X^2)+X p_{\rm odd}(X^2)$ and form

$$g(Y)=p_{\rm even}(Y)+\alpha p_{\rm odd}(Y).$$

One opened pair gives the relation

$$ g(x^2)=\frac{w(x)+w(-x)}2+
\alpha\frac{w(x)-w(-x)}{2x}.$$

All arithmetic is in the finite field. The verifier needs three opened values to check this relation. The interface hides the other table entries. Changing the first folded entry makes its query fail; a query elsewhere can still agree.

This is one arithmetic check. The full protocol authenticates openings, checks linked folds over multiple rounds, and checks a final small polynomial's degree. The initial polynomial is not reconstructed by the verifier. See the [original FRI paper](https://eccc.weizmann.ac.il/report/2017/134/) and the [worked FRI implementation](https://aszepieniec.github.io/stark-anatomy/fri.html).

The controls choose a challenge and a query for teaching. They do not implement a Fiat–Shamir transcript, Merkle proofs, or a secure STARK verifier.

## Distance and lists in soundness

For an arbitrary prover-supplied table $w$, the relevant distance is

$$\Delta(w,C)=\min_{c\in C}\Delta(w,c),\qquad
\delta(w,C)=\frac{\Delta(w,C)}{|D|}.$$

There need not be an original sent codeword. The nearby list describes the low-degree polynomials consistent with much of the supplied table. List-size and agreement bounds enter the analysis of how often a dishonest prover can pass the protocol's random challenges. That analysis does not require the ordinary verifier to enumerate the list or repair a message. [DEEP-FRI](https://eccc.weizmann.ac.il/report/2019/044/) explains how sampling outside the evaluation domain constrains nearby candidate polynomials.
$$

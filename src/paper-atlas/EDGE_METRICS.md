# ECCV 2026 global institution-edge metric audit

This report is generated from the immutable local ECCV 2026 snapshot. It is an audit aid for choosing visual edge classes; it does not by itself label any relation as a causal or organizational partnership.

## Metric definitions

- `N`: number of distinct ECCV papers that contain both institutions.
- `W`: fractional co-occurrence weight. For a paper with `k` distinct institutions, each institution pair receives `1 / (k - 1)`. Therefore each institution contributes one unit of outward collaboration mass per multi-institution paper, rather than creating an unweighted clique.
- `Exposure`: `W / P_i` and `W / P_j`, where `P` is each institution's total ECCV paper count. It is directional and describes corpus-local co-occurrence exposure, not causality.
- `Mutuality`: `2W / (P_i + P_j)`. It is high only when the relation matters to both institutions.
- `Asymmetry`: absolute difference between the two exposure values.

A single score is intentionally avoided. `N` measures evidence, while mutuality and asymmetry describe relative importance. In particular, a one-paper pair can have mutuality `1.0` but remains weak evidence.

## Edge population

- 9,810 institution pairs; 2,052 pairs recur in at least two papers; 859 recur in at least three papers.
- Among pairs with `N ≥ 2`, mutuality quantiles are median 0.016, p75 0.033, p90 0.088, p95 0.167.
- Among pairs with `N ≥ 2`, asymmetry quantiles are median 0.023, p75 0.074, p90 0.182, p95 0.267.

| Minimum N | Edges | Institutions retaining at least one edge |
| ---: | ---: | ---: |
| 1 | 9,810 | 1,566 |
| 2 | 2,052 | 556 |
| 3 | 859 | 291 |
| 4 | 476 | 189 |
| 5 | 286 | 124 |

### Largest raw support

| Institution pair | N | W | Institution papers | Exposure | Mutuality | Asymmetry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hong Kong University of Science and Technology — The Hong Kong University of Science and Technology (Guangzhou) | 37 | 13.81 | 122 / 53 | 11.3% / 26.1% | 0.158 | 0.147 |
| Shanghai Artificial Intelligence Laboratory — Shanghai Jiao Tong University | 24 | 6.44 | 72 / 154 | 8.9% / 4.2% | 0.057 | 0.048 |
| ETH Zurich — Microsoft | 22 | 9.26 | 50 / 41 | 18.5% / 22.6% | 0.204 | 0.041 |
| Peking University — Tsinghua University | 22 | 7.01 | 134 / 211 | 5.2% / 3.3% | 0.041 | 0.019 |
| Shanghai Jiao Tong University — Tsinghua University | 20 | 4.90 | 154 / 211 | 3.2% / 2.3% | 0.027 | 0.009 |
| Hong Kong University of Science and Technology — Tsinghua University | 20 | 4.70 | 122 / 211 | 3.9% / 2.2% | 0.028 | 0.016 |

### Highest mutuality among recurring pairs (N ≥ 3)

| Institution pair | N | W | Institution papers | Exposure | Mutuality | Asymmetry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| École de Technologie Supérieure — Université du Québec | 3 | 2.00 | 3 / 4 | 66.7% / 50.0% | 0.571 | 0.167 |
| Neelan Tiruchelvam Trust — NTT Inc. | 3 | 2.00 | 3 / 4 | 66.7% / 50.0% | 0.571 | 0.167 |
| Advanced Micro Devices — AMD | 3 | 1.67 | 4 / 3 | 41.7% / 55.6% | 0.476 | 0.139 |
| China University of Petroleum, East China — University of Petroleum | 3 | 1.67 | 4 / 3 | 41.7% / 55.6% | 0.476 | 0.139 |
| Dr. Ing. h.c. F. Porsche AG — Esslingen University of Applied Sciences | 3 | 1.08 | 3 / 3 | 36.1% / 36.1% | 0.361 | 0.000 |
| Computer Vision Center — Universitat Autònoma de Barcelona | 3 | 1.25 | 3 / 4 | 41.7% / 31.3% | 0.357 | 0.104 |

### Highest asymmetry among recurring pairs (N ≥ 3)

| Institution pair | N | W | Institution papers | Exposure | Mutuality | Asymmetry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tsinghua Shenzhen International Graduate School — Tsinghua University | 6 | 3.87 | 6 / 211 | 64.4% / 1.8% | 0.036 | 0.626 |
| RIKEN — The University of Tokyo | 4 | 2.70 | 4 / 28 | 67.5% / 9.6% | 0.169 | 0.579 |
| HiDream.ai — University of Science and Technology of China | 4 | 3.50 | 6 / 104 | 58.3% / 3.4% | 0.064 | 0.550 |
| University of Southern California — USC Institute for Creative Technologies | 4 | 2.67 | 20 / 4 | 13.3% / 66.7% | 0.222 | 0.533 |
| BeingBeyond — Peking University | 3 | 1.63 | 3 / 134 | 54.2% / 1.2% | 0.024 | 0.530 |
| Facebook AI Research — The University of Texas at Austin | 5 | 3.08 | 5 / 26 | 61.7% / 11.9% | 0.199 | 0.498 |

### One-paper pairs with misleadingly high mutuality

| Institution pair | N | W | Institution papers | Exposure | Mutuality | Asymmetry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chulalongkorn University — Vidyasirimedhi Institute of Science and Technology | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |
| Gdańsk University of Technology — NASK National Research Institute | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |
| Indian Institute of Information Technology Bhagalpur — Indian Institute of Technology Indore | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |
| Institute of Fundamental Technological Research — Polish Academy of Sciences | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |
| Kakao Corp. — Kakao | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |
| Korea Soongsil Cyber ​​University — SAKAK Inc. | 1 | 1.00 | 1 / 1 | 100.0% / 100.0% | 1.000 | 0.000 |

## Adopted visual semantics

- Use line width for `N` or `W` as evidence of recurrence.
- Use opacity or solidity for mutuality, so high-volume but relatively weak ties do not dominate the map merely by count.
- Reserve a subtle taper or arrow for high-asymmetry edges only when an institution is focused; label it as exposure direction, never as causality.
- Keep `N = 1` edges available in an institution or country focus view, but hide them by default in the global overview. The overview renders recurrent edges (`N ≥ 2`).

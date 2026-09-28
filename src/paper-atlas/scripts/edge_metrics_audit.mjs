function displayPair(edge, nodes) {
  return `${nodes.get(edge.source)?.name ?? edge.source} — ${nodes.get(edge.target)?.name ?? edge.target}`;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function edgeRow(edge, nodes) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  return `| ${displayPair(edge, nodes)} | ${edge.paperCount} | ${edge.fractionalPaperWeight.toFixed(2)} | ${source.paperCount} / ${target.paperCount} | ${percent(edge.sourceShare)} / ${percent(edge.targetShare)} | ${edge.mutuality.toFixed(3)} | ${edge.asymmetry.toFixed(3)} |`;
}

function table(title, edges, nodes) {
  return [
    `### ${title}`,
    '',
    '| Institution pair | N | W | Institution papers | Exposure | Mutuality | Asymmetry |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...edges.map((edge) => edgeRow(edge, nodes)),
    '',
  ].join('\n');
}

function quantile(values, fraction) {
  const index = Math.floor((values.length - 1) * fraction);
  return values[index] ?? 0;
}

export function edgeMetricsAuditMarkdown(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.links;
  const repeated = edges.filter((edge) => edge.paperCount >= 2);
  const recurring = edges.filter((edge) => edge.paperCount >= 3);
  const bySupport = [...edges].sort((left, right) => right.paperCount - left.paperCount || right.fractionalPaperWeight - left.fractionalPaperWeight);
  const byMutuality = [...recurring].sort((left, right) => right.mutuality - left.mutuality || right.paperCount - left.paperCount);
  const byAsymmetry = [...recurring].sort((left, right) => right.asymmetry - left.asymmetry || right.paperCount - left.paperCount);
  const oneOffByMutuality = edges.filter((edge) => edge.paperCount === 1).sort((left, right) => right.mutuality - left.mutuality);
  const mutuality = repeated.map((edge) => edge.mutuality).sort((left, right) => left - right);
  const asymmetry = repeated.map((edge) => edge.asymmetry).sort((left, right) => left - right);
  const supportRows = [1, 2, 3, 4, 5].map((minimumSupport) => {
    const selected = edges.filter((edge) => edge.paperCount >= minimumSupport);
    const institutionIds = new Set(selected.flatMap((edge) => [edge.source, edge.target]));
    return `| ${minimumSupport} | ${selected.length.toLocaleString()} | ${institutionIds.size.toLocaleString()} |`;
  });
  return [
    '# ECCV 2026 global institution-edge metric audit',
    '',
    'This report is generated from the immutable local ECCV 2026 snapshot. It is an audit aid for choosing visual edge classes; it does not by itself label any relation as a causal or organizational partnership.',
    '',
    '## Metric definitions',
    '',
    '- `N`: number of distinct ECCV papers that contain both institutions.',
    '- `W`: fractional co-occurrence weight. For a paper with `k` distinct institutions, each institution pair receives `1 / (k - 1)`. Therefore each institution contributes one unit of outward collaboration mass per multi-institution paper, rather than creating an unweighted clique.',
    '- `Exposure`: `W / P_i` and `W / P_j`, where `P` is each institution\'s total ECCV paper count. It is directional and describes corpus-local co-occurrence exposure, not causality.',
    '- `Mutuality`: `2W / (P_i + P_j)`. It is high only when the relation matters to both institutions.',
    '- `Asymmetry`: absolute difference between the two exposure values.',
    '',
    'A single score is intentionally avoided. `N` measures evidence, while mutuality and asymmetry describe relative importance. In particular, a one-paper pair can have mutuality `1.0` but remains weak evidence.',
    '',
    '## Edge population',
    '',
    `- ${edges.length.toLocaleString()} institution pairs; ${repeated.length.toLocaleString()} pairs recur in at least two papers; ${recurring.length.toLocaleString()} recur in at least three papers.`,
    `- Among pairs with \`N ≥ 2\`, mutuality quantiles are median ${quantile(mutuality, .5).toFixed(3)}, p75 ${quantile(mutuality, .75).toFixed(3)}, p90 ${quantile(mutuality, .9).toFixed(3)}, p95 ${quantile(mutuality, .95).toFixed(3)}.`,
    `- Among pairs with \`N ≥ 2\`, asymmetry quantiles are median ${quantile(asymmetry, .5).toFixed(3)}, p75 ${quantile(asymmetry, .75).toFixed(3)}, p90 ${quantile(asymmetry, .9).toFixed(3)}, p95 ${quantile(asymmetry, .95).toFixed(3)}.`,
    '',
    '| Minimum N | Edges | Institutions retaining at least one edge |',
    '| ---: | ---: | ---: |',
    ...supportRows,
    '',
    table('Largest raw support', bySupport.slice(0, 6), nodes),
    table('Highest mutuality among recurring pairs (N ≥ 3)', byMutuality.slice(0, 6), nodes),
    table('Highest asymmetry among recurring pairs (N ≥ 3)', byAsymmetry.slice(0, 6), nodes),
    table('One-paper pairs with misleadingly high mutuality', oneOffByMutuality.slice(0, 6), nodes),
    '## Adopted visual semantics',
    '',
    '- Use line width for `N` or `W` as evidence of recurrence.',
    '- Use opacity or solidity for mutuality, so high-volume but relatively weak ties do not dominate the map merely by count.',
    '- Reserve a subtle taper or arrow for high-asymmetry edges only when an institution is focused; label it as exposure direction, never as causality.',
    '- Keep `N = 1` edges available in an institution or country focus view, but hide them by default in the global overview. The overview renders recurrent edges (`N ≥ 2`).',
    '',
  ].join('\n');
}

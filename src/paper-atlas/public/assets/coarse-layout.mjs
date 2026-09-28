const goldenAngle = Math.PI * (3 - Math.sqrt(5));

function quantile(values, q) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

// Build the institution-level graph before author-level forces are introduced.
// Collaboration support is divided by both institution sizes so a large lab's
// raw edge count cannot dominate a small lab's concentrated collaboration.
export function createInstitutionCoarseGraph(nodes, links, width, height) {
  const groups = new Map();
  nodes.forEach((node) => {
    const members = groups.get(node.institution) ?? [];
    members.push(node);
    groups.set(node.institution, members);
  });
  const orderedGroups = [...groups.entries()].sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
  // The coarse graph needs enough physical area for the author clouds it will
  // hand off to. A fixed viewport-sized seed works for Korea, but turns a
  // 6,000-author country into one dense central mass before forces can untangle
  // it. This is an initial layout field, not a viewport boundary: larger
  // datasets deliberately begin outside the nominal SVG and remain pannable.
  const clusterRadiusFor = (memberCount) => 18 + 11 * Math.sqrt(memberCount);
  const requiredArea = orderedGroups.reduce((sum, [, members]) => sum + Math.PI * clusterRadiusFor(members.length) ** 2, 0);
  const initialFieldScale = Math.max(1, Math.sqrt(requiredArea / (width * height * .75)));
  const hubs = orderedGroups.map(([institution, members], index) => {
    const spread = .18 + .82 * Math.sqrt((index + .5) / orderedGroups.length);
    return {
      id: `institution-hub:${index}`,
      institution,
      memberCount: members.length,
      clusterRadius: clusterRadiusFor(members.length),
      initialFieldScale,
      isInstitutionHub: true,
      x: width / 2 + Math.cos(index * goldenAngle) * spread * width * .44 * initialFieldScale,
      y: height / 2 + Math.sin(index * goldenAngle) * spread * height * .42 * initialFieldScale,
    };
  });
  const hubByInstitution = new Map(hubs.map((hub) => [hub.institution, hub]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const support = new Map();
  links.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target || source.institution === target.institution) return;
    const pair = [source.institution, target.institution].sort((left, right) => left.localeCompare(right));
    const key = pair.join('\u0000');
    support.set(key, (support.get(key) ?? 0) + (Number(edge.weight) || 1));
  });
  const coarseLinks = [...support.entries()].map(([key, rawSupport]) => {
    const [sourceInstitution, targetInstitution] = key.split('\u0000');
    const source = hubByInstitution.get(sourceInstitution);
    const target = hubByInstitution.get(targetInstitution);
    return {
      source: source.id,
      target: target.id,
      rawSupport,
      normalizedSupport: rawSupport / Math.sqrt(source.memberCount * target.memberCount),
    };
  });
  const normalizer = quantile(coarseLinks.map((edge) => edge.normalizedSupport), .9) || 1;
  coarseLinks.forEach((edge) => { edge.affinity = Math.min(1, edge.normalizedSupport / normalizer); });
  return { groups, hubs, hubByInstitution, coarseLinks };
}

// Seed authors inside their already-positioned institution region. This is the
// hand-off from the coarse graph to the detailed graph, not a viewport clamp.
export function seedAuthorsAroundInstitutions(groups, hubByInstitution) {
  [...groups.entries()].forEach(([institution, members], groupIndex) => {
    const hub = hubByInstitution.get(institution);
    members.forEach((node, index) => {
      const radial = hub.clusterRadius * Math.sqrt((index + .5) / members.length);
      const angle = groupIndex * goldenAngle + index * goldenAngle;
      node.x = hub.x + Math.cos(angle) * radial;
      node.y = hub.y + Math.sin(angle) * radial;
      node.vx = 0;
      node.vy = 0;
    });
  });
}

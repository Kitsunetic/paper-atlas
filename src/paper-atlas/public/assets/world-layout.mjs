export const WORLD_LAYOUT = Object.freeze({
  chargeStrength: -24,
  chargeDistanceMax: 240,
  collisionPadding: 10,
  countryCohesionStrength: .18,
  countrySeparationStrength: .45,
  minimumCountryDistance: 90,
});

// A single paper establishes a valid co-occurrence, but is too weak to occupy
// the global overview. It remains available whenever either endpoint is focused.
export const WORLD_OVERVIEW_MIN_SUPPORT = 2;

export function isWorldOverviewEdge(edge) {
  return edge.paperCount >= WORLD_OVERVIEW_MIN_SUPPORT;
}

export function linkAffinity(edge) {
  return Math.min(1, Math.max(0, edge.paperCount - 1) / 2) * edge.mutuality;
}

export function worldLinkDistance(edge) {
  return 128 - 32 * Math.sqrt(linkAffinity(edge));
}

export function worldLinkStrength(edge) {
  return .026 * linkAffinity(edge);
}

export function createCountryClusterForce({
  key = (node) => node.countryCode,
  cohesionStrength = WORLD_LAYOUT.countryCohesionStrength,
  separationStrength = WORLD_LAYOUT.countrySeparationStrength,
  minimumCountryDistance = WORLD_LAYOUT.minimumCountryDistance,
} = {}) {
  let nodes = [];

  const fallbackDirection = (left, right) => {
    const text = `${left}\u0000${right}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    const angle = (hash >>> 0) / 4294967296 * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  };

  const force = (alpha) => {
    const groups = new Map();
    for (const node of nodes) {
      const id = key(node);
      const group = groups.get(id) ?? { id, nodes: [], x: 0, y: 0 };
      group.nodes.push(node);
      group.x += node.x;
      group.y += node.y;
      groups.set(id, group);
    }
    const entries = [...groups.values()];
    for (const group of entries) {
      group.x /= group.nodes.length;
      group.y /= group.nodes.length;
      for (const node of group.nodes) {
        node.vx += (group.x - node.x) * cohesionStrength * alpha;
        node.vy += (group.y - node.y) * cohesionStrength * alpha;
      }
    }
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      const left = entries[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const right = entries[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distance = Math.hypot(dx, dy);
        if (distance < .001) {
          [dx, dy] = fallbackDirection(left.id, right.id);
          distance = 1;
        }
        const preferredDistance = minimumCountryDistance + 4 * (Math.sqrt(left.nodes.length) + Math.sqrt(right.nodes.length));
        if (distance >= preferredDistance) continue;
        const push = (preferredDistance - distance) / preferredDistance * separationStrength * alpha;
        const leftResponse = right.nodes.length / (left.nodes.length + right.nodes.length);
        const rightResponse = left.nodes.length / (left.nodes.length + right.nodes.length);
        const unitX = dx / distance;
        const unitY = dy / distance;
        for (const node of left.nodes) { node.vx -= unitX * push * leftResponse; node.vy -= unitY * push * leftResponse; }
        for (const node of right.nodes) { node.vx += unitX * push * rightResponse; node.vy += unitY * push * rightResponse; }
      }
    }
  };

  force.initialize = (nextNodes) => { nodes = nextNodes; };
  return force;
}

import { WORLD_LAYOUT, createCountryClusterForce, isWorldOverviewEdge, worldLinkDistance, worldLinkStrength } from './world-layout.mjs?version=country-clusters-4';
import { createSelectionEffects, escapeHtml, mountSearchCombobox, mountViewportMotion, positionTooltip } from './network-interactions.js?version=viewport-motion-2';

function countrySummary(nodes) {
  const countries = new Map();
  for (const node of nodes) {
    const entry = countries.get(node.countryCode) ?? { id: node.countryCode, name: node.countryName, nodes: new Set(), titles: new Set() };
    entry.nodes.add(node.id);
    node.titles.forEach((title) => entry.titles.add(title));
    countries.set(node.countryCode, entry);
  }
  return [...countries.values()].sort((left, right) => right.titles.size - left.titles.size || left.name.localeCompare(right.name));
}

const root = document.getElementById('paper-atlas-network');
const status = root.querySelector('.network-status');

try {
  if (!window.d3) throw new Error('The interactive network could not load because its D3 dependency is unavailable.');
  const response = await fetch('./data/eccv-2026/world.json');
  if (!response.ok) throw new Error('The ECCV 2026 institution graph payload is unavailable.');
  const payload = await response.json();
  const nodes = payload.graph.nodes.map((item) => ({ ...item }));
  const links = payload.graph.links.map((item) => ({ ...item }));
  const svg = d3.select(root).select('svg');
  const tooltip = d3.select(root).select('.tooltip');
  const legend = d3.select(root).select('.legend');
  const legendToggle = root.querySelector('.legend-toggle');
  const searchInput = root.querySelector('.network-search input');
  const searchStatus = root.querySelector('#network-search-status');
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const adjacency = new Map(nodes.map((item) => [item.id, []]));
  links.forEach((edge) => { adjacency.get(edge.source).push({ edge, id: edge.target }); adjacency.get(edge.target).push({ edge, id: edge.source }); });
  const degree = new Map(nodes.map((item) => [item.id, 0]));
  links.forEach((edge) => { degree.set(edge.source, degree.get(edge.source) + edge.paperCount); degree.set(edge.target, degree.get(edge.target) + edge.paperCount); });
  const countries = countrySummary(nodes);
  const countryById = new Map(countries.map((item, index) => [item.id, { ...item, index }]));
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const countryColor = (countryCode) => {
    if (countryCode === 'ZZ') return 'var(--network-muted)';
    const index = countryById.get(countryCode)?.index ?? 0;
    return `hsl(${Math.round((index * 137.508) % 360)}deg 76% ${isDark ? 66 : 42}%)`;
  };
  const radius = d3.scaleSqrt().domain([1, d3.max(nodes, (item) => item.paperCount) ?? 1]).range([2.8, 20]);
  const scene = svg.append('g').attr('class', 'network-scene');
  const link = scene.append('g').attr('aria-hidden', 'true').selectAll('line').data(links).join('line').attr('class', 'edge')
    .attr('stroke-width', (item) => .25 + Math.min(1.8, Math.sqrt(item.paperCount) * .32)).attr('stroke-opacity', .07);
  const node = scene.append('g').selectAll('circle').data(nodes).join('circle').attr('class', 'node')
    .attr('r', (item) => radius(item.paperCount)).attr('fill', (item) => countryColor(item.countryCode))
    .attr('aria-label', (item) => `${item.name}, ${item.countryName}, ${item.paperCount} papers`);
  const labelledNodes = [...nodes].sort((left, right) => degree.get(right.id) - degree.get(left.id) || right.paperCount - left.paperCount).slice(0, 16);
  const labels = scene.append('g').attr('aria-hidden', 'true').selectAll('text').data(labelledNodes).join('text').attr('class', 'label').attr('display', 'none').text((item) => item.name);
  const selection = createSelectionEffects({
    svg, scene, nodeById, adjacency, radius: (item) => radius(item.paperCount), color: (item) => countryColor(item.countryCode), label: (item) => `Selected · ${item.name}`, maxDepth: 1,
  });
  let selectedCountry = null;
  let selectedNodeId = null;
  let expanded = false;

  const endpointId = (endpoint) => typeof endpoint === 'string' ? endpoint : endpoint.id;
  const edgeTouches = (edge, nodeIds) => nodeIds.has(endpointId(edge.source)) || nodeIds.has(endpointId(edge.target));
  const visibleEdge = (edge, selectedNodes, countryNodes) => isWorldOverviewEdge(edge)
    || selectedNodes !== null && edgeTouches(edge, selectedNodes)
    || countryNodes !== null && edgeTouches(edge, countryNodes);

  const applyEmphasis = () => {
    const neighbours = selectedNodeId === null ? null : new Set(selection.traversal(selectedNodeId).distances.keys());
    const selectedNodes = selectedNodeId === null ? null : new Set([selectedNodeId]);
    const countryNodes = selectedCountry === null ? null : countryById.get(selectedCountry).nodes;
    node.attr('opacity', (item) => !neighbours && !countryNodes || neighbours?.has(item.id) || countryNodes?.has(item.id) ? 1 : .12)
      .attr('stroke', (item) => item.id === selectedNodeId ? countryColor(item.countryCode) : null)
      .attr('stroke-width', (item) => item.id === selectedNodeId ? 1.25 : neighbours?.has(item.id) || countryNodes?.has(item.id) ? 2 : 1.25)
      .attr('filter', (item) => item.id === selectedNodeId ? selection.glowFilter : null);
    labels.attr('opacity', (item) => !neighbours && !countryNodes || neighbours?.has(item.id) || countryNodes?.has(item.id) ? 1 : .14);
    link.attr('display', (edge) => visibleEdge(edge, selectedNodes, countryNodes) ? null : 'none').attr('stroke-opacity', (edge) => {
      if (neighbours) return edge.source.id === selectedNodeId || edge.target.id === selectedNodeId ? .7 : .035;
      if (countryNodes) return countryNodes.has(edge.source.id) || countryNodes.has(edge.target.id) ? .45 : .015;
      return .07;
    });
    selection.updateMarker(selectedNodeId);
  };
  const renderLegend = () => {
    legend.classed('is-collapsed', !expanded);
    legendToggle.setAttribute('aria-expanded', String(expanded));
    legendToggle.textContent = expanded ? 'Hide countries ▲' : `Show all ${countries.length} countries ▾`;
    const items = legend.selectAll('button.legend-item').data(countries, (item) => item.id).join((enter) => {
      const button = enter.append('button').attr('type', 'button').attr('class', 'legend-item');
      button.append('span').attr('class', 'swatch'); button.append('span').attr('class', 'legend-name'); return button;
    });
    items.attr('class', (item) => `legend-item${selectedCountry === item.id ? ' is-selected' : selectedCountry ? ' is-muted' : ''}`)
      .attr('aria-pressed', (item) => String(selectedCountry === item.id)).attr('aria-label', (item) => `${item.name}, ${item.titles.size} papers`)
      .on('click', (event, item) => { event.stopPropagation(); selection.clearPulse(); selectedNodeId = null; selectedCountry = selectedCountry === item.id ? null : item.id; tooltip.style('display', 'none'); renderLegend(); applyEmphasis(); });
    items.select('.swatch').style('background', (item) => countryColor(item.id));
    items.select('.legend-name').text((item) => `${item.name} (${item.titles.size})`);
  };
  const revealUnclutteredLabels = () => {
    const occupied = [];
    labels.each(function (item) {
      const left = item.x + radius(item.paperCount) + 4;
      const top = item.y - radius(item.paperCount) - 13;
      const bounds = { left, right: left + Math.min(210, item.name.length * 5.8), top, bottom: top + 13 };
      const overlaps = occupied.some((other) => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top);
      d3.select(this).attr('display', overlaps ? 'none' : null);
      if (!overlaps) occupied.push(bounds);
    });
  };
  let labelsRevealed = false;
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((item) => item.id).distance(worldLinkDistance).strength(worldLinkStrength))
    .force('charge', d3.forceManyBody().strength(WORLD_LAYOUT.chargeStrength).distanceMax(WORLD_LAYOUT.chargeDistanceMax))
    .force('collide', d3.forceCollide().radius((item) => radius(item.paperCount) + WORLD_LAYOUT.collisionPadding).iterations(2))
    .force('country-cluster', createCountryClusterForce())
    .force('center', d3.forceCenter(590, 360))
    .on('tick', () => {
      link.attr('x1', (edge) => edge.source.x).attr('y1', (edge) => edge.source.y).attr('x2', (edge) => edge.target.x).attr('y2', (edge) => edge.target.y);
      node.attr('cx', (item) => item.x).attr('cy', (item) => item.y);
      labels.attr('transform', (item) => `translate(${item.x + radius(item.paperCount) + 4},${item.y - radius(item.paperCount) - 3})`);
      selection.updateMarker(selectedNodeId);
      selection.renderPulse();
      if (!labelsRevealed && simulation.alpha() < .35) { revealUnclutteredLabels(); labelsRevealed = true; }
    }).on('end', () => { if (!labelsRevealed) revealUnclutteredLabels(); });
  const drag = d3.drag().on('start', (event, item) => { event.sourceEvent?.stopPropagation(); if (!event.active) simulation.alphaTarget(.22).restart(); item.fx = item.x; item.fy = item.y; })
    .on('drag', (event, item) => { item.fx = event.x; item.fy = event.y; }).on('end', (event, item) => { if (!event.active) simulation.alphaTarget(0); item.fx = item.x; item.fy = item.y; });
  node.call(drag);
  const zoom = d3.zoom().scaleExtent([.25, 8]).on('zoom', (event) => scene.attr('transform', event.transform));
  svg.call(zoom);
  mountViewportMotion({ root, svg, zoom });
  const hideTooltip = () => tooltip.style('display', 'none');
  const showTooltip = (event, item) => {
    const titles = item.titles.slice(0, 3).map((title) => `<li>${escapeHtml(title)}</li>`).join('');
    tooltip.html(`<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.countryName)}</span><br><span>${item.paperCount} selected papers · ${adjacency.get(item.id).length} partner institutions</span>${titles ? `<span class="tooltip-divider" aria-hidden="true"></span><ul class="tooltip-papers">${titles}</ul>` : ''}`).style('display', 'block');
    positionTooltip(root, tooltip, event);
  };
  const toggleNode = (item) => {
    selectedCountry = null;
    if (selectedNodeId === item.id) { selection.clearPulse(); selectedNodeId = null; hideTooltip(); renderLegend(); applyEmphasis(); return false; }
    selectedNodeId = item.id; hideTooltip(); renderLegend(); applyEmphasis(); selection.startPulse(item.id); return true;
  };
  node.on('pointerenter', showTooltip).on('pointermove', (event) => positionTooltip(root, tooltip, event)).on('pointerleave', hideTooltip).on('click', (event, item) => { event.stopPropagation(); toggleNode(item); });
  const clearHighlight = () => { selection.clearPulse(); selectedCountry = null; selectedNodeId = null; hideTooltip(); renderLegend(); applyEmphasis(); };
  svg.on('click.clear-highlight', (event) => { if (event.target === svg.node()) clearHighlight(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && (selectedCountry !== null || selectedNodeId !== null)) clearHighlight();
  });
  legendToggle.addEventListener('click', () => { expanded = !expanded; renderLegend(); if (!expanded) legend.node().scrollTop = 0; });
  mountSearchCombobox({
    root, input: searchInput, results: root.querySelector('#network-author-results'), items: () => nodes,
    getLabel: (item) => item.name, getDetail: (item) => item.countryName,
    noResults: (query) => `No institution matches for "${query}".`,
    compare: (left, right) => Number(!left.name.toLocaleLowerCase().startsWith(searchInput.value.trim().toLocaleLowerCase())) - Number(!right.name.toLocaleLowerCase().startsWith(searchInput.value.trim().toLocaleLowerCase())) || right.paperCount - left.paperCount || left.name.localeCompare(right.name),
    onSelect: (item) => { const selected = toggleNode(item); searchStatus.textContent = selected ? `${item.name}: ${item.paperCount} selected papers.` : ''; searchStatus.style.display = selected ? 'block' : 'none'; },
  });
  renderLegend(); applyEmphasis(); simulation.alpha(1).restart();
} catch (error) {
  status.textContent = error.message;
  status.style.display = 'block';
}

import { createSelectionEffects, escapeHtml, mountSearchCombobox, mountViewportMotion, positionTooltip } from './network-interactions.js?version=viewport-motion-2';
import { createInstitutionCoarseGraph, seedAuthorsAroundInstitutions } from './coarse-layout.mjs?version=coarse-layout-2';

// Canonical country renderer: a module extraction of the ECCV Korea visualizer.
// Every country route renders its complete first-author-country cohort; it does
// not split universities, research institutes, or companies into UI categories.
export function mountCountryAuthorNetwork(root, payload) {
  const status = root.querySelector('.network-status');
  if (!window.d3) {
    status.textContent = 'The interactive network could not load because its D3 dependency is unavailable.';
    status.style.display = 'block';
    return;
  }
  const graph = payload.graph;
  const hasGraph = graph.nodes.length > 0;
  const svg = d3.select(root).select('svg');
  if (!hasGraph) svg.attr('aria-label', 'Empty coauthor network.');
  const legend = d3.select(root).select('.legend');
  const legendToggle = root.querySelector('.legend-toggle');
  const tooltip = d3.select(root).select('.tooltip');
  const searchInput = root.querySelector('.network-search input');
  const searchStatus = root.querySelector('#network-search-status');
  const visibleCounts = new Map();
  const visiblePapers = new Map();
  graph.nodes.forEach((node) => {
    const institution = node.institution || 'Unresolved affiliation';
    visibleCounts.set(institution, (visibleCounts.get(institution) ?? 0) + 1);
    const papers = visiblePapers.get(institution) ?? new Set();
    node.titles.forEach((title) => papers.add(title));
    visiblePapers.set(institution, papers);
  });
  const legendData = [...visibleCounts.entries()]
    .map(([name, authors]) => ({ name, authors, papers: visiblePapers.get(name).size }))
    .sort((left, right) => right.papers - left.papers || right.authors - left.authors || left.name.localeCompare(right.name));
  const css = getComputedStyle(root);
  const palette = Array.from({ length: 12 }, (_, index) => css.getPropertyValue(`--network-c${index + 1}`).trim() || 'CanvasText');
  const institutionIndex = new Map(legendData.map((item, index) => [item.name, index]));
  const color = (institution) => {
    const index = institutionIndex.get(institution);
    if (index === undefined) return 'var(--network-muted)';
    const base = palette[index % palette.length];
    const strength = index < palette.length ? 100 : 48;
    return `color-mix(in srgb, ${base} ${strength}%, var(--network-background))`;
  };
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const links = graph.links.map((edge) => ({ ...edge }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeAriaLabel = (item, isSelected = false) => `${item.name}, ${item.institution || 'Unresolved affiliation'}, ${item.papers} paper${item.papers === 1 ? '' : 's'}, ${item.firstAuthorPapers ?? 0} first-author paper${item.firstAuthorPapers === 1 ? '' : 's'}${isSelected ? ', selected focus' : ''}`;
  const crossInstitutionDegree = new Map(nodes.map((node) => [node.id, 0]));
  links.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    edge.crossInstitution = source.institution !== target.institution;
    if (edge.crossInstitution) {
      crossInstitutionDegree.set(source.id, crossInstitutionDegree.get(source.id) + 1);
      crossInstitutionDegree.set(target.id, crossInstitutionDegree.get(target.id) + 1);
    }
  });
  const width = 1180;
  const height = 720;
  const { groups, hubs, hubByInstitution, coarseLinks } = createInstitutionCoarseGraph(nodes, links, width, height);
  // Reserve most of every future author cloud's footprint during the coarse
  // phase. The former 68px cap collapsed large-country hubs into the center
  // before fine author forces had a chance to separate them.
  const coarseCollisionRadius = (hub) => Math.max(24, hub.clusterRadius * .72);
  const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
  const initialFieldScale = hubs[0]?.initialFieldScale ?? 1;
  const largeGraphScale = Math.min(3, initialFieldScale);
  const endpointHub = (endpoint) => typeof endpoint === 'string' ? hubById.get(endpoint) : endpoint;
  const coarseLinkDistance = (edge) => {
    const source = endpointHub(edge.source);
    const target = endpointHub(edge.target);
    const reservedDistance = (source ? coarseCollisionRadius(source) : 0) + (target ? coarseCollisionRadius(target) : 0);
    return Math.max(reservedDistance, 250 - 135 * edge.affinity);
  };
  const repelHubs = (alpha) => {
    for (let left = 0; left < hubs.length; left += 1) for (let right = left + 1; right < hubs.length; right += 1) {
      const source = hubs[left]; const target = hubs[right];
      const dx = target.x - source.x || .01; const dy = target.y - source.y || .01;
      const strength = alpha * (660 + 31 * Math.sqrt(source.memberCount * target.memberCount)) / Math.max(576, dx * dx + dy * dy);
      source.vx -= dx * strength; source.vy -= dy * strength; target.vx += dx * strength; target.vy += dy * strength;
    }
  };
  // Stage 1: settle only the institution graph. The result becomes the author
  // layout's initial condition rather than allowing all authors to converge
  // before institution positions have any global structure.
  const coarseSimulation = d3.forceSimulation(hubs)
    .force('coarse-link', d3.forceLink(coarseLinks).id((item) => item.id).distance(coarseLinkDistance).strength((edge) => .025 + .12 * edge.affinity))
    .force('coarse-charge', d3.forceManyBody().strength((hub) => -83 - 9 * Math.sqrt(hub.memberCount)))
    .force('coarse-collide', d3.forceCollide().radius(coarseCollisionRadius).iterations(2))
    .force('coarse-repel', repelHubs)
    // Unlike forceCenter, this is a real restoring force: its pull grows with
    // radial distance, so weakly connected groups cannot drift indefinitely.
    .force('radial-confinement', d3.forceRadial(0, width / 2, height / 2).strength(.035 / initialFieldScale))
    .force('center', d3.forceCenter(width / 2, height / 2)).stop();
  for (let tick = 0; tick < 240; tick += 1) coarseSimulation.tick();
  coarseSimulation.stop();
  seedAuthorsAroundInstitutions(groups, hubByInstitution);
  const paperRadius = d3.scaleSqrt().domain([1, d3.max(nodes, (node) => node.papers) ?? 1]).range([3, 18]);
  const collaborationRadius = d3.scaleSqrt().domain([0, d3.max(nodes, (node) => node.weightedDegree) ?? 0]).range([0, 7]);
  const radius = (node) => Math.min(28, paperRadius(node.papers) + collaborationRadius(node.weightedDegree));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  links.forEach((edge) => {
    adjacency.get(edge.source).push({ edge, id: edge.target });
    adjacency.get(edge.target).push({ edge, id: edge.source });
  });
  const scene = svg.append('g').attr('class', 'network-scene');
  const link = scene.append('g').attr('aria-hidden', 'true').selectAll('line').data(links).join('line')
    .attr('class', 'edge').attr('stroke-width', (edge) => .42 + Math.min(1.7, edge.weight * .45)).attr('stroke-opacity', .18);
  const node = scene.append('g').selectAll('circle').data(nodes).join('circle').attr('class', 'node').attr('r', radius).attr('fill', (item) => color(item.institution)).attr('aria-label', (item) => nodeAriaLabel(item));
  const labels = scene.append('g').attr('aria-hidden', 'true').selectAll('text').data([...nodes].sort((left, right) => right.weightedDegree - left.weightedDegree || right.papers - left.papers || right.degree - left.degree).slice(0, 18)).join('text').attr('class', 'label').text((item) => item.name);
  const selection = createSelectionEffects({
    svg, scene, nodeById, adjacency, radius, color: (item) => color(item.institution), label: (item) => `Selected · ${item.name}`,
  });
  let selectedInstitution = null;
  let selectedNodeId = null;
  let expanded = false;

  const applyEmphasis = (hoveredId = null) => {
    if (selectedNodeId !== null) {
      const active = new Set(selection.traversal(selectedNodeId).distances.keys());
      node.attr('opacity', (item) => active.has(item.id) ? 1 : .13)
        .attr('stroke', (item) => item.id === selectedNodeId ? color(item.institution) : null)
        .attr('stroke-width', (item) => item.id === selectedNodeId ? 1.25 : active.has(item.id) ? 2.2 : 1.25)
        .attr('filter', (item) => item.id === selectedNodeId ? selection.glowFilter : null)
        .attr('aria-label', (item) => nodeAriaLabel(item, item.id === selectedNodeId));
      labels.attr('opacity', (item) => active.has(item.id) ? 1 : .15);
      link.attr('stroke-opacity', (edge) => active.has(edge.source.id) && active.has(edge.target.id) ? .76 : .035);
      selection.updateMarker(selectedNodeId);
      return;
    }
    const focused = selectedInstitution !== null;
    node.attr('opacity', (item) => !focused || item.institution === selectedInstitution ? 1 : .13)
      .attr('stroke', null).attr('stroke-width', (item) => focused && item.institution === selectedInstitution ? 2.2 : 1.25).attr('filter', null)
      .attr('aria-label', (item) => nodeAriaLabel(item));
    labels.attr('opacity', (item) => !focused || item.institution === selectedInstitution ? 1 : .15);
    link.attr('stroke-opacity', (edge) => {
      if (focused && edge.source.institution !== selectedInstitution && edge.target.institution !== selectedInstitution) return .035;
      return hoveredId && (edge.source.id === hoveredId || edge.target.id === hoveredId) ? .76 : .18;
    });
    selection.updateMarker(null);
  };
  const renderLegend = () => {
    legend.attr('hidden', hasGraph ? null : true).classed('is-collapsed', !expanded);
    legendToggle.hidden = !hasGraph;
    legendToggle.setAttribute('aria-expanded', String(expanded));
    legendToggle.textContent = expanded ? 'Hide institutions ▲' : `Show all ${legendData.length} institutions ▾`;
    const items = legend.selectAll('button.legend-item').data(legendData, (item) => item.name).join((enter) => {
      const button = enter.append('button').attr('type', 'button').attr('class', 'legend-item');
      button.append('span').attr('class', 'swatch');
      button.append('span').attr('class', 'legend-name');
      return button;
    });
    items.attr('class', (item) => `legend-item${selectedInstitution === item.name ? ' is-selected' : selectedInstitution ? ' is-muted' : ''}`)
      .attr('aria-pressed', (item) => String(selectedInstitution === item.name)).attr('aria-label', (item) => `${item.name}, ${item.papers} papers`)
      .on('click', (event, item) => {
        event.stopPropagation();
        selection.clearPulse(); selectedNodeId = null; selectedInstitution = selectedInstitution === item.name ? null : item.name;
        tooltip.style('display', 'none'); renderLegend(); applyEmphasis();
      });
    items.select('.swatch').style('background', (item) => color(item.name));
    items.select('.legend-name').text((item) => `${item.name} (${item.papers})`);
  };
  const renderLayout = () => {
    link.attr('x1', (edge) => edge.source.x).attr('y1', (edge) => edge.source.y).attr('x2', (edge) => edge.target.x).attr('y2', (edge) => edge.target.y);
    node.attr('cx', (item) => item.x).attr('cy', (item) => item.y);
    labels.attr('x', (item) => item.x + 7).attr('y', (item) => item.y - 7);
    selection.updateMarker(selectedNodeId);
    selection.renderPulse();
  };
  // Stage 2: reveal authors around their coarse institution centers. Hubs are
  // fixed reference points here; a soft cluster force retains group structure
  // while author-level coauthor links can still bridge institutions.
  const clusterAuthors = (alpha) => {
    nodes.forEach((item) => {
      const hub = hubByInstitution.get(item.institution);
      const strength = (crossInstitutionDegree.get(item.id) > 0 ? .0075 : .016) * largeGraphScale;
      item.vx += (hub.x - item.x) * strength * alpha;
      item.vy += (hub.y - item.y) * strength * alpha;
    });
  };
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((item) => item.id).distance((edge) => edge.crossInstitution ? Math.max(58, (94 - edge.weight * 7) * largeGraphScale) : Math.max(28, 62 - edge.weight * 7)).strength((edge) => edge.crossInstitution ? Math.min(.11, .025 + edge.weight * .015) / largeGraphScale : Math.min(.15, .065 + edge.weight * .02)))
    .force('charge', d3.forceManyBody().strength(-18 * Math.sqrt(largeGraphScale)).distanceMax(220 * largeGraphScale))
    .force('collide', d3.forceCollide().radius((item) => radius(item) + 3).iterations(2))
    .force('institution-cluster', clusterAuthors)
    .on('tick', renderLayout);
  const drag = d3.drag().on('start', (event, item) => {
    event.sourceEvent?.stopPropagation();
    if (!event.active) simulation.alphaTarget(.22).restart();
    item.fx = item.x; item.fy = item.y;
  }).on('drag', (event, item) => {
    item.fx = event.x; item.fy = event.y;
  }).on('end', (event, item) => {
    if (!event.active) simulation.alphaTarget(0);
    item.fx = item.x; item.fy = item.y;
  });
  node.call(drag);
  const zoom = d3.zoom().scaleExtent([.25, 8]).on('zoom', (event) => scene.attr('transform', event.transform));
  svg.call(zoom);
  mountViewportMotion({ root, svg, zoom });
  const hideTooltip = () => { applyEmphasis(); tooltip.style('display', 'none'); };
  const showTooltip = (event, item) => {
    applyEmphasis(item.id);
    const paperSummaries = item.paperSummaries ?? item.titles.map((title) => ({ title, isFirstAuthor: false, presentationTypes: [] }));
    const titles = paperSummaries.slice(0, 3).map((paper) => {
      const badges = [
        paper.isFirstAuthor ? '<span class="tooltip-paper-badge is-first-author">First author</span>' : '',
        ...(paper.presentationTypes ?? []).filter((type) => type === 'Oral' || type === 'Spotlight')
          .map((type) => `<span class="tooltip-paper-badge is-${type.toLowerCase()}">${type}</span>`),
      ].filter(Boolean).join('');
      return `<li><span class="tooltip-paper-title${paper.isFirstAuthor ? ' is-first-author' : ''}">${escapeHtml(paper.title)}</span>${badges ? `<span class="tooltip-paper-meta">${badges}</span>` : ''}</li>`;
    }).join('');
    const presentations = [
      item.oralPapers ? `Oral papers: ${item.oralPapers}` : '',
      item.spotlightPapers ? `Spotlight papers: ${item.spotlightPapers}` : '',
    ].filter(Boolean).join(' · ');
    tooltip.html(`<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.institution || 'Unresolved affiliation')}</span><br><span>Papers: ${item.papers} · First-author papers: ${item.firstAuthorPapers ?? 0}</span>${presentations ? `<br><span>${presentations}</span>` : ''}${titles ? `<span class="tooltip-divider" aria-hidden="true"></span><ul class="tooltip-papers">${titles}</ul>` : ''}`).style('display', 'block');
    positionTooltip(root, tooltip, event);
  };
  const toggleNode = (item) => {
    if (selectedNodeId === item.id) { selection.clearPulse(); selectedNodeId = null; hideTooltip(); renderLegend(); return false; }
    selectedInstitution = null; selectedNodeId = item.id; hideTooltip(); renderLegend(); selection.startPulse(item.id); return true;
  };
  node.on('pointerenter', showTooltip).on('pointermove', (event) => positionTooltip(root, tooltip, event)).on('pointerleave', hideTooltip)
    .on('click', (event, item) => { event.stopPropagation(); toggleNode(item); });
  const clearHighlight = () => { selection.clearPulse(); selectedNodeId = null; selectedInstitution = null; hideTooltip(); renderLegend(); };
  svg.on('click.clear-highlight', (event) => { if (event.target === svg.node()) clearHighlight(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && (selectedNodeId !== null || selectedInstitution !== null)) clearHighlight();
  });
  legendToggle.addEventListener('click', () => { expanded = !expanded; renderLegend(); if (!expanded) legend.node().scrollTop = 0; });
  mountSearchCombobox({
    root, input: searchInput, results: root.querySelector('#network-author-results'), items: () => nodes,
    getLabel: (item) => item.name, getDetail: (item) => item.institution || 'Unresolved affiliation',
    noResults: (query) => `No author matches for "${query}".`,
    compare: (left, right) => Number(!left.name.toLocaleLowerCase().startsWith(searchInput.value.trim().toLocaleLowerCase())) - Number(!right.name.toLocaleLowerCase().startsWith(searchInput.value.trim().toLocaleLowerCase())) || left.name.localeCompare(right.name) || (left.institution || '').localeCompare(right.institution || ''),
    onInput: (query) => { if (!query) { clearHighlight(); searchStatus.style.display = 'none'; } },
    onSelect: (item) => { const selected = toggleNode(item); const firstAuthorPapers = item.firstAuthorPapers ?? 0; searchStatus.textContent = selected ? `${item.name}: ${item.papers} papers, ${firstAuthorPapers} first-author paper${firstAuthorPapers === 1 ? '' : 's'}.` : ''; searchStatus.style.display = selected ? 'block' : 'none'; },
  });
  renderLegend(); applyEmphasis();
  simulation.alpha(1).restart();
}

// Kept briefly for consumers that imported the pre-extraction name.
export const mountAuthorNetwork = mountCountryAuthorNetwork;

const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function moveTooltip(root, tooltip, event) {
  const frame = root.querySelector('.network-frame').getBoundingClientRect();
  const target = event.currentTarget?.getBoundingClientRect();
  const clientX = Number.isFinite(event.clientX) ? event.clientX : target.left + target.width / 2;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : target.top + target.height / 2;
  const bounds = tooltip.node().getBoundingClientRect();
  tooltip.style('left', `${Math.max(8, Math.min(clientX - frame.left + 12, frame.width - bounds.width - 8))}px`)
    .style('top', `${Math.max(8, Math.min(clientY - frame.top + 12, frame.height - bounds.height - 8))}px`);
}

function countingMode(root) {
  const query = new URL(window.location.href);
  const mode = query.searchParams.get('counting') === 'fractional' ? 'fractional' : 'full';
  if (query.searchParams.get('counting') !== mode) {
    query.searchParams.set('counting', mode);
    window.history.replaceState(null, '', query);
  }
  root.querySelectorAll('input[name="counting"]').forEach((input) => {
    input.checked = input.value === mode;
    input.addEventListener('change', () => {
      query.searchParams.set('counting', input.value);
      window.location.assign(query.href);
    });
  });
  return mode;
}

const root = document.getElementById('paper-atlas-network');
const status = root.querySelector('.network-status');

try {
  if (!window.d3) throw new Error('The interactive network could not load because its D3 dependency is unavailable.');
  const response = await fetch('./data/eccv-2026/world.json');
  if (!response.ok) throw new Error('The ECCV 2026 world graph payload is unavailable.');
  const payload = await response.json();
  const mode = countingMode(root);
  const measure = mode === 'fractional' ? 'fractionalPaperCount' : 'paperCount';
  const number = (value) => mode === 'fractional' ? value.toFixed(1).replace(/\.0$/u, '') : String(value);
  const nodes = payload.graph.nodes.map((node) => ({ ...node }));
  const links = payload.graph.links.map((link) => ({ ...link }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  links.forEach((link) => { adjacency.get(link.source).push(link.target); adjacency.get(link.target).push(link.source); });
  const svg = d3.select(root).select('svg');
  const scene = svg.append('g').attr('class', 'network-scene');
  const tooltip = d3.select(root).select('.tooltip');
  const legend = d3.select(root).select('.legend');
  const legendToggle = root.querySelector('.legend-toggle');
  const searchInput = root.querySelector('.network-search input');
  const searchStatus = root.querySelector('#network-search-status');
  const palette = Array.from({ length: 12 }, (_, index) => getComputedStyle(root).getPropertyValue(`--network-c${index + 1}`).trim());
  const orderedNodes = [...nodes].sort((left, right) => right[measure] - left[measure] || left.name.localeCompare(right.name));
  const indexById = new Map(orderedNodes.map((node, index) => [node.id, index]));
  const color = (id) => palette[(indexById.get(id) ?? 0) % palette.length] || 'CanvasText';
  const radius = d3.scaleSqrt().domain([0, d3.max(nodes, (node) => node[measure]) ?? 1]).range([6, 28]);
  const link = scene.append('g').attr('aria-hidden', 'true').selectAll('line').data(links).join('line').attr('class', 'edge')
    .attr('stroke-width', (edge) => .6 + Math.min(3, Math.sqrt(edge[measure]) * .45)).attr('stroke-opacity', .24);
  const node = scene.append('g').selectAll('circle').data(nodes).join('circle').attr('class', 'node').attr('r', (item) => radius(item[measure])).attr('fill', (item) => color(item.id));
  const labels = scene.append('g').attr('aria-hidden', 'true').selectAll('text').data(orderedNodes.slice(0, 12)).join('text').attr('class', 'label').text((item) => item.name);
  let selectedId = null;
  let expanded = false;
  const neighborhood = (id) => new Set([id, ...(adjacency.get(id) ?? [])]);
  const applyEmphasis = (hoveredId = null) => {
    const focused = selectedId === null ? null : neighborhood(selectedId);
    node.attr('opacity', (item) => !focused || focused.has(item.id) ? 1 : .13)
      .attr('stroke-width', (item) => selectedId === item.id ? 3 : focused?.has(item.id) ? 2.2 : 1.25)
      .attr('stroke', (item) => selectedId === item.id ? color(item.id) : null);
    labels.attr('opacity', (item) => !focused || focused.has(item.id) ? 1 : .15);
    link.attr('stroke-opacity', (edge) => {
      if (focused && !focused.has(edge.source.id) && !focused.has(edge.target.id)) return .035;
      return hoveredId && (edge.source.id === hoveredId || edge.target.id === hoveredId) ? .8 : .24;
    });
  };
  const renderLegend = () => {
    legend.classed('is-collapsed', !expanded);
    legendToggle.setAttribute('aria-expanded', String(expanded));
    legendToggle.textContent = expanded ? 'Hide countries ▲' : `Show all ${orderedNodes.length} countries ▾`;
    const items = legend.selectAll('button.legend-item').data(orderedNodes, (item) => item.id).join((enter) => {
      const button = enter.append('button').attr('type', 'button').attr('class', 'legend-item');
      button.append('span').attr('class', 'swatch'); button.append('span').attr('class', 'legend-name'); return button;
    });
    items.attr('class', (item) => `legend-item${selectedId === item.id ? ' is-selected' : selectedId ? ' is-muted' : ''}`)
      .attr('aria-pressed', (item) => String(selectedId === item.id)).attr('aria-label', (item) => `${item.name}, ${number(item[measure])} papers`)
      .on('click', (event, item) => { event.stopPropagation(); selectedId = selectedId === item.id ? null : item.id; tooltip.style('display', 'none'); renderLegend(); applyEmphasis(); });
    items.select('.swatch').style('background', (item) => color(item.id));
    items.select('.legend-name').text((item) => `${item.name} (${number(item[measure])})`);
  };
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((item) => item.id).distance((edge) => Math.max(72, 176 - Math.sqrt(edge[measure]) * 18)).strength(.3))
    .force('charge', d3.forceManyBody().strength(-420).distanceMax(620))
    .force('collide', d3.forceCollide().radius((item) => radius(item[measure]) + 6).iterations(2))
    .force('center', d3.forceCenter(590, 360))
    .force('x', d3.forceX(590).strength(.025))
    .force('y', d3.forceY(360).strength(.025))
    .on('tick', () => {
      link.attr('x1', (edge) => edge.source.x).attr('y1', (edge) => edge.source.y).attr('x2', (edge) => edge.target.x).attr('y2', (edge) => edge.target.y);
      node.attr('cx', (item) => item.x).attr('cy', (item) => item.y);
      labels.attr('x', (item) => item.x + radius(item[measure]) + 4).attr('y', (item) => item.y - radius(item[measure]) - 3);
    });
  const drag = d3.drag().on('start', (event, item) => { event.sourceEvent?.stopPropagation(); if (!event.active) simulation.alphaTarget(.22).restart(); item.fx = item.x; item.fy = item.y; })
    .on('drag', (event, item) => { item.fx = event.x; item.fy = event.y; }).on('end', (event, item) => { if (!event.active) simulation.alphaTarget(0); item.fx = item.x; item.fy = item.y; });
  node.call(drag);
  svg.call(d3.zoom().scaleExtent([.25, 8]).on('zoom', (event) => scene.attr('transform', event.transform)));
  const showTooltip = (event, item) => {
    applyEmphasis(item.id);
    const titles = item.titles.slice(0, 3).map((title) => `<li>${escapeHtml(title)}</li>`).join('');
    tooltip.html(`<strong>${escapeHtml(item.name)}</strong><span>${number(item[measure])} ${mode === 'fractional' ? 'fractional' : 'full-count'} papers · ${item.organizationCount} institutions · ${adjacency.get(item.id).length} partner countries</span>${titles ? `<span class="tooltip-divider" aria-hidden="true"></span><ul class="tooltip-papers">${titles}</ul>` : ''}`).style('display', 'block');
    moveTooltip(root, tooltip, event);
  };
  const hideTooltip = () => { applyEmphasis(); tooltip.style('display', 'none'); };
  const toggleNode = (item) => { selectedId = selectedId === item.id ? null : item.id; tooltip.style('display', 'none'); renderLegend(); applyEmphasis(); return selectedId === item.id; };
  node.on('pointerenter', showTooltip).on('pointermove', (event) => moveTooltip(root, tooltip, event)).on('pointerleave', hideTooltip)
    .on('click', (event, item) => { event.stopPropagation(); toggleNode(item); });
  svg.on('click.clear-highlight', (event) => { if (event.target === svg.node()) { selectedId = null; tooltip.style('display', 'none'); renderLegend(); applyEmphasis(); } });
  legendToggle.addEventListener('click', () => { expanded = !expanded; renderLegend(); if (!expanded) legend.node().scrollTop = 0; });
  const results = root.querySelector('#network-author-results');
  let matches = []; let activeMatch = -1;
  const closeResults = () => { results.hidden = true; results.replaceChildren(); matches = []; activeMatch = -1; searchInput.setAttribute('aria-expanded', 'false'); searchInput.removeAttribute('aria-activedescendant'); };
  const selectMatch = (item) => { closeResults(); searchInput.value = item.name; const selected = toggleNode(item); searchStatus.textContent = selected ? `${item.name}: ${number(item[measure])} ${mode === 'fractional' ? 'fractional' : 'full-count'} papers.` : ''; searchStatus.style.display = selected ? 'block' : 'none'; };
  const renderResults = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    if (!query) { closeResults(); return; }
    matches = orderedNodes.filter((item) => item.name.toLocaleLowerCase().includes(query)).slice(0, 10); activeMatch = matches.length ? 0 : -1; results.replaceChildren();
    if (!matches.length) { const noResults = document.createElement('li'); noResults.className = 'network-author-no-results'; noResults.textContent = `No country matches for "${searchInput.value}".`; results.append(noResults); }
    matches.forEach((item, index) => { const entry = document.createElement('li'); const button = document.createElement('button'); button.type = 'button'; button.id = `network-author-result-${index}`; button.className = `network-author-result${index === activeMatch ? ' is-active' : ''}`; button.setAttribute('role', 'option'); button.innerHTML = `<span>${escapeHtml(item.name)}</span><span class="network-author-result-institution">${number(item[measure])} papers</span>`; button.addEventListener('click', () => selectMatch(item)); entry.append(button); results.append(entry); });
    results.hidden = false; searchInput.setAttribute('aria-expanded', 'true'); if (activeMatch >= 0) searchInput.setAttribute('aria-activedescendant', `network-author-result-${activeMatch}`);
  };
  const setActiveMatch = (index) => { if (!matches.length) return; activeMatch = (index + matches.length) % matches.length; results.querySelectorAll('.network-author-result').forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === activeMatch)); searchInput.setAttribute('aria-activedescendant', `network-author-result-${activeMatch}`); };
  searchInput.addEventListener('input', renderResults); searchInput.addEventListener('focus', renderResults);
  searchInput.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveMatch(activeMatch + 1); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveMatch(activeMatch - 1); } else if (event.key === 'Enter' && activeMatch >= 0) { event.preventDefault(); selectMatch(matches[activeMatch]); } else if (event.key === 'Escape') closeResults(); });
  document.addEventListener('pointerdown', (event) => { if (!root.querySelector('.network-author-picker').contains(event.target)) closeResults(); });
  renderLegend(); applyEmphasis(); simulation.alpha(1).restart();
} catch (error) {
  status.textContent = error.message;
  status.style.display = 'block';
}

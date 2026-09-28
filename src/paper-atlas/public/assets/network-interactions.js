let effectSequence = 0;

export const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function positionTooltip(root, tooltip, event) {
  const frame = root.querySelector('.network-frame').getBoundingClientRect();
  const target = event.currentTarget?.getBoundingClientRect();
  const x = Number.isFinite(event.clientX) ? event.clientX : target.left + target.width / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : target.top + target.height / 2;
  const bounds = tooltip.node().getBoundingClientRect();
  tooltip.style('left', `${Math.max(8, Math.min(x - frame.left + 12, frame.width - bounds.width - 8))}px`)
    .style('top', `${Math.max(8, Math.min(y - frame.top + 12, frame.height - bounds.height - 8))}px`);
}

export function traverseGraph(adjacency, startId, maxDepth = Infinity) {
  const distances = new Map([[startId, 0]]);
  const tree = [];
  const queue = [startId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentId = queue[cursor];
    const currentDistance = distances.get(currentId);
    if (currentDistance >= maxDepth) continue;
    for (const entry of adjacency.get(currentId) ?? []) {
      if (distances.has(entry.id)) continue;
      const distance = currentDistance + 1;
      distances.set(entry.id, distance);
      tree.push({ ...entry, distance, sourceId: currentId, targetId: entry.id });
      queue.push(entry.id);
    }
  }
  return { distances, tree };
}

function keyboardTargetAcceptsTextOrControl(target) {
  return Boolean(target?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="combobox"]'));
}

// Camera direction: ArrowRight reveals the area to the right, so the scene
// itself moves left. The motion controller applies this direction over time.
export function keyboardPanDirection(event) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || keyboardTargetAcceptsTextOrControl(event.target)) return null;
  if (event.key === 'ArrowLeft') return { x: 1, y: 0 };
  if (event.key === 'ArrowRight') return { x: -1, y: 0 };
  if (event.key === 'ArrowUp') return { x: 0, y: 1 };
  if (event.key === 'ArrowDown') return { x: 0, y: -1 };
  return null;
}

function wheelZoomImpulse(event) {
  const unit = event.deltaMode === 1 ? .05 : event.deltaMode ? 1 : .002;
  return -event.deltaY * unit * (event.ctrlKey ? 10 : 1);
}

export function mountViewportMotion({ root, svg, zoom, panStep = 72 }) {
  svg.attr('tabindex', 0).attr('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
  const pressedDirections = new Map();
  const velocity = { x: 0, y: 0, zoom: 0 };
  let zoomPoint = null;
  let frame = null;
  let dragSample = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inNetworkOrBody = (target) => target === document.body || root.contains(target);
  const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(advance); };
  const advance = () => {
    frame = null;
    let directionX = 0; let directionY = 0;
    pressedDirections.forEach((direction) => { directionX += direction.x; directionY += direction.y; });
    if (directionX || directionY) {
      const length = Math.hypot(directionX, directionY) || 1;
      velocity.x = Math.max(-14, Math.min(14, velocity.x + 1.15 * directionX / length));
      velocity.y = Math.max(-14, Math.min(14, velocity.y + 1.15 * directionY / length));
    } else {
      velocity.x *= .82;
      velocity.y *= .82;
    }
    if (Math.abs(velocity.x) < .08) velocity.x = 0;
    if (Math.abs(velocity.y) < .08) velocity.y = 0;
    const transform = d3.zoomTransform(svg.node());
    if (velocity.x || velocity.y) svg.call(zoom.translateBy, velocity.x / transform.k, velocity.y / transform.k);
    if (velocity.zoom && zoomPoint) svg.call(zoom.scaleBy, Math.exp(velocity.zoom), zoomPoint);
    velocity.zoom *= .55;
    if (Math.abs(velocity.zoom) < .0005) velocity.zoom = 0;
    if (pressedDirections.size || velocity.x || velocity.y || velocity.zoom) schedule();
  };
  const onKeydown = (event) => {
    if (!inNetworkOrBody(event.target)) return;
    const direction = keyboardPanDirection(event);
    if (!direction) return;
    event.preventDefault();
    if (prefersReducedMotion) {
      const transform = d3.zoomTransform(svg.node());
      svg.call(zoom.translateBy, direction.x * panStep / transform.k, direction.y * panStep / transform.k);
      return;
    }
    pressedDirections.set(event.key, direction);
    schedule();
  };
  const onKeyup = (event) => { pressedDirections.delete(event.key); };
  const onBlur = () => { pressedDirections.clear(); };
  const onWheel = (event) => {
    event.preventDefault();
    const impulse = wheelZoomImpulse(event);
    const point = d3.pointer(event, svg.node());
    if (prefersReducedMotion) { svg.call(zoom.scaleBy, Math.exp(impulse), point); return; }
    // Preserve D3's total per-wheel scale response while distributing it over
    // several frames; the cap avoids runaway velocity from a noisy device.
    velocity.zoom = Math.max(-.24, Math.min(.24, velocity.zoom + impulse * .45));
    zoomPoint = point;
    schedule();
  };
  const onZoomStart = (event) => {
    const sourceType = event.sourceEvent?.type;
    if (sourceType !== 'mousedown' && sourceType !== 'pointerdown') return;
    velocity.x = 0;
    velocity.y = 0;
    dragSample = { transform: event.transform, time: performance.now() };
  };
  const onZoom = (event) => {
    const sourceType = event.sourceEvent?.type;
    if (!dragSample || (sourceType !== 'mousemove' && sourceType !== 'pointermove')) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - dragSample.time);
    // Transform coordinates are screen-space pixels. Convert the most recent
    // drag delta into a per-frame inertial velocity, then cap it to the same
    // comfortable maximum used by keyboard pan.
    velocity.x = Math.max(-14, Math.min(14, (event.transform.x - dragSample.transform.x) * 16.67 / elapsed));
    velocity.y = Math.max(-14, Math.min(14, (event.transform.y - dragSample.transform.y) * 16.67 / elapsed));
    dragSample = { transform: event.transform, time: now };
  };
  const onZoomEnd = () => {
    if (!dragSample) return;
    dragSample = null;
    if (!prefersReducedMotion && (velocity.x || velocity.y)) schedule();
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('keyup', onKeyup);
  window.addEventListener('blur', onBlur);
  svg.on('wheel.zoom', null).on('wheel.viewport-motion', onWheel, { passive: false });
  zoom.on('start.viewport-motion', onZoomStart).on('zoom.viewport-motion', onZoom).on('end.viewport-motion', onZoomEnd);
  return () => {
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('keyup', onKeyup);
    window.removeEventListener('blur', onBlur);
    svg.on('wheel.viewport-motion', null);
    zoom.on('start.viewport-motion', null).on('zoom.viewport-motion', null).on('end.viewport-motion', null);
    if (frame !== null) window.cancelAnimationFrame(frame);
  };
}

export function mountSearchCombobox({ root, input, results, items, getLabel, getDetail, noResults, compare, onInput, onSelect }) {
  let matches = [];
  let activeMatch = -1;
  const closeResults = () => {
    results.hidden = true;
    results.replaceChildren();
    matches = [];
    activeMatch = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const selectMatch = (item) => {
    closeResults();
    input.value = getLabel(item);
    onSelect(item);
  };
  const renderResults = () => {
    const query = input.value.trim().toLocaleLowerCase();
    onInput?.(query);
    if (!query) { closeResults(); return; }
    matches = [...items()].filter((item) => getLabel(item).toLocaleLowerCase().includes(query)).sort(compare).slice(0, 10);
    results.replaceChildren();
    activeMatch = matches.length ? 0 : -1;
    if (!matches.length) {
      const entry = document.createElement('li');
      entry.className = 'network-author-no-results';
      entry.textContent = noResults(input.value);
      results.append(entry);
    }
    matches.forEach((item, index) => {
      const entry = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `network-author-result-${index}`;
      button.className = `network-author-result${index === activeMatch ? ' is-active' : ''}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', index === activeMatch ? 'true' : 'false');
      button.innerHTML = `<span>${escapeHtml(getLabel(item))}</span><span class="network-author-result-institution">${escapeHtml(getDetail(item))}</span>`;
      button.addEventListener('click', () => selectMatch(item));
      entry.append(button);
      results.append(entry);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (activeMatch >= 0) input.setAttribute('aria-activedescendant', `network-author-result-${activeMatch}`);
  };
  const setActiveMatch = (index) => {
    if (!matches.length) return;
    activeMatch = (index + matches.length) % matches.length;
    results.querySelectorAll('.network-author-result').forEach((item, itemIndex) => {
      const active = itemIndex === activeMatch;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', `network-author-result-${activeMatch}`);
    results.querySelector('.network-author-result.is-active')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', renderResults);
  input.addEventListener('focus', renderResults);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveMatch(activeMatch + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveMatch(activeMatch - 1); }
    else if (event.key === 'Enter' && activeMatch >= 0) { event.preventDefault(); selectMatch(matches[activeMatch]); }
    else if (event.key === 'Escape' && !results.hidden) {
      event.preventDefault();
      closeResults();
    }
  });
  document.addEventListener('pointerdown', (event) => { if (!root.querySelector('.network-author-picker').contains(event.target)) closeResults(); });
}

export function createSelectionEffects({ svg, scene, nodeById, adjacency, radius, color, label, maxDepth = Infinity }) {
  const id = `network-selected-node-glow-${effectSequence += 1}`;
  const defs = svg.append('defs');
  const glow = defs.append('filter').attr('id', id).attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
  glow.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 3.5).attr('result', 'soft');
  glow.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 1.4).attr('result', 'core');
  glow.append('feMerge').selectAll('feMergeNode').data(['soft', 'core', 'SourceGraphic']).join('feMergeNode').attr('in', (value) => value);

  const pulse = scene.append('g').attr('aria-hidden', 'true').attr('class', 'selection-pulse-layer');
  const pulseEdges = pulse.append('g').attr('class', 'selection-pulse-edges');
  const pulseNodes = pulse.append('g').attr('class', 'selection-pulse-nodes');
  const marker = scene.append('g').attr('class', 'selected-marker').attr('aria-hidden', 'true').attr('display', 'none');
  marker.append('text').attr('class', 'selected-node-label');

  const traversal = (startId) => traverseGraph(adjacency, startId, maxDepth);
  const clearPulse = () => {
    pulseEdges.selectAll('line').interrupt().remove();
    pulseNodes.selectAll('circle').interrupt().remove();
  };
  const updateMarker = (selectedId) => {
    const selected = selectedId === null ? null : nodeById.get(selectedId);
    const visible = selected && Number.isFinite(selected.x) && Number.isFinite(selected.y);
    marker.attr('display', visible ? null : 'none');
    if (!visible) return;
    marker.attr('transform', `translate(${selected.x},${selected.y})`);
    marker.select('text').attr('x', radius(selected) + 11).attr('y', -radius(selected) - 6).text(label(selected));
  };
  const renderPulse = () => {
    pulseEdges.selectAll('line').attr('x1', (item) => nodeById.get(item.sourceId).x).attr('y1', (item) => nodeById.get(item.sourceId).y).attr('x2', (item) => nodeById.get(item.targetId).x).attr('y2', (item) => nodeById.get(item.targetId).y);
    pulseNodes.selectAll('circle').attr('cx', ([nodeId]) => nodeById.get(nodeId).x).attr('cy', ([nodeId]) => nodeById.get(nodeId).y);
  };
  const startPulse = (selectedId) => {
    clearPulse();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const selected = nodeById.get(selectedId);
    if (!selected) return;
    const state = traversal(selectedId);
    const pulseColor = color(selected);
    pulseEdges.selectAll('line').data(state.tree, (item) => `${item.sourceId}→${item.targetId}`).join('line').attr('class', 'selection-pulse-edge')
      .style('--selection-pulse-color', pulseColor).style('--selection-pulse-delay', (item) => `${item.distance * 180}ms`);
    pulseNodes.selectAll('circle').data([...state.distances.entries()].filter(([nodeId]) => nodeId !== selectedId), ([nodeId]) => nodeId).join('circle').attr('class', 'selection-pulse-node')
      .attr('r', ([nodeId]) => radius(nodeById.get(nodeId)) + 4).style('--selection-pulse-color', pulseColor)
      .style('--selection-pulse-delay', ([, distance]) => `${distance * 180}ms`);
    renderPulse();
  };

  return { clearPulse, glowFilter: `url(#${id})`, renderPulse, startPulse, traversal, updateMarker };
}

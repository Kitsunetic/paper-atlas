import { countryColorToken } from './atlas-core.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash = (value) => [...value].reduce((sum, character) => (sum * 31 + character.codePointAt(0)) >>> 0, 7);

function colours() {
  const styles = getComputedStyle(document.documentElement);
  const fallback = styles.getPropertyValue('--atlas-muted').trim();
  return (code) => styles.getPropertyValue(countryColorToken(code || 'unknown')).trim() || fallback;
}

function positionedNodes(nodes) {
  const count = Math.max(nodes.length, 1);
  return nodes.map((node, index) => {
    const seed = hash(node.id);
    const angle = index * 2.399963229728653 + (seed % 100) / 1000;
    const radius = 60 + Math.sqrt((index + 0.5) / count) * 330 + (seed % 24);
    return { ...node, x: 420 + Math.cos(angle) * radius, y: 260 + Math.sin(angle) * radius };
  });
}

function closestNode(nodes, point, view) {
  return nodes.find((node) => {
    const x = node.x * view.zoom + view.x;
    const y = node.y * view.zoom + view.y;
    const radius = 6 + Math.sqrt(node.weight) * 1.3;
    return Math.hypot(point.x - x, point.y - y) <= radius + 5;
  }) ?? null;
}

export function mountNetwork({ canvas, model, onSelect, onHover }) {
  const context = canvas.getContext('2d');
  const nodes = positionedNodes(model.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = { x: 0, y: 0, zoom: 0.8 };
  const colourFor = colours();
  const borderColour = getComputedStyle(document.documentElement).getPropertyValue('--atlas-border').trim();
  let dragging = null;
  let hoverId = '';
  let frame = 0;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    view.x = bounds.width / 2 - 420 * view.zoom;
    view.y = bounds.height / 2 - 260 * view.zoom;
    draw();
  }

  function draw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = canvas.getBoundingClientRect();
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.lineCap = 'round';
      for (const link of model.links) {
        const source = byId.get(link.source);
        const target = byId.get(link.target);
        if (!source || !target) continue;
        context.beginPath();
        context.moveTo(source.x * view.zoom + view.x, source.y * view.zoom + view.y);
        context.lineTo(target.x * view.zoom + view.x, target.y * view.zoom + view.y);
        context.strokeStyle = borderColour;
        context.globalAlpha = Math.min(0.58, 0.12 + link.weight * 0.08);
        context.lineWidth = Math.min(2.8, 0.7 + link.weight * 0.25);
        context.stroke();
      }
      context.globalAlpha = 1;
      for (const node of nodes) {
        const x = node.x * view.zoom + view.x;
        const y = node.y * view.zoom + view.y;
        const radius = (4.5 + Math.sqrt(node.weight) * 1.35) * Math.min(1.5, Math.max(0.75, view.zoom));
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = colourFor(node.countryCode);
        context.globalAlpha = 0.92;
        context.fill();
        if (node.id === hoverId) {
          context.globalAlpha = 1;
          context.lineWidth = 2;
          context.strokeStyle = colourFor(node.countryCode);
          context.stroke();
        }
        if (model.kind === 'country' && view.zoom > 0.64) {
          context.globalAlpha = 1;
          context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--atlas-foreground').trim();
          context.font = '12px ui-sans-serif, system-ui';
          context.fillText(node.label, x + radius + 5, y + 4);
        }
      }
      context.globalAlpha = 1;
    });
  }

  function pointerPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener('pointerdown', (event) => {
    const point = pointerPoint(event);
    const node = closestNode(nodes, point, view);
    dragging = { pointerId: event.pointerId, point, node };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = node ? 'pointer' : 'grabbing';
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = pointerPoint(event);
    const node = closestNode(nodes, point, view);
    const nextHover = node?.id ?? '';
    if (nextHover !== hoverId) {
      hoverId = nextHover;
      canvas.style.cursor = dragging ? canvas.style.cursor : node ? 'pointer' : 'grab';
      canvas.title = node ? `${node.label} · ${node.weight} selected-paper appearances` : '';
      onHover(node ?? null);
      draw();
    }
    if (!dragging || dragging.pointerId !== event.pointerId || dragging.node) return;
    view.x += point.x - dragging.point.x;
    view.y += point.y - dragging.point.y;
    dragging.point = point;
    draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    if (dragging.node && Math.hypot(point.x - dragging.point.x, point.y - dragging.point.y) < 5) onSelect(dragging.node);
    canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = 'grab';
    dragging = null;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const point = pointerPoint(event);
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.min(2.2, Math.max(0.35, view.zoom * factor));
    view.x = point.x - (point.x - view.x) * (nextZoom / view.zoom);
    view.y = point.y - (point.y - view.y) * (nextZoom / view.zoom);
    view.zoom = nextZoom;
    draw();
  }, { passive: false });
  new ResizeObserver(resize).observe(canvas);
  canvas.style.cursor = 'grab';
  canvas.setAttribute('aria-label', model.description);
  if (reducedMotion) canvas.style.transition = 'none';
  resize();
}

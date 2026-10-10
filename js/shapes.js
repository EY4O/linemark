// Link types drawn as shapes, the way a transit puzzle draws its passengers: any link is a circle, an article a square
// (a page), a video a triangle (its play button), a document a pentagon and an image a diamond. The cards, the type
// filter and the network map's stations all use them, so a line's mix of kinds reads at a glance.
export const SHAPES = { link: 'circle', article: 'square', video: 'triangle', document: 'pentagon', image: 'diamond' };
export const TYPE_NAME = { link: 'Link', article: 'Article', video: 'Video', document: 'Document', image: 'Image' };
export const shapeOf = (type) => SHAPES[type] || 'circle';

const ring = (n, r, cx, cy) => Array.from({ length: n }, (_, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
});

// An SVG path for a shape centred on (cx, cy), sized so each reads about as large as a circle of radius r.
export function shapePath(shape, cx = 0, cy = 0, r = 10) {
  switch (shape) {
    case 'square': { const s = r * 0.86; return `M${cx - s} ${cy - s}H${cx + s}V${cy + s}H${cx - s}Z`; }
    case 'triangle': return `M${ring(3, r * 1.18, cx, cy + r * 0.2).join('L')}Z`;
    case 'pentagon': return `M${ring(5, r * 1.06, cx, cy + r * 0.04).join('L')}Z`;
    case 'diamond': return `M${ring(4, r * 1.2, cx, cy).join('L')}Z`;
    default: return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
}

// A small outlined shape for a link type, as an inline icon.
export function shapeIcon(type, size = 12, cls = '') {
  return `<svg class="shape${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true"><path d="${shapePath(shapeOf(type), 0, 0, 8)}"/></svg>`;
}

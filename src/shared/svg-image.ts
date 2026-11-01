import { hostText } from './i18n';
/** Static icon SVG only. This validates; it never rewrites the original bytes. */
const elements = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'use',
  'title',
  'desc',
]);
const attributes = new Set([
  'xmlns',
  'width',
  'height',
  'viewBox',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-rule',
  'clip-rule',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'd',
  'points',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'transform',
  'id',
  'class',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'fr',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'clip-path',
  'mask',
  'href',
  'preserveAspectRatio',
  'vector-effect',
  'role',
  'aria-hidden',
  'aria-label',
]);
export function svgSource(source: string): boolean {
  return /^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/.test(
    source.replace(/^\uFEFF/, ''),
  );
}
export function validateSvg(source: string) {
  if (!svgSource(source) || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source))
    throw Error(hostText('images.svgUnsupported'));
  const xml = source
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[^?]*\?>/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const tags = /<([^<>]*)>/g;
  const stack: string[] = [];
  let end = 0,
    roots = 0,
    match: RegExpExecArray | null;
  while ((match = tags.exec(xml))) {
    const text = xml.slice(end, match.index);
    if (text.includes('<') || (text.trim() && !['title', 'desc'].includes(stack.at(-1) ?? '')))
      throw Error(hostText('images.svgUnsupported'));
    end = tags.lastIndex;
    const tag = match[1];
    if (tag.startsWith('/')) {
      if (!/^\/[A-Za-z]+\s*$/.test(tag) || stack.pop() !== tag.slice(1).trim())
        throw Error(hostText('images.svgUnsupported'));
      continue;
    }
    const head = /^([A-Za-z]+)([\s\S]*?)(\/?)$/.exec(tag);
    if (!head || !elements.has(head[1])) throw Error(hostText('images.svgUnsupported'));
    if (!stack.length) {
      if (head[1] !== 'svg' || ++roots !== 1) throw Error(hostText('images.svgUnsupported'));
    }
    const attrs = head[2];
    const re = /\s+([A-Za-z][\w:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/gy;
    const seen = new Set<string>();
    let position = 0;
    while (position < attrs.length && attrs.slice(position).trim()) {
      re.lastIndex = position;
      const attr = re.exec(attrs);
      if (!attr || !attributes.has(attr[1]) || seen.has(attr[1]))
        throw Error(hostText('images.svgUnsupported'));
      seen.add(attr[1]);
      position = re.lastIndex;
      const value = attr[2] ?? attr[3];
      // Entity expansion must never introduce a URL or markup into an attribute.
      if (/[&<>\u0000-\u001f]/.test(value)) throw Error(hostText('images.svgUnsupported'));
      if (attr[1] === 'xmlns' && value !== 'http://www.w3.org/2000/svg')
        throw Error(hostText('images.svgUnsupported'));
      if (attr[1] === 'href' && !/^#[\w.-]+$/.test(value))
        throw Error(hostText('images.svgUnsupported'));
      if (attr[1] !== 'xmlns' && /:|\/\/|\\|@|;|\/\*/.test(value))
        throw Error(hostText('images.svgUnsupported'));
      if (/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value))
        throw Error(hostText('images.svgUnsupported'));
    }
    if (!head[3]) stack.push(head[1]);
  }
  if (roots !== 1 || stack.length || xml.slice(end).trim())
    throw Error(hostText('images.svgUnsupported'));
  return source;
}

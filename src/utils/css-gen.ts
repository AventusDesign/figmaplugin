import type { ColorFormat, InspectData, ResolvedVariable } from '../types';

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export function formatColor(
  color: { r: number; g: number; b: number },
  opacity: number,
  format: ColorFormat,
  variable?: ResolvedVariable | null
): string {
  if (format === 'CSS var' && variable) return `var(${variable.cssName})`;
  const hex = rgbToHex(color.r, color.g, color.b);
  if (format === 'HEX') return opacity < 1 ? `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` : hex;
  if (format === 'RGB') return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity.toFixed(2)})`;
  return rgbToHsl(color.r, color.g, color.b);
}

function serializePaintBackground(
  fill: InspectData['fills'][0],
  format: ColorFormat,
  variable?: ResolvedVariable | null
): string | null {
  if (fill.visible === false) return null;
  if (fill.type === 'SOLID' && fill.color) {
    return formatColor(fill.color, fill.opacity ?? 1, format, variable);
  }
  if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
    const stops = fill.gradientStops
      .map((s) => {
        const c = s.color;
        const hex = rgbToHex(c.r, c.g, c.b);
        return `${hex} ${Math.round(s.position * 100)}%`;
      })
      .join(', ');
    return `linear-gradient(180deg, ${stops})`;
  }
  if (fill.type === 'IMAGE') return 'url(...)';
  return null;
}

export function generateLayoutCSS(data: InspectData): string {
  const lines: string[] = [];

  if (data.parentLayoutMode === 'NONE' || !data.parentLayoutMode) {
    if (data.x !== undefined && data.y !== undefined) {
      lines.push('position: absolute;');
      lines.push(`top: ${Math.round(data.y)}px;`);
      lines.push(`left: ${Math.round(data.x)}px;`);
    }
  }

  if (data.layoutMode === 'HORIZONTAL') {
    lines.push('display: flex;');
    lines.push('flex-direction: row;');
  } else if (data.layoutMode === 'VERTICAL') {
    lines.push('display: flex;');
    lines.push('flex-direction: column;');
  }

  if (data.layoutAlign === 'STRETCH') {
    lines.push('width: 100%;');
  } else if (data.width) {
    lines.push(`width: ${Math.round(data.width)}px;`);
  }

  if (data.height) {
    lines.push(`height: ${Math.round(data.height)}px;`);
  }

  const pt = data.paddingTop ?? 0;
  const pr = data.paddingRight ?? 0;
  const pb = data.paddingBottom ?? 0;
  const pl = data.paddingLeft ?? 0;

  if (pt || pr || pb || pl) {
    if (pt === pb && pl === pr) {
      if (pt === pl) lines.push(`padding: ${pt}px;`);
      else lines.push(`padding: ${pt}px ${pr}px;`);
    } else {
      lines.push(`padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);
    }
  }

  const justifyMap: Record<string, string> = {
    MIN: 'flex-start',
    CENTER: 'center',
    MAX: 'flex-end',
    SPACE_BETWEEN: 'space-between',
  };
  const alignMap: Record<string, string> = {
    MIN: 'flex-start',
    CENTER: 'center',
    MAX: 'flex-end',
    STRETCH: 'stretch',
  };

  if (data.primaryAxisAlignItems && data.primaryAxisAlignItems !== 'MIN') {
    lines.push(`justify-content: ${justifyMap[data.primaryAxisAlignItems] ?? data.primaryAxisAlignItems.toLowerCase()};`);
  }
  if (data.counterAxisAlignItems && data.counterAxisAlignItems !== 'MIN') {
    lines.push(`align-items: ${alignMap[data.counterAxisAlignItems] ?? data.counterAxisAlignItems.toLowerCase()};`);
  }

  if (data.itemSpacing) {
    lines.push(`gap: ${data.itemSpacing}px;`);
  }

  if (data.layoutWrap && data.layoutWrap !== 'NO_WRAP') {
    lines.push('flex-wrap: wrap;');
  }

  return lines.join('\n');
}

export function generateStyleCSS(
  data: InspectData,
  format: ColorFormat = 'HEX',
  variables: ResolvedVariable[] = []
): string {
  const lines: string[] = [];
  const fillVar = variables.find((v) => v.name && data.boundVariables['fills']);

  if (data.cornerRadius === 'MIXED' && data.cornerRadii) {
    const { tl, tr, br, bl } = data.cornerRadii;
    lines.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`);
  } else if (typeof data.cornerRadius === 'number' && data.cornerRadius > 0) {
    lines.push(`border-radius: ${data.cornerRadius}px;`);
  }

  const visibleFills = data.fills.filter((f) => f.visible !== false);
  if (visibleFills.length === 1) {
    const bg = serializePaintBackground(visibleFills[0], format, fillVar);
    if (bg) lines.push(`background: ${bg};`);
  } else if (visibleFills.length > 1) {
    lines.push('background: /* multiple fills */;');
  }

  const visibleStrokes = data.strokes.filter((s) => s.visible !== false);
  if (visibleStrokes.length && data.strokeWeight) {
    const stroke = visibleStrokes[0];
    if (stroke.type === 'SOLID' && stroke.color) {
      const color = formatColor(stroke.color, stroke.opacity ?? 1, format);
      lines.push(`border: ${data.strokeWeight}px solid ${color};`);
    }
  }

  for (const effect of data.effects) {
    if (effect.visible === false) continue;
    if (effect.type === 'DROP_SHADOW' && effect.offset && effect.color) {
      const { r, g, b, a = 1 } = effect.color;
      lines.push(
        `box-shadow: ${effect.offset.x}px ${effect.offset.y}px ${effect.radius ?? 0}px ${effect.spread ?? 0}px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a});`
      );
    } else if (effect.type === 'INNER_SHADOW' && effect.offset && effect.color) {
      const { r, g, b, a = 1 } = effect.color;
      lines.push(
        `box-shadow: inset ${effect.offset.x}px ${effect.offset.y}px ${effect.radius ?? 0}px ${effect.spread ?? 0}px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a});`
      );
    } else if (effect.type === 'LAYER_BLUR') {
      lines.push(`filter: blur(${effect.radius ?? 0}px);`);
    } else if (effect.type === 'BACKGROUND_BLUR') {
      lines.push(`backdrop-filter: blur(${effect.radius ?? 0}px);`);
    }
  }

  if (data.opacity !== undefined && data.opacity < 1) {
    lines.push(`opacity: ${data.opacity};`);
  }

  return lines.join('\n');
}

export function generateTypographyCSS(data: InspectData): string {
  if (data.type !== 'TEXT') return '';
  const lines: string[] = [];

  if (data.fontFamily && data.fontFamily !== 'MIXED') {
    lines.push(`font-family: '${data.fontFamily}', sans-serif;`);
  } else if (data.fontFamily === 'MIXED') {
    lines.push('font-family: /* Mixed */;');
  }

  if (data.fontSize && data.fontSize !== 'MIXED') {
    lines.push(`font-size: ${data.fontSize}px;`);
  }

  if (data.fontWeight && data.fontWeight !== 'MIXED') {
    lines.push(`font-weight: ${data.fontWeight};`);
  }

  if (data.lineHeight && data.lineHeight !== 'MIXED') {
    const lh = data.lineHeight;
    if (lh.unit === 'PIXELS' && lh.value !== undefined) lines.push(`line-height: ${lh.value}px;`);
    else if (lh.unit === 'PERCENT' && lh.value !== undefined) lines.push(`line-height: ${lh.value}%;`);
    else if (lh.unit === 'AUTO') lines.push('line-height: normal;');
  }

  if (data.letterSpacing && data.letterSpacing !== 'MIXED') {
    const ls = data.letterSpacing;
    if (ls.unit === 'PIXELS' && ls.value !== undefined) lines.push(`letter-spacing: ${ls.value}px;`);
    else if (ls.unit === 'PERCENT' && ls.value !== undefined) lines.push(`letter-spacing: ${ls.value / 100}em;`);
  }

  if (data.textAlignHorizontal && data.textAlignHorizontal !== 'MIXED') {
    const map: Record<string, string> = {
      LEFT: 'left',
      CENTER: 'center',
      RIGHT: 'right',
      JUSTIFIED: 'justify',
    };
    lines.push(`text-align: ${map[data.textAlignHorizontal] ?? 'left'};`);
  }

  if (data.textDecoration && data.textDecoration !== 'MIXED') {
    const map: Record<string, string> = {
      NONE: 'none',
      UNDERLINE: 'underline',
      STRIKETHROUGH: 'line-through',
    };
    lines.push(`text-decoration: ${map[data.textDecoration] ?? 'none'};`);
  }

  return lines.join('\n');
}

export function generateAllCSS(
  data: InspectData,
  format: ColorFormat = 'HEX',
  variables: ResolvedVariable[] = []
): string {
  const parts = [
    generateLayoutCSS(data),
    generateStyleCSS(data, format, variables),
    generateTypographyCSS(data),
  ].filter(Boolean);
  return parts.join('\n\n');
}

export function highlightCSS(css: string): string {
  return css
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*[\w-]+)(\s*:\s*)(.+?)(;?)$/);
      if (!match) return escapeHtml(line);
      const [, prop, colon, value, semi] = match;
      return `<span class="css-prop">${escapeHtml(prop)}</span>${escapeHtml(colon)}<span class="css-val">${escapeHtml(value)}</span>${escapeHtml(semi)}`;
    })
    .join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

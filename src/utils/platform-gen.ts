import type { CodePlatform, ColorFormat, InspectData, ResolvedVariable } from '../types';
import {
  flutterColor,
  formatColor,
  kotlinColor,
  rgbToHex,
  swiftColor,
  tokenName,
} from './color-utils';
import {
  generateAllCSS,
  generateLayoutCSS,
  generateStyleCSS,
  generateTypographyCSS,
  highlightCSS,
} from './css-gen';

export interface CodeGenContext {
  colorFormat: ColorFormat;
  variables: ResolvedVariable[];
}

const justifyMap: Record<string, string> = {
  MIN: 'start',
  CENTER: 'center',
  MAX: 'end',
  SPACE_BETWEEN: 'spaceBetween',
};

const alignMap: Record<string, string> = {
  MIN: 'start',
  CENTER: 'center',
  MAX: 'end',
  STRETCH: 'stretch',
};

const textAlignMap: Record<string, string> = {
  LEFT: 'leading',
  CENTER: 'center',
  RIGHT: 'trailing',
  JUSTIFIED: 'justified',
};

function fillVariable(variables: ResolvedVariable[], data: InspectData): ResolvedVariable | undefined {
  return variables.find((v) => v.name && data.boundVariables['fills']);
}

function firstSolidFill(data: InspectData) {
  return data.fills.find((f) => f.visible !== false && f.type === 'SOLID' && f.color);
}

function firstSolidStroke(data: InspectData) {
  return data.strokes.find((s) => s.visible !== false && s.type === 'SOLID' && s.color);
}

function generateIosLayout(data: InspectData): string {
  const lines: string[] = [];

  if (data.parentLayoutMode === 'NONE' || !data.parentLayoutMode) {
    if (data.x !== undefined && data.y !== undefined) {
      lines.push(`.offset(x: ${Math.round(data.x)}, y: ${Math.round(data.y)})`);
    }
  }

  if (data.layoutAlign === 'STRETCH') {
    lines.push('.frame(maxWidth: .infinity)');
  } else if (data.width || data.height) {
    const w = data.width ? `width: ${Math.round(data.width)}` : '';
    const h = data.height ? `height: ${Math.round(data.height)}` : '';
    const parts = [w, h].filter(Boolean).join(', ');
    if (parts) lines.push(`.frame(${parts})`);
  }

  const pt = data.paddingTop ?? 0;
  const pr = data.paddingRight ?? 0;
  const pb = data.paddingBottom ?? 0;
  const pl = data.paddingLeft ?? 0;
  if (pt || pr || pb || pl) {
    if (pt === pb && pl === pr) {
      if (pt === pl) lines.push(`.padding(${pt})`);
      else lines.push(`.padding(.vertical, ${pt}).padding(.horizontal, ${pr})`);
    } else {
      lines.push(`.padding(EdgeInsets(top: ${pt}, leading: ${pl}, bottom: ${pb}, trailing: ${pr}))`);
    }
  }

  if (data.layoutMode === 'HORIZONTAL') {
    const spacing = data.itemSpacing ? `, spacing: ${data.itemSpacing}` : '';
    lines.push(`HStack(alignment: .${alignMap[data.counterAxisAlignItems ?? 'MIN'] ?? 'top'}${spacing}) { }`);
  } else if (data.layoutMode === 'VERTICAL') {
    const spacing = data.itemSpacing ? `, spacing: ${data.itemSpacing}` : '';
    lines.push(`VStack(alignment: .${alignMap[data.counterAxisAlignItems ?? 'MIN'] ?? 'leading'}${spacing}) { }`);
  } else if (data.itemSpacing) {
    lines.push(`// spacing: ${data.itemSpacing}`);
  }

  if (data.primaryAxisAlignItems && data.primaryAxisAlignItems !== 'MIN') {
    lines.push(`// main alignment: ${justifyMap[data.primaryAxisAlignItems] ?? data.primaryAxisAlignItems}`);
  }

  return lines.join('\n');
}

function generateIosStyle(data: InspectData, variables: ResolvedVariable[]): string {
  const lines: string[] = [];
  const fillVar = fillVariable(variables, data);
  const fill = firstSolidFill(data);

  if (typeof data.cornerRadius === 'number' && data.cornerRadius > 0) {
    lines.push(`.cornerRadius(${data.cornerRadius})`);
  } else if (data.cornerRadius === 'MIXED' && data.cornerRadii) {
    const { tl, tr, br, bl } = data.cornerRadii;
    lines.push(`.clipShape(UnevenRoundedRectangle(topLeadingRadius: ${tl}, bottomLeadingRadius: ${bl}, bottomTrailingRadius: ${br}, topTrailingRadius: ${tr}))`);
  }

  if (fill?.color) {
    lines.push(`.background(${swiftColor(fill.color, fill.opacity ?? 1, fillVar)})`);
  }

  const stroke = firstSolidStroke(data);
  if (stroke?.color && data.strokeWeight) {
    const radius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
    lines.push(`.overlay(`);
    lines.push(`  RoundedRectangle(cornerRadius: ${radius})`);
    lines.push(`    .stroke(${swiftColor(stroke.color, stroke.opacity ?? 1)}, lineWidth: ${data.strokeWeight})`);
    lines.push(`)`);
  }

  for (const effect of data.effects) {
    if (effect.visible === false) continue;
    if (effect.type === 'DROP_SHADOW' && effect.offset && effect.color) {
      const c = effect.color;
      lines.push(`.shadow(color: ${swiftColor(c, c.a ?? 1)}, radius: ${effect.radius ?? 0}, x: ${effect.offset.x}, y: ${effect.offset.y})`);
    }
  }

  if (data.opacity !== undefined && data.opacity < 1) {
    lines.push(`.opacity(${data.opacity})`);
  }

  return lines.join('\n');
}

function generateIosTypography(data: InspectData): string {
  if (data.type !== 'TEXT') return '';
  const lines: string[] = [];

  if (data.fontFamily && data.fontFamily !== 'MIXED' && data.fontSize && data.fontSize !== 'MIXED') {
    lines.push(`.font(.custom("${data.fontFamily}", size: ${data.fontSize}))`);
  } else if (data.fontSize && data.fontSize !== 'MIXED') {
    const weight = data.fontWeight && data.fontWeight !== 'MIXED' ? `.weight(.${iosWeight(data.fontWeight)})` : '';
    lines.push(`.font(.system(size: ${data.fontSize}${weight}))`);
  }

  if (data.letterSpacing && data.letterSpacing !== 'MIXED' && data.letterSpacing.unit === 'PIXELS') {
    lines.push(`.tracking(${data.letterSpacing.value ?? 0})`);
  }

  if (data.textAlignHorizontal && data.textAlignHorizontal !== 'MIXED') {
    lines.push(`.multilineTextAlignment(.${textAlignMap[data.textAlignHorizontal] ?? 'leading'})`);
  }

  if (data.textDecoration === 'UNDERLINE') lines.push('.underline()');
  if (data.textDecoration === 'STRIKETHROUGH') lines.push('.strikethrough()');

  return lines.join('\n');
}

function iosWeight(weight: number): string {
  if (weight >= 700) return 'bold';
  if (weight >= 500) return 'medium';
  if (weight >= 300) return 'light';
  return 'regular';
}

function generateAndroidLayout(data: InspectData): string {
  const lines: string[] = ['Modifier'];

  if (data.layoutAlign === 'STRETCH') {
    lines.push('    .fillMaxWidth()');
  } else if (data.width) {
    lines.push(`    .width(${Math.round(data.width)}.dp)`);
  }

  if (data.height) {
    lines.push(`    .height(${Math.round(data.height)}.dp)`);
  }

  if (data.x !== undefined && data.y !== undefined && (data.parentLayoutMode === 'NONE' || !data.parentLayoutMode)) {
    lines.push(`    .offset(x = ${Math.round(data.x)}.dp, y = ${Math.round(data.y)}.dp)`);
  }

  const pt = data.paddingTop ?? 0;
  const pr = data.paddingRight ?? 0;
  const pb = data.paddingBottom ?? 0;
  const pl = data.paddingLeft ?? 0;
  if (pt || pr || pb || pl) {
    lines.push(`    .padding(top = ${pt}.dp, start = ${pl}.dp, bottom = ${pb}.dp, end = ${pr}.dp)`);
  }

  if (data.layoutMode === 'HORIZONTAL') {
    const spacing = data.itemSpacing ? ` spacedBy(${data.itemSpacing}.dp)` : '';
    lines.push(`// Row(horizontalArrangement = Arrangement.${androidJustify(data.primaryAxisAlignItems)}${spacing})`);
  } else if (data.layoutMode === 'VERTICAL') {
    const spacing = data.itemSpacing ? ` spacedBy(${data.itemSpacing}.dp)` : '';
    lines.push(`// Column(verticalArrangement = Arrangement.${androidJustify(data.primaryAxisAlignItems)}${spacing})`);
  } else if (data.itemSpacing) {
    lines.push(`// spacing: ${data.itemSpacing}.dp`);
  }

  if (data.counterAxisAlignItems && data.counterAxisAlignItems !== 'MIN') {
    lines.push(`// cross alignment: ${alignMap[data.counterAxisAlignItems] ?? data.counterAxisAlignItems}`);
  }

  return lines.join('\n');
}

function androidJustify(value?: string): string {
  const map: Record<string, string> = {
    MIN: 'Start',
    CENTER: 'Center',
    MAX: 'End',
    SPACE_BETWEEN: 'SpaceBetween',
  };
  return map[value ?? 'MIN'] ?? 'Start';
}

function generateAndroidStyle(data: InspectData, variables: ResolvedVariable[]): string {
  const lines: string[] = ['Modifier'];
  const fillVar = fillVariable(variables, data);
  const fill = firstSolidFill(data);

  if (fill?.color) {
    lines.push(`    .background(${kotlinColor(fill.color, fill.opacity ?? 1, fillVar)})`);
  }

  if (typeof data.cornerRadius === 'number' && data.cornerRadius > 0) {
    lines.push(`    .clip(RoundedCornerShape(${data.cornerRadius}.dp))`);
  } else if (data.cornerRadius === 'MIXED' && data.cornerRadii) {
    const { tl, tr, br, bl } = data.cornerRadii;
    lines.push(`    .clip(RoundedCornerShape(topStart = ${tl}.dp, topEnd = ${tr}.dp, bottomEnd = ${br}.dp, bottomStart = ${bl}.dp))`);
  }

  const stroke = firstSolidStroke(data);
  if (stroke?.color && data.strokeWeight) {
    const radius = typeof data.cornerRadius === 'number' ? data.cornerRadius : 0;
    lines.push(`    .border(${data.strokeWeight}.dp, ${kotlinColor(stroke.color, stroke.opacity ?? 1)}, RoundedCornerShape(${radius}.dp))`);
  }

  for (const effect of data.effects) {
    if (effect.visible === false || effect.type !== 'DROP_SHADOW') continue;
    lines.push(`    .shadow(elevation = ${effect.radius ?? 4}.dp)`);
    break;
  }

  if (data.opacity !== undefined && data.opacity < 1) {
    lines.push(`    .alpha(${data.opacity}f)`);
  }

  return lines.join('\n');
}

function generateAndroidTypography(data: InspectData): string {
  if (data.type !== 'TEXT') return '';
  const lines: string[] = ['Text('];
  lines.push('    text = "...",');

  if (data.fontSize && data.fontSize !== 'MIXED') {
    lines.push(`    fontSize = ${data.fontSize}.sp,`);
  }

  if (data.fontWeight && data.fontWeight !== 'MIXED') {
    lines.push(`    fontWeight = FontWeight(${androidWeight(data.fontWeight)}),`);
  }

  if (data.fontFamily && data.fontFamily !== 'MIXED') {
    lines.push(`    fontFamily = FontFamily(Font(R.font.${tokenName(data.fontFamily).toLowerCase()})),`);
  }

  if (data.letterSpacing && data.letterSpacing !== 'MIXED' && data.letterSpacing.unit === 'PIXELS') {
    lines.push(`    letterSpacing = ${data.letterSpacing.value ?? 0}.sp,`);
  }

  if (data.textAlignHorizontal && data.textAlignHorizontal !== 'MIXED') {
    lines.push(`    textAlign = TextAlign.${androidTextAlign(data.textAlignHorizontal)},`);
  }

  if (data.textDecoration === 'UNDERLINE') lines.push('    textDecoration = TextDecoration.Underline,');
  if (data.textDecoration === 'STRIKETHROUGH') lines.push('    textDecoration = TextDecoration.LineThrough,');

  lines.push(')');
  return lines.join('\n');
}

function androidWeight(weight: number): string {
  if (weight >= 700) return 'Bold';
  if (weight >= 500) return 'Medium';
  if (weight >= 300) return 'Light';
  return 'Normal';
}

function androidTextAlign(value: string): string {
  const map: Record<string, string> = {
    LEFT: 'Start',
    CENTER: 'Center',
    RIGHT: 'End',
    JUSTIFIED: 'Justify',
  };
  return map[value] ?? 'Start';
}

function generateFlutterLayout(data: InspectData): string {
  const lines: string[] = [];

  if (data.layoutMode === 'HORIZONTAL') {
    lines.push('Row(');
    lines.push(`  mainAxisAlignment: MainAxisAlignment.${flutterJustify(data.primaryAxisAlignItems)},`);
    lines.push(`  crossAxisAlignment: CrossAxisAlignment.${flutterAlign(data.counterAxisAlignItems)},`);
    if (data.itemSpacing) lines.push(`  spacing: ${data.itemSpacing},`);
    lines.push('  children: [');
    lines.push('    // ...');
    lines.push('  ],');
    lines.push(')');
    return lines.join('\n');
  }

  if (data.layoutMode === 'VERTICAL') {
    lines.push('Column(');
    lines.push(`  mainAxisAlignment: MainAxisAlignment.${flutterJustify(data.primaryAxisAlignItems)},`);
    lines.push(`  crossAxisAlignment: CrossAxisAlignment.${flutterAlign(data.counterAxisAlignItems)},`);
    if (data.itemSpacing) lines.push(`  spacing: ${data.itemSpacing},`);
    lines.push('  children: [');
    lines.push('    // ...');
    lines.push('  ],');
    lines.push(')');
    return lines.join('\n');
  }

  lines.push('Container(');
  if (data.width) lines.push(`  width: ${Math.round(data.width)},`);
  if (data.height) lines.push(`  height: ${Math.round(data.height)},`);

  const pt = data.paddingTop ?? 0;
  const pr = data.paddingRight ?? 0;
  const pb = data.paddingBottom ?? 0;
  const pl = data.paddingLeft ?? 0;
  if (pt || pr || pb || pl) {
    lines.push(`  padding: EdgeInsets.fromLTRB(${pl}, ${pt}, ${pr}, ${pb}),`);
  }

  if (data.x !== undefined && data.y !== undefined && (data.parentLayoutMode === 'NONE' || !data.parentLayoutMode)) {
    lines.push('  // Position in Stack:');
    lines.push(`  // left: ${Math.round(data.x)}, top: ${Math.round(data.y)},`);
  }

  lines.push('  child: ...,');
  lines.push(')');
  return lines.join('\n');
}

function flutterJustify(value?: string): string {
  const map: Record<string, string> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
    SPACE_BETWEEN: 'spaceBetween',
  };
  return map[value ?? 'MIN'] ?? 'start';
}

function flutterAlign(value?: string): string {
  const map: Record<string, string> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
    STRETCH: 'stretch',
  };
  return map[value ?? 'MIN'] ?? 'start';
}

function generateFlutterStyle(data: InspectData, variables: ResolvedVariable[]): string {
  const lines: string[] = ['Container('];
  const fillVar = fillVariable(variables, data);
  const fill = firstSolidFill(data);
  const hasDecoration = !!(fill?.color || data.cornerRadius || firstSolidStroke(data) || data.effects.some((e) => e.visible !== false && e.type === 'DROP_SHADOW'));

  if (data.width) lines.push(`  width: ${Math.round(data.width)},`);
  if (data.height) lines.push(`  height: ${Math.round(data.height)},`);

  const pt = data.paddingTop ?? 0;
  const pr = data.paddingRight ?? 0;
  const pb = data.paddingBottom ?? 0;
  const pl = data.paddingLeft ?? 0;
  if (pt || pr || pb || pl) {
    lines.push(`  padding: EdgeInsets.fromLTRB(${pl}, ${pt}, ${pr}, ${pb}),`);
  }

  if (hasDecoration) {
    lines.push('  decoration: BoxDecoration(');

    if (fill?.color) {
      lines.push(`    color: ${flutterColor(fill.color, fill.opacity ?? 1, fillVar)},`);
    }

    if (typeof data.cornerRadius === 'number' && data.cornerRadius > 0) {
      lines.push(`    borderRadius: BorderRadius.circular(${data.cornerRadius}),`);
    } else if (data.cornerRadius === 'MIXED' && data.cornerRadii) {
      const { tl, tr, br, bl } = data.cornerRadii;
      lines.push(`    borderRadius: BorderRadius.only(`);
      lines.push(`      topLeft: Radius.circular(${tl}),`);
      lines.push(`      topRight: Radius.circular(${tr}),`);
      lines.push(`      bottomRight: Radius.circular(${br}),`);
      lines.push(`      bottomLeft: Radius.circular(${bl}),`);
      lines.push('    ),');
    }

    const stroke = firstSolidStroke(data);
    if (stroke?.color && data.strokeWeight) {
      lines.push(`    border: Border.all(`);
      lines.push(`      color: ${flutterColor(stroke.color, stroke.opacity ?? 1)},`);
      lines.push(`      width: ${data.strokeWeight},`);
      lines.push('    ),');
    }

    const shadow = data.effects.find((e) => e.visible !== false && e.type === 'DROP_SHADOW' && e.offset && e.color);
    if (shadow?.offset && shadow.color) {
      const c = shadow.color;
      lines.push('    boxShadow: [');
      lines.push('      BoxShadow(');
      lines.push(`        color: ${flutterColor(c, c.a ?? 1)},`);
      lines.push(`        blurRadius: ${shadow.radius ?? 0},`);
      lines.push(`        offset: Offset(${shadow.offset.x}, ${shadow.offset.y}),`);
      lines.push('      ),');
      lines.push('    ],');
    }

    lines.push('  ),');
  }

  if (data.opacity !== undefined && data.opacity < 1) {
    lines.push(`  // opacity: ${data.opacity} — wrap with Opacity(opacity: ${data.opacity}, child: ...)`);
  }

  lines.push('  child: ...,');
  lines.push(')');
  return lines.join('\n');
}

function generateFlutterTypography(data: InspectData): string {
  if (data.type !== 'TEXT') return '';
  const lines: string[] = ['Text('];
  lines.push("  '...',");
  lines.push('  style: TextStyle(');

  if (data.fontFamily && data.fontFamily !== 'MIXED') {
    lines.push(`    fontFamily: '${data.fontFamily}',`);
  }

  if (data.fontSize && data.fontSize !== 'MIXED') {
    lines.push(`    fontSize: ${data.fontSize},`);
  }

  if (data.fontWeight && data.fontWeight !== 'MIXED') {
    lines.push(`    fontWeight: FontWeight.w${data.fontWeight},`);
  }

  if (data.lineHeight && data.lineHeight !== 'MIXED' && data.lineHeight.unit === 'PIXELS' && data.fontSize && data.fontSize !== 'MIXED') {
    const height = (data.lineHeight.value ?? data.fontSize) / data.fontSize;
    lines.push(`    height: ${height.toFixed(2)},`);
  }

  if (data.letterSpacing && data.letterSpacing !== 'MIXED' && data.letterSpacing.unit === 'PIXELS') {
    lines.push(`    letterSpacing: ${data.letterSpacing.value ?? 0},`);
  }

  if (data.textDecoration === 'UNDERLINE') lines.push('    decoration: TextDecoration.underline,');
  if (data.textDecoration === 'STRIKETHROUGH') lines.push('    decoration: TextDecoration.lineThrough,');

  lines.push('  ),');

  if (data.textAlignHorizontal && data.textAlignHorizontal !== 'MIXED') {
    lines.push(`  textAlign: TextAlign.${flutterTextAlign(data.textAlignHorizontal)},`);
  }

  lines.push(')');
  return lines.join('\n');
}

function flutterTextAlign(value: string): string {
  const map: Record<string, string> = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFIED: 'justify',
  };
  return map[value] ?? 'left';
}

export function generateLayoutCode(platform: CodePlatform, data: InspectData, _ctx: CodeGenContext): string {
  if (platform === 'css') return generateLayoutCSS(data);
  if (platform === 'ios') return generateIosLayout(data);
  if (platform === 'android') return generateAndroidLayout(data);
  return generateFlutterLayout(data);
}

export function generateStyleCode(platform: CodePlatform, data: InspectData, ctx: CodeGenContext): string {
  if (platform === 'css') return generateStyleCSS(data, ctx.colorFormat, ctx.variables);
  if (platform === 'ios') return generateIosStyle(data, ctx.variables);
  if (platform === 'android') return generateAndroidStyle(data, ctx.variables);
  return generateFlutterStyle(data, ctx.variables);
}

export function generateTypographyCode(platform: CodePlatform, data: InspectData, _ctx: CodeGenContext): string {
  if (platform === 'css') return generateTypographyCSS(data);
  if (platform === 'ios') return generateIosTypography(data);
  if (platform === 'android') return generateAndroidTypography(data);
  return generateFlutterTypography(data);
}

export function generateAllCode(platform: CodePlatform, data: InspectData, ctx: CodeGenContext): string {
  if (platform === 'css') return generateAllCSS(data, ctx.colorFormat, ctx.variables);
  const parts = [
    generateLayoutCode(platform, data, ctx),
    generateStyleCode(platform, data, ctx),
    generateTypographyCode(platform, data, ctx),
  ].filter(Boolean);
  return parts.join('\n\n');
}

export function generateVariablesCode(platform: CodePlatform, variables: ResolvedVariable[], colorFormat: ColorFormat): string {
  if (!variables.length) return '';
  return variables
    .map((v) => {
      const val = formatVariableValue(platform, v, colorFormat);
      if (platform === 'ios') return `// ${v.collection}/${v.name}\nlet ${tokenName(v.name)} = ${val}`;
      if (platform === 'android') return `// ${v.collection}/${v.name}\nval ${tokenName(v.name)} = ${val}`;
      if (platform === 'flutter') return `// ${v.collection}/${v.name}\nconst ${tokenName(v.name)} = ${val};`;
      return `${v.cssName}: ${val};`;
    })
    .join('\n');
}

export function generateColorsCode(
  platform: CodePlatform,
  colors: Array<{ hex: string; rgba: string; variable: ResolvedVariable | null }>,
  colorFormat: ColorFormat
): string {
  if (!colors.length) return '';
  return colors
    .map((c) => {
      const rgb = hexToRgb(c.hex);
      if (!rgb) return `${c.hex}`;
      if (platform === 'ios') {
        const label = c.variable ? `// ${c.variable.name}\n` : '';
        return `${label}${swiftColor(rgb, 1, c.variable)}`;
      }
      if (platform === 'android') return kotlinColor(rgb, 1, c.variable);
      if (platform === 'flutter') return flutterColor(rgb, 1, c.variable);
      const label = c.variable ? c.variable.cssName : c.hex;
      const display = colorFormat === 'RGB' ? c.rgba : c.hex;
      return `${label}: ${display};`;
    })
    .join('\n');
}

export function formatVariableValue(platform: CodePlatform, v: ResolvedVariable, colorFormat: ColorFormat): string {
  if (v.resolvedType === 'COLOR' && v.value && typeof v.value === 'object' && 'r' in (v.value as object)) {
    const c = v.value as { r: number; g: number; b: number };
    if (platform === 'ios') return swiftColor(c, 1, v);
    if (platform === 'android') return kotlinColor(c, 1, v);
    if (platform === 'flutter') return flutterColor(c, 1, v);
    return formatColor(c, 1, colorFormat, v);
  }
  if (v.resolvedType === 'FLOAT') {
    const n = Number(v.value);
    if (platform === 'android') return `${n}.dp`;
    if (platform === 'flutter') return `${n}`;
    return String(v.value);
  }
  if (v.resolvedType === 'BOOLEAN') return String(v.value);
  if (v.resolvedType === 'STRING') return platform === 'ios' ? `"${v.value}"` : `"${v.value}"`;
  return '—';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

export function highlightCode(platform: CodePlatform, code: string): string {
  if (platform === 'css') return highlightCSS(code);
  return code
    .split('\n')
    .map((line) => {
      const comment = line.match(/^(\s*)(\/\/.*)$/);
      if (comment) return `${escapeHtml(comment[1])}<span class="css-prop">${escapeHtml(comment[2])}</span>`;

      const swiftMod = line.match(/^(\s*)(\.\w+\(.*)$/);
      if (swiftMod && platform === 'ios') {
        return `${escapeHtml(swiftMod[1])}<span class="css-val">${escapeHtml(swiftMod[2])}</span>`;
      }

      const keyVal = line.match(/^(\s*)([\w.]+)(\s*[:=]\s*)(.+)$/);
      if (keyVal) {
        const [, indent, key, sep, value] = keyVal;
        return `${escapeHtml(indent)}<span class="css-prop">${escapeHtml(key)}</span>${escapeHtml(sep)}<span class="css-val">${escapeHtml(value)}</span>`;
      }

      return escapeHtml(line);
    })
    .join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { formatColor } from './color-utils';

import type { ColorFormat, ResolvedVariable } from '../types';

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToArgbInt(
  color: { r: number; g: number; b: number },
  opacity = 1
): string {
  const a = Math.round(opacity * 255);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `0x${a.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): string {
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

export function swiftColor(
  color: { r: number; g: number; b: number },
  opacity = 1,
  variable?: ResolvedVariable | null
): string {
  if (variable) return `Color("${variable.name}")`;
  const base = `Color(red: ${color.r.toFixed(3)}, green: ${color.g.toFixed(3)}, blue: ${color.b.toFixed(3)})`;
  return opacity < 1 ? `${base}.opacity(${opacity.toFixed(2)})` : base;
}

export function kotlinColor(
  color: { r: number; g: number; b: number },
  opacity = 1,
  variable?: ResolvedVariable | null
): string {
  if (variable) return `colorResource(R.color.${variable.name.replace(/\//g, '_').replace(/\s+/g, '_').toLowerCase()})`;
  const argb = rgbToArgbInt(color, opacity);
  return `Color(${argb})`;
}

export function flutterColor(
  color: { r: number; g: number; b: number },
  opacity = 1,
  variable?: ResolvedVariable | null
): string {
  if (variable) return `AppColors.${variable.name.replace(/\//g, '').replace(/\s+/g, '')}`;
  return `Color(${rgbToArgbInt(color, opacity)})`;
}

export function tokenName(name: string): string {
  return name.replace(/\//g, '_').replace(/\s+/g, '_');
}

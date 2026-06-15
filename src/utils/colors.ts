/// <reference types="@figma/plugin-typings" />

import type { GroupedColorEntry } from '../types';
import { resolveVariableById, toCSSVarName } from './variables';

function toHex(color: RGB): string {
  const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${h(color.r)}${h(color.g)}${h(color.b)}`.toUpperCase();
}

function toRgba(color: RGB, opacity: number): string {
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity.toFixed(2)})`;
}

function usageFromNode(n: SceneNode, kind: 'fill' | 'stroke'): GroupedColorEntry['usages'][0]['usage'] {
  if (n.type === 'TEXT' && kind === 'fill') return 'text';
  if (kind === 'stroke') return 'border';
  return 'background';
}

async function pushSolidColor(
  map: Map<string, GroupedColorEntry>,
  n: SceneNode,
  paint: SolidPaint,
  kind: 'fill' | 'stroke'
): Promise<void> {
  if (paint.visible === false) return;

  const hex = toHex(paint.color);
  let variable = null;
  const bv = 'boundVariables' in n ? (n as SceneNode & { boundVariables?: Record<string, VariableAlias | VariableAlias[]> }).boundVariables : undefined;
  if (bv) {
    const raw = bv[kind === 'fill' ? 'fills' : 'strokes'];
    const alias = Array.isArray(raw) ? raw[0] : raw;
    if (alias && typeof alias === 'object' && 'id' in alias) {
      variable = await resolveVariableById(alias.id);
    }
  }

  const key = `${hex}|${variable?.cssName ?? ''}`;
  const usage = { usage: usageFromNode(n, kind), nodeName: n.name };

  const existing = map.get(key);
  if (existing) {
    const dup = existing.usages.some((u) => u.nodeName === usage.nodeName && u.usage === usage.usage);
    if (!dup) existing.usages.push(usage);
  } else {
    map.set(key, { hex, rgba: toRgba(paint.color, paint.opacity ?? 1), variable, usages: [usage] });
  }
}

export async function collectColors(node: SceneNode): Promise<GroupedColorEntry[]> {
  const map = new Map<string, GroupedColorEntry>();

  async function traverse(n: SceneNode): Promise<void> {
    if ('fills' in n && Array.isArray(n.fills)) {
      for (const fill of n.fills as Paint[]) {
        if (fill.type === 'SOLID') await pushSolidColor(map, n, fill, 'fill');
      }
    }
    if ('strokes' in n && Array.isArray(n.strokes)) {
      for (const stroke of n.strokes as Paint[]) {
        if (stroke.type === 'SOLID') await pushSolidColor(map, n, stroke, 'stroke');
      }
    }
    if ('children' in n) {
      for (const child of n.children) await traverse(child);
    }
  }

  await traverse(node);
  return Array.from(map.values());
}

export { toHex, toRgba, toCSSVarName };

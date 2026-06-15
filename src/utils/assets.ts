/// <reference types="@figma/plugin-typings" />

import type { AssetEntry } from '../types';

const ICON_NAME_RE = /\b(icon|ic[-_/]|ico[-_/]|glyph|logo|symbol|chevron|arrow)\b/i;
const IMAGE_NAME_RE = /\b(image|img|photo|picture|bitmap|banner|thumbnail|thumb|avatar|cover)\b/i;

const VECTOR_TYPES = new Set([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'STAR',
  'LINE',
  'ELLIPSE',
  'POLYGON',
]);

const SCANNABLE_TYPES = new Set([
  ...VECTOR_TYPES,
  'RECTANGLE',
  'FRAME',
  'COMPONENT',
  'INSTANCE',
  'GROUP',
  'TEXT',
  'SLICE',
]);

const MAX_ICON_SIZE = 128;
const MAX_SCAN_DEPTH = 12;

function nodeSize(node: SceneNode): { width: number; height: number } {
  if ('width' in node && 'height' in node) {
    return { width: Math.round(node.width), height: Math.round(node.height) };
  }
  const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
  return { width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
}

function hasImageFill(node: SceneNode): boolean {
  if (!('fills' in node) || !Array.isArray(node.fills)) return false;
  return (node.fills as Paint[]).some((f) => f.type === 'IMAGE' && f.visible !== false);
}

function isVectorLeaf(node: SceneNode): boolean {
  return VECTOR_TYPES.has(node.type);
}

function containsOnlyVectors(node: SceneNode): boolean {
  if (isVectorLeaf(node)) return true;
  if (node.type === 'TEXT' || node.type === 'SLICE') return false;
  if (!('children' in node)) return false;

  const visible = node.children.filter((c) => c.visible);
  if (visible.length === 0) return false;
  return visible.every((c) => isVectorLeaf(c) || containsOnlyVectors(c));
}

function hasExportSettings(node: SceneNode): boolean {
  return 'exportSettings' in node && node.exportSettings.length > 0;
}

export function classifyAsset(node: SceneNode): AssetEntry['kind'] {
  const { width, height } = nodeSize(node);
  const maxDim = Math.max(width, height);

  const imageByFill = hasImageFill(node);
  const imageByName = IMAGE_NAME_RE.test(node.name);
  const iconByName = ICON_NAME_RE.test(node.name);
  const iconByExport = hasExportSettings(node);
  const iconByVector =
    (isVectorLeaf(node) || (('children' in node) && containsOnlyVectors(node))) &&
    maxDim > 0 &&
    maxDim <= MAX_ICON_SIZE &&
    width > 0 &&
    height > 0;

  if (imageByFill || (imageByName && !iconByName && !iconByVector)) return 'image';
  if (iconByExport || iconByName || iconByVector) return 'icon';
  if (imageByName) return 'image';

  return 'other';
}

function toAssetEntry(node: SceneNode, depth: number): AssetEntry {
  const { width, height } = nodeSize(node);
  const kind = classifyAsset(node);
  return {
    id: node.id,
    name: node.name,
    width,
    height,
    kind,
    nodeType: node.type,
    depth,
    hasExportSettings: hasExportSettings(node),
  };
}

function isEffectivelyVisible(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== 'DOCUMENT') {
    if ('visible' in current && current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function canScan(node: SceneNode): boolean {
  return SCANNABLE_TYPES.has(node.type) && isEffectivelyVisible(node);
}

function collectAssets(
  root: SceneNode,
  options: { includeRoot: boolean; filterKind?: AssetEntry['kind'][] }
): AssetEntry[] {
  const seen = new Set<string>();
  const result: AssetEntry[] = [];

  function add(node: SceneNode, depth: number): void {
    if (!canScan(node) || seen.has(node.id)) return;
    seen.add(node.id);

    const entry = toAssetEntry(node, depth);
    const passesFilter = !options.filterKind || options.filterKind.includes(entry.kind);
    if (passesFilter) result.push(entry);
  }

  function walk(node: SceneNode, depth: number): void {
    if (depth > MAX_SCAN_DEPTH || !isEffectivelyVisible(node)) return;
    add(node, depth);
    if ('children' in node) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  }

  if (options.includeRoot) {
    walk(root, 0);
  } else if ('children' in root) {
    for (const child of root.children) {
      walk(child, 0);
    }
  }

  return result;
}

export function scanAllAssets(root: SceneNode): AssetEntry[] {
  return collectAssets(root, { includeRoot: true });
}

export function scanFilteredAssets(root: SceneNode): AssetEntry[] {
  return collectAssets(root, { includeRoot: true, filterKind: ['icon', 'image'] });
}

export function defaultFormatForAsset(asset: AssetEntry): 'SVG' | 'PNG' | 'PDF' {
  if (asset.kind === 'image') return 'PNG';
  if (asset.kind === 'icon') return 'SVG';
  return 'PNG';
}

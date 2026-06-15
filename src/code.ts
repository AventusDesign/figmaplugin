/// <reference types="@figma/plugin-typings" />

import type { InspectData, SerializableEffect, SerializablePaint } from './types';
import { buildBoxModel } from './utils/box-model';
import { collectColors } from './utils/colors';
import { scanAllAssets, scanFilteredAssets } from './utils/assets';
import { exportNode, type ExportFormat } from './utils/export';
import { clearOverlays, drawSpacingOverlay, isLayoutNode } from './utils/spacing';
import { resolveAllVariables } from './utils/variables';

figma.showUI('___INJECT_UI_HTML___', { width: 320, height: 600, title: 'Inspect' });

let spacingEnabled = false;

figma.on('selectionchange', () => {
  handleSelectionChange();
});

figma.on('currentpagechange', () => {
  clearOverlays();
  handleSelectionChange();
});

figma.on('close', () => {
  clearOverlays();
});

function serializePaint(paint: Paint): SerializablePaint {
  const base: SerializablePaint = {
    type: paint.type,
    visible: paint.visible,
    opacity: 'opacity' in paint ? paint.opacity : undefined,
  };
  if (paint.type === 'SOLID') {
    base.color = { r: paint.color.r, g: paint.color.g, b: paint.color.b };
  }
  if (paint.type === 'GRADIENT_LINEAR' || paint.type === 'GRADIENT_RADIAL') {
    base.gradientStops = paint.gradientStops.map((s) => ({
      position: s.position,
      color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
    }));
    base.gradientTransform = paint.gradientTransform;
  }
  return base;
}

function serializeEffect(effect: Effect): SerializableEffect {
  const base: SerializableEffect = { type: effect.type, visible: effect.visible };
  if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
    base.radius = effect.radius;
    base.spread = effect.spread;
    base.offset = { x: effect.offset.x, y: effect.offset.y };
    base.color = { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a };
  }
  if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
    base.radius = effect.radius;
  }
  return base;
}

function getCornerRadii(node: SceneNode): InspectData['cornerRadii'] | undefined {
  if (!('topLeftRadius' in node)) return undefined;
  const n = node as RectangleNode | FrameNode;
  return {
    tl: n.topLeftRadius,
    tr: n.topRightRadius,
    br: n.bottomRightRadius,
    bl: n.bottomLeftRadius,
  };
}

function getCornerRadius(node: SceneNode): number | 'MIXED' | undefined {
  if (!('cornerRadius' in node)) return undefined;
  const cr = node.cornerRadius;
  if (cr === figma.mixed) return 'MIXED';
  return cr;
}

async function buildInspectData(node: SceneNode): Promise<InspectData> {
  const box = 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
  const parent = node.parent;
  const parentLayoutMode =
    parent && 'layoutMode' in parent ? parent.layoutMode : 'NONE';

  const data: InspectData = {
    id: node.id,
    name: node.name,
    type: node.type,
    width: Math.round('width' in node ? node.width : box?.width ?? 0),
    height: Math.round('height' in node ? node.height : box?.height ?? 0),
    x: box ? Math.round(box.x) : undefined,
    y: box ? Math.round(box.y) : undefined,
    fills: [],
    strokes: [],
    effects: [],
    boundVariables: {},
  };

  if ('layoutAlign' in node) data.layoutAlign = node.layoutAlign;
  data.parentLayoutMode = parentLayoutMode;

  if (isLayoutNode(node)) {
    data.layoutMode = node.layoutMode;
    if (node.layoutMode !== 'NONE') {
      data.paddingTop = node.paddingTop;
      data.paddingBottom = node.paddingBottom;
      data.paddingLeft = node.paddingLeft;
      data.paddingRight = node.paddingRight;
      data.itemSpacing = node.itemSpacing;
      data.primaryAxisAlignItems = node.primaryAxisAlignItems;
      data.counterAxisAlignItems = node.counterAxisAlignItems;
      data.layoutWrap = node.layoutWrap;
    }
  }

  if ('fills' in node && Array.isArray(node.fills)) {
    data.fills = (node.fills as Paint[]).map(serializePaint);
  }
  if ('strokes' in node && Array.isArray(node.strokes)) {
    data.strokes = (node.strokes as Paint[]).map(serializePaint);
  }
  if ('strokeWeight' in node && typeof node.strokeWeight === 'number') {
    data.strokeWeight = node.strokeWeight;
  }
  if ('opacity' in node && typeof node.opacity === 'number') {
    data.opacity = node.opacity;
  }
  if ('effects' in node && Array.isArray(node.effects)) {
    data.effects = node.effects.map(serializeEffect);
  }

  const cr = getCornerRadius(node);
  if (cr !== undefined) {
    data.cornerRadius = cr;
    if (cr === 'MIXED') data.cornerRadii = getCornerRadii(node);
  }

  if (node.type === 'TEXT') {
    data.fontFamily = node.fontName === figma.mixed ? 'MIXED' : node.fontName.family;
    data.fontStyle = node.fontName === figma.mixed ? 'MIXED' : node.fontName.style;
    data.fontSize = node.fontSize === figma.mixed ? 'MIXED' : node.fontSize;
    data.fontWeight = node.fontWeight === figma.mixed ? 'MIXED' : node.fontWeight;

    if (node.lineHeight === figma.mixed) {
      data.lineHeight = 'MIXED';
    } else {
      data.lineHeight = { unit: node.lineHeight.unit, value: 'value' in node.lineHeight ? node.lineHeight.value : undefined };
    }

    if (node.letterSpacing === figma.mixed) {
      data.letterSpacing = 'MIXED';
    } else {
      data.letterSpacing = { unit: node.letterSpacing.unit, value: node.letterSpacing.value };
    }

    data.textAlignHorizontal = node.textAlignHorizontal;
    const td = node.textDecoration;
    data.textDecoration = td === figma.mixed ? 'MIXED' : td;
  }

  if (node.type === 'INSTANCE' && node.mainComponent) {
    data.masterComponentName = node.mainComponent.name;
  }

  if ('boundVariables' in node && node.boundVariables) {
    for (const [key, val] of Object.entries(node.boundVariables)) {
      if (Array.isArray(val)) {
        data.boundVariables[key] = { id: val[0]?.id ?? '', type: 'array' };
      } else if (val && typeof val === 'object' && 'id' in val) {
        data.boundVariables[key] = { id: (val as VariableAlias).id };
      }
    }
  }

  if ('exportSettings' in node && node.exportSettings.length > 0) {
    data.exportSettings = node.exportSettings.map((s) => {
      const entry: { format: string; constraint?: { type: string; value: number } } = { format: s.format };
      if ('constraint' in s && s.constraint) {
        entry.constraint = { type: s.constraint.type, value: s.constraint.value };
      }
      return entry;
    });
  }

  data.allAssets = scanAllAssets(node);
  data.filteredAssets = scanFilteredAssets(node);
  data.boxModel = buildBoxModel(node);

  return data;
}

async function handleSelectionChange(): Promise<void> {
  clearOverlays();

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'NO_SELECTION' });
    return;
  }
  if (selection.length > 1) {
    figma.ui.postMessage({ type: 'MULTI_SELECTION' });
    return;
  }

  try {
    const node = selection[0];
    const data = await buildInspectData(node);
    const boundForResolve: Record<string, VariableAlias> = {};
    if ('boundVariables' in node && node.boundVariables) {
      for (const [key, val] of Object.entries(node.boundVariables)) {
        if (val && !Array.isArray(val) && typeof val === 'object' && 'id' in val) {
          boundForResolve[key] = val as VariableAlias;
        }
      }
    }
    const variables = await resolveAllVariables(boundForResolve);
    const colors = await collectColors(node);

    figma.ui.postMessage({ type: 'INSPECT_DATA', data, variables, colors });

    if (spacingEnabled && isLayoutNode(node)) {
      await drawSpacingOverlay(node);
    }
  } catch {
    figma.ui.postMessage({ type: 'NO_SELECTION' });
  }
}

async function exportSingle(nodeId: string, format: string, scale: number): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('exportAsync' in node)) return;

  const result = await exportNode(node as SceneNode, format as ExportFormat, scale);
  figma.ui.postMessage({
    type: 'EXPORT_RESULT',
    bytes: Array.from(result.bytes),
    filename: result.filename,
    mimeType: result.mimeType,
  });
}

async function handleExport(msg: { nodeId: string; format: string; scale: number }): Promise<void> {
  try {
    await exportSingle(msg.nodeId, msg.format, msg.scale);
  } catch (e) {
    figma.notify('Export failed: ' + String(e));
  }
}

async function handleExportBatch(items: Array<{ nodeId: string; format: string; scale: number }>): Promise<void> {
  let ok = 0;
  for (const item of items) {
    try {
      await exportSingle(item.nodeId, item.format, item.scale);
      ok++;
    } catch {
      // continue with remaining items
    }
  }
  if (ok > 0) figma.notify(`Exported ${ok} of ${items.length} assets`);
  else figma.notify('Export failed');
}

figma.ui.onmessage = async (msg: {
  type: string;
  enabled?: boolean;
  width?: number;
  height?: number;
  nodeId?: string;
  format?: string;
  scale?: number;
  items?: Array<{ nodeId: string; format: string; scale: number }>;
}) => {
  switch (msg.type) {
    case 'EXPORT_REQUEST':
      if (msg.nodeId && msg.format) {
        await handleExport({ nodeId: msg.nodeId, format: msg.format, scale: msg.scale ?? 1 });
      }
      break;

    case 'EXPORT_BATCH_REQUEST':
      if (msg.items?.length) await handleExportBatch(msg.items);
      break;

    case 'TOGGLE_SPACING':
      spacingEnabled = !!msg.enabled;
      if (!spacingEnabled) {
        clearOverlays();
      } else {
        const node = figma.currentPage.selection[0];
        if (node && isLayoutNode(node)) {
          await drawSpacingOverlay(node);
        }
      }
      break;

    case 'RESIZE':
      if (msg.width && msg.height) {
        figma.ui.resize(msg.width, msg.height);
      }
      break;

    case 'PLUGIN_CLOSED':
      spacingEnabled = false;
      clearOverlays();
      break;
  }
};

handleSelectionChange();

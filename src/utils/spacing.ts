/// <reference types="@figma/plugin-typings" />

export const OVERLAY_TAG_KEY = 'inspect_overlay';
export const OVERLAY_TAG_VAL = 'true';

let fontLoaded = false;

async function ensureFont(): Promise<void> {
  if (fontLoaded) return;
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    fontLoaded = true;
  } catch {
    await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    fontLoaded = true;
  }
}

export function clearOverlays(): void {
  const overlays = figma.currentPage.findAll(
    (n) => n.getPluginData(OVERLAY_TAG_KEY) === OVERLAY_TAG_VAL
  );
  for (const n of overlays) {
    try {
      n.remove();
    } catch {
      // node may already be removed
    }
  }
}

function drawPaddingRect(side: string, x: number, y: number, w: number, h: number): void {
  if (h <= 0 || w <= 0) return;
  const rect = figma.createRectangle();
  rect.x = x;
  rect.y = y;
  rect.resize(w, h);
  rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 }, opacity: 0.25 }];
  rect.name = `__spacing_${side}`;
  rect.setPluginData(OVERLAY_TAG_KEY, OVERLAY_TAG_VAL);
  figma.currentPage.appendChild(rect);
}

async function drawLabel(value: number, x: number, y: number): Promise<void> {
  if (value <= 0) return;
  await ensureFont();

  const text = figma.createText();
  text.characters = `${Math.round(value)}`;
  text.fontSize = 10;
  text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  const bg = figma.createFrame();
  bg.resize(text.width + 8, text.height + 4);
  bg.x = x - bg.width / 2;
  bg.y = y - bg.height / 2;
  bg.fills = [{ type: 'SOLID', color: { r: 1, g: 0.45, b: 0 } }];
  bg.cornerRadius = 3;
  bg.setPluginData(OVERLAY_TAG_KEY, OVERLAY_TAG_VAL);
  bg.appendChild(text);
  text.x = 4;
  text.y = 2;
  figma.currentPage.appendChild(bg);
}

function drawGapLines(node: FrameNode | ComponentNode | InstanceNode): void {
  const children = node.children.filter((c) => c.visible);
  if (children.length < 2) return;

  const spacing = node.itemSpacing;
  if (!spacing || spacing <= 0) return;

  for (let i = 0; i < children.length - 1; i++) {
    const a = children[i];
    const b = children[i + 1];
    const boxA = a.absoluteBoundingBox;
    const boxB = b.absoluteBoundingBox;
    if (!boxA || !boxB) continue;

    const line = figma.createRectangle();
    line.setPluginData(OVERLAY_TAG_KEY, OVERLAY_TAG_VAL);
    line.fills = [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 }, opacity: 0.5 }];
    line.name = '__spacing_gap';

    if (node.layoutMode === 'HORIZONTAL') {
      const x = boxA.x + boxA.width;
      const y = Math.min(boxA.y, boxB.y);
      const h = Math.max(boxA.height, boxB.height);
      line.x = x;
      line.y = y;
      line.resize(spacing, h);
    } else {
      const x = Math.min(boxA.x, boxB.x);
      const y = boxA.y + boxA.height;
      const w = Math.max(boxA.width, boxB.width);
      line.x = x;
      line.y = y;
      line.resize(w, spacing);
    }

    figma.currentPage.appendChild(line);

    const midX =
      node.layoutMode === 'HORIZONTAL'
        ? boxA.x + boxA.width + spacing / 2
        : (boxA.x + boxA.width / 2 + boxB.x + boxB.width / 2) / 2;
    const midY =
      node.layoutMode === 'HORIZONTAL'
        ? (boxA.y + boxA.height / 2 + boxB.y + boxB.height / 2) / 2
        : boxA.y + boxA.height + spacing / 2;

    drawLabel(spacing, midX, midY);
  }
}

export function isLayoutNode(node: SceneNode): node is FrameNode | ComponentNode | InstanceNode {
  return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
}

export async function drawSpacingOverlay(node: FrameNode | ComponentNode | InstanceNode): Promise<void> {
  clearOverlays();

  const box = node.absoluteBoundingBox;
  if (!box) return;

  const { x, y, width, height } = box;
  const pt = node.paddingTop ?? 0;
  const pb = node.paddingBottom ?? 0;
  const pl = node.paddingLeft ?? 0;
  const pr = node.paddingRight ?? 0;

  drawPaddingRect('top', x, y, width, pt);
  drawPaddingRect('bottom', x, y + height - pb, width, pb);
  drawPaddingRect('left', x, y, pl, height);
  drawPaddingRect('right', x + width - pr, y, pr, height);

  await drawLabel(pt, x + width / 2, y + pt / 2);
  await drawLabel(pb, x + width / 2, y + height - pb / 2);
  await drawLabel(pl, x + pl / 2, y + height / 2);
  await drawLabel(pr, x + width - pr / 2, y + height / 2);

  if (node.layoutMode !== 'NONE') {
    drawGapLines(node);
  }
}

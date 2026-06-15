/// <reference types="@figma/plugin-typings" />

import type { BoxModelData } from '../types';

function dash(n: number): string {
  return n > 0 ? String(Math.round(n)) : '—';
}

export function buildBoxModel(node: SceneNode): BoxModelData | undefined {
  if (!('width' in node) || !('height' in node)) return undefined;

  const width = node.width;
  const height = node.height;

  let pt = 0;
  let pr = 0;
  let pb = 0;
  let pl = 0;
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    if (node.layoutMode !== 'NONE') {
      pt = node.paddingTop;
      pr = node.paddingRight;
      pb = node.paddingBottom;
      pl = node.paddingLeft;
    }
  }

  let borderTop = 0;
  let borderRight = 0;
  let borderBottom = 0;
  let borderLeft = 0;
  if ('strokeTopWeight' in node) {
    borderTop = typeof node.strokeTopWeight === 'number' ? node.strokeTopWeight : 0;
    borderRight = typeof node.strokeRightWeight === 'number' ? node.strokeRightWeight : 0;
    borderBottom = typeof node.strokeBottomWeight === 'number' ? node.strokeBottomWeight : 0;
    borderLeft = typeof node.strokeLeftWeight === 'number' ? node.strokeLeftWeight : 0;
  } else if ('strokeWeight' in node && typeof node.strokeWeight === 'number') {
    borderTop = borderRight = borderBottom = borderLeft = node.strokeWeight;
  }

  let radiusTl = 0;
  let radiusTr = 0;
  let radiusBr = 0;
  let radiusBl = 0;
  if ('topLeftRadius' in node) {
    radiusTl = node.topLeftRadius;
    radiusTr = node.topRightRadius;
    radiusBr = node.bottomRightRadius;
    radiusBl = node.bottomLeftRadius;
  } else if ('cornerRadius' in node && typeof node.cornerRadius === 'number') {
    radiusTl = radiusTr = radiusBr = radiusBl = node.cornerRadius;
  }

  const contentWidth = Math.max(0, Math.round(width - pl - pr));
  const contentHeight = Math.max(0, Math.round(height - pt - pb));

  const box: BoxModelData = {
    contentWidth,
    contentHeight,
    paddingTop: pt,
    paddingRight: pr,
    paddingBottom: pb,
    paddingLeft: pl,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
    radiusTl,
    radiusTr,
    radiusBr,
    radiusBl,
  };

  const parent = node.parent;
  if (parent && 'width' in parent && 'x' in node && 'y' in node) {
    const pw = parent.width;
    const ph = parent.height;
    box.marginTop = Math.round(node.y);
    box.marginLeft = Math.round(node.x);
    box.marginRight = Math.round(pw - node.x - width);
    box.marginBottom = Math.round(ph - node.y - height);
  }

  return box;
}

export { dash };

"use strict";
(() => {
  // src/utils/box-model.ts
  function buildBoxModel(node) {
    if (!("width" in node) || !("height" in node)) return void 0;
    const width = node.width;
    const height = node.height;
    let pt = 0;
    let pr = 0;
    let pb = 0;
    let pl = 0;
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
      if (node.layoutMode !== "NONE") {
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
    if ("strokeTopWeight" in node) {
      borderTop = typeof node.strokeTopWeight === "number" ? node.strokeTopWeight : 0;
      borderRight = typeof node.strokeRightWeight === "number" ? node.strokeRightWeight : 0;
      borderBottom = typeof node.strokeBottomWeight === "number" ? node.strokeBottomWeight : 0;
      borderLeft = typeof node.strokeLeftWeight === "number" ? node.strokeLeftWeight : 0;
    } else if ("strokeWeight" in node && typeof node.strokeWeight === "number") {
      borderTop = borderRight = borderBottom = borderLeft = node.strokeWeight;
    }
    let radiusTl = 0;
    let radiusTr = 0;
    let radiusBr = 0;
    let radiusBl = 0;
    if ("topLeftRadius" in node) {
      radiusTl = node.topLeftRadius;
      radiusTr = node.topRightRadius;
      radiusBr = node.bottomRightRadius;
      radiusBl = node.bottomLeftRadius;
    } else if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      radiusTl = radiusTr = radiusBr = radiusBl = node.cornerRadius;
    }
    const contentWidth = Math.max(0, Math.round(width - pl - pr));
    const contentHeight = Math.max(0, Math.round(height - pt - pb));
    const box = {
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
      radiusBl
    };
    const parent = node.parent;
    if (parent && "width" in parent && "x" in node && "y" in node) {
      const pw = parent.width;
      const ph = parent.height;
      box.marginTop = Math.round(node.y);
      box.marginLeft = Math.round(node.x);
      box.marginRight = Math.round(pw - node.x - width);
      box.marginBottom = Math.round(ph - node.y - height);
    }
    return box;
  }

  // src/utils/variables.ts
  function toCSSVarName(name) {
    return "--" + name.replace(/\//g, "-").replace(/\s+/g, "-");
  }
  async function resolveVariable(alias) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(alias.id);
      if (!variable) return null;
      const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      if (!collection) return null;
      const modeId = collection.defaultModeId;
      const value = variable.valuesByMode[modeId];
      return {
        name: variable.name,
        cssName: toCSSVarName(variable.name),
        collection: collection.name,
        resolvedType: variable.resolvedType,
        value,
        modeId
      };
    } catch (e) {
      return null;
    }
  }
  async function resolveAllVariables(boundVariables) {
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const key of Object.keys(boundVariables)) {
      const alias = boundVariables[key];
      const aliases = Array.isArray(alias) ? alias : [alias];
      for (const a of aliases) {
        if (!a || seen.has(a.id)) continue;
        seen.add(a.id);
        const resolved = await resolveVariable(a);
        if (resolved) results.push(resolved);
      }
    }
    return results;
  }
  async function resolveVariableById(id) {
    return resolveVariable({ id, type: "VARIABLE_ALIAS" });
  }

  // src/utils/colors.ts
  function toHex(color) {
    const h = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${h(color.r)}${h(color.g)}${h(color.b)}`.toUpperCase();
  }
  function toRgba(color, opacity) {
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity.toFixed(2)})`;
  }
  function usageFromNode(n, kind) {
    if (n.type === "TEXT" && kind === "fill") return "text";
    if (kind === "stroke") return "border";
    return "background";
  }
  async function pushSolidColor(map, n, paint, kind) {
    var _a, _b;
    if (paint.visible === false) return;
    const hex = toHex(paint.color);
    let variable = null;
    const bv = "boundVariables" in n ? n.boundVariables : void 0;
    if (bv) {
      const raw = bv[kind === "fill" ? "fills" : "strokes"];
      const alias = Array.isArray(raw) ? raw[0] : raw;
      if (alias && typeof alias === "object" && "id" in alias) {
        variable = await resolveVariableById(alias.id);
      }
    }
    const key = `${hex}|${(_a = variable == null ? void 0 : variable.cssName) != null ? _a : ""}`;
    const usage = { usage: usageFromNode(n, kind), nodeName: n.name };
    const existing = map.get(key);
    if (existing) {
      const dup = existing.usages.some((u) => u.nodeName === usage.nodeName && u.usage === usage.usage);
      if (!dup) existing.usages.push(usage);
    } else {
      map.set(key, { hex, rgba: toRgba(paint.color, (_b = paint.opacity) != null ? _b : 1), variable, usages: [usage] });
    }
  }
  async function collectColors(node) {
    const map = /* @__PURE__ */ new Map();
    async function traverse(n) {
      if ("fills" in n && Array.isArray(n.fills)) {
        for (const fill of n.fills) {
          if (fill.type === "SOLID") await pushSolidColor(map, n, fill, "fill");
        }
      }
      if ("strokes" in n && Array.isArray(n.strokes)) {
        for (const stroke of n.strokes) {
          if (stroke.type === "SOLID") await pushSolidColor(map, n, stroke, "stroke");
        }
      }
      if ("children" in n) {
        for (const child of n.children) await traverse(child);
      }
    }
    await traverse(node);
    return Array.from(map.values());
  }

  // src/utils/assets.ts
  var ICON_NAME_RE = /\b(icon|ic[-_/]|ico[-_/]|glyph|logo|symbol|chevron|arrow)\b/i;
  var IMAGE_NAME_RE = /\b(image|img|photo|picture|bitmap|banner|thumbnail|thumb|avatar|cover)\b/i;
  var VECTOR_TYPES = /* @__PURE__ */ new Set([
    "VECTOR",
    "BOOLEAN_OPERATION",
    "STAR",
    "LINE",
    "ELLIPSE",
    "POLYGON"
  ]);
  var SCANNABLE_TYPES = /* @__PURE__ */ new Set([
    ...VECTOR_TYPES,
    "RECTANGLE",
    "FRAME",
    "COMPONENT",
    "INSTANCE",
    "GROUP",
    "TEXT",
    "SLICE"
  ]);
  var MAX_ICON_SIZE = 128;
  var MAX_SCAN_DEPTH = 12;
  function nodeSize(node) {
    var _a, _b;
    if ("width" in node && "height" in node) {
      return { width: Math.round(node.width), height: Math.round(node.height) };
    }
    const box = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
    return { width: Math.round((_a = box == null ? void 0 : box.width) != null ? _a : 0), height: Math.round((_b = box == null ? void 0 : box.height) != null ? _b : 0) };
  }
  function hasImageFill(node) {
    if (!("fills" in node) || !Array.isArray(node.fills)) return false;
    return node.fills.some((f) => f.type === "IMAGE" && f.visible !== false);
  }
  function isVectorLeaf(node) {
    return VECTOR_TYPES.has(node.type);
  }
  function containsOnlyVectors(node) {
    if (isVectorLeaf(node)) return true;
    if (node.type === "TEXT" || node.type === "SLICE") return false;
    if (!("children" in node)) return false;
    const visible = node.children.filter((c) => c.visible);
    if (visible.length === 0) return false;
    return visible.every((c) => isVectorLeaf(c) || containsOnlyVectors(c));
  }
  function hasExportSettings(node) {
    return "exportSettings" in node && node.exportSettings.length > 0;
  }
  function classifyAsset(node) {
    const { width, height } = nodeSize(node);
    const maxDim = Math.max(width, height);
    const imageByFill = hasImageFill(node);
    const imageByName = IMAGE_NAME_RE.test(node.name);
    const iconByName = ICON_NAME_RE.test(node.name);
    const iconByExport = hasExportSettings(node);
    const iconByVector = (isVectorLeaf(node) || "children" in node && containsOnlyVectors(node)) && maxDim > 0 && maxDim <= MAX_ICON_SIZE && width > 0 && height > 0;
    if (imageByFill || imageByName && !iconByName && !iconByVector) return "image";
    if (iconByExport || iconByName || iconByVector) return "icon";
    if (imageByName) return "image";
    return "other";
  }
  function toAssetEntry(node, depth) {
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
      hasExportSettings: hasExportSettings(node)
    };
  }
  function isEffectivelyVisible(node) {
    let current = node;
    while (current && current.type !== "DOCUMENT") {
      if ("visible" in current && current.visible === false) return false;
      current = current.parent;
    }
    return true;
  }
  function canScan(node) {
    return SCANNABLE_TYPES.has(node.type) && isEffectivelyVisible(node);
  }
  function collectAssets(root, options) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    function add(node, depth) {
      if (!canScan(node) || seen.has(node.id)) return;
      seen.add(node.id);
      const entry = toAssetEntry(node, depth);
      const passesFilter = !options.filterKind || options.filterKind.includes(entry.kind);
      if (passesFilter) result.push(entry);
    }
    function walk(node, depth) {
      if (depth > MAX_SCAN_DEPTH || !isEffectivelyVisible(node)) return;
      add(node, depth);
      if ("children" in node) {
        for (const child of node.children) {
          walk(child, depth + 1);
        }
      }
    }
    if (options.includeRoot) {
      walk(root, 0);
    } else if ("children" in root) {
      for (const child of root.children) {
        walk(child, 0);
      }
    }
    return result;
  }
  function scanAllAssets(root) {
    return collectAssets(root, { includeRoot: true });
  }
  function scanFilteredAssets(root) {
    return collectAssets(root, { includeRoot: true, filterKind: ["icon", "image"] });
  }

  // src/utils/export.ts
  function getMimeType(format) {
    switch (format) {
      case "SVG":
        return "image/svg+xml";
      case "PNG":
        return "image/png";
      case "PDF":
        return "application/pdf";
      default:
        return "application/octet-stream";
    }
  }
  async function exportNode(node, format, scale = 1) {
    const settings = format === "PNG" ? { format: "PNG", constraint: { type: "SCALE", value: scale } } : { format };
    const bytes = await node.exportAsync(settings);
    const safeName = node.name.replace(/[/\\?%*:|"<>]/g, "-");
    return {
      bytes,
      filename: `${safeName}.${format.toLowerCase()}`,
      mimeType: getMimeType(format)
    };
  }

  // src/utils/spacing.ts
  var OVERLAY_TAG_KEY = "inspect_overlay";
  var OVERLAY_TAG_VAL = "true";
  var fontLoaded = false;
  async function ensureFont() {
    if (fontLoaded) return;
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      fontLoaded = true;
    } catch (e) {
      await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
      fontLoaded = true;
    }
  }
  function clearOverlays() {
    const overlays = figma.currentPage.findAll(
      (n) => n.getPluginData(OVERLAY_TAG_KEY) === OVERLAY_TAG_VAL
    );
    for (const n of overlays) {
      try {
        n.remove();
      } catch (e) {
      }
    }
  }
  function drawPaddingRect(side, x, y, w, h) {
    if (h <= 0 || w <= 0) return;
    const rect = figma.createRectangle();
    rect.x = x;
    rect.y = y;
    rect.resize(w, h);
    rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.6, b: 0 }, opacity: 0.25 }];
    rect.name = `__spacing_${side}`;
    rect.setPluginData(OVERLAY_TAG_KEY, OVERLAY_TAG_VAL);
    figma.currentPage.appendChild(rect);
  }
  async function drawLabel(value, x, y) {
    if (value <= 0) return;
    await ensureFont();
    const text = figma.createText();
    text.characters = `${Math.round(value)}`;
    text.fontSize = 10;
    text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    const bg = figma.createFrame();
    bg.resize(text.width + 8, text.height + 4);
    bg.x = x - bg.width / 2;
    bg.y = y - bg.height / 2;
    bg.fills = [{ type: "SOLID", color: { r: 1, g: 0.45, b: 0 } }];
    bg.cornerRadius = 3;
    bg.setPluginData(OVERLAY_TAG_KEY, OVERLAY_TAG_VAL);
    bg.appendChild(text);
    text.x = 4;
    text.y = 2;
    figma.currentPage.appendChild(bg);
  }
  function drawGapLines(node) {
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
      line.fills = [{ type: "SOLID", color: { r: 1, g: 0.6, b: 0 }, opacity: 0.5 }];
      line.name = "__spacing_gap";
      if (node.layoutMode === "HORIZONTAL") {
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
      const midX = node.layoutMode === "HORIZONTAL" ? boxA.x + boxA.width + spacing / 2 : (boxA.x + boxA.width / 2 + boxB.x + boxB.width / 2) / 2;
      const midY = node.layoutMode === "HORIZONTAL" ? (boxA.y + boxA.height / 2 + boxB.y + boxB.height / 2) / 2 : boxA.y + boxA.height + spacing / 2;
      drawLabel(spacing, midX, midY);
    }
  }
  function isLayoutNode(node) {
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
  }
  async function drawSpacingOverlay(node) {
    var _a, _b, _c, _d;
    clearOverlays();
    const box = node.absoluteBoundingBox;
    if (!box) return;
    const { x, y, width, height } = box;
    const pt = (_a = node.paddingTop) != null ? _a : 0;
    const pb = (_b = node.paddingBottom) != null ? _b : 0;
    const pl = (_c = node.paddingLeft) != null ? _c : 0;
    const pr = (_d = node.paddingRight) != null ? _d : 0;
    drawPaddingRect("top", x, y, width, pt);
    drawPaddingRect("bottom", x, y + height - pb, width, pb);
    drawPaddingRect("left", x, y, pl, height);
    drawPaddingRect("right", x + width - pr, y, pr, height);
    await drawLabel(pt, x + width / 2, y + pt / 2);
    await drawLabel(pb, x + width / 2, y + height - pb / 2);
    await drawLabel(pl, x + pl / 2, y + height / 2);
    await drawLabel(pr, x + width - pr / 2, y + height / 2);
    if (node.layoutMode !== "NONE") {
      drawGapLines(node);
    }
  }

  // src/code.ts
  figma.showUI("<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <style>:root {\n  --bg-primary: #1e1e1e;\n  --bg-secondary: #2c2c2c;\n  --bg-tertiary: #383838;\n  --text-primary: #ffffff;\n  --text-secondary: #8a8a8a;\n  --accent: #0d99ff;\n  --pink: #ff4785;\n  --border: #3a3a3a;\n  --spacing-color: #ff7200;\n}\n\n* {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n\nbody {\n  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  font-size: 11px;\n  background: var(--bg-primary);\n  color: var(--text-primary);\n  overflow-x: hidden;\n}\n\n.hidden {\n  display: none !important;\n}\n\n/* Header */\n.header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--border);\n  background: var(--bg-secondary);\n}\n\n.header-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.toggle-pill {\n  padding: 4px 10px;\n  border-radius: 12px;\n  border: 1px solid var(--border);\n  background: var(--bg-tertiary);\n  color: var(--text-secondary);\n  font-size: 10px;\n  cursor: pointer;\n  transition: all 0.15s;\n}\n\n.toggle-pill.active {\n  background: var(--spacing-color);\n  color: #fff;\n  border-color: var(--spacing-color);\n}\n\n.header-selects {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.format-select {\n  background: var(--bg-tertiary);\n  border: 1px solid var(--border);\n  color: var(--text-primary);\n  font-size: 10px;\n  padding: 2px 6px;\n  border-radius: 4px;\n  cursor: pointer;\n}\n\n/* Tabs */\n.tabs {\n  display: flex;\n  border-bottom: 1px solid var(--border);\n}\n\n.tab {\n  flex: 1;\n  padding: 8px;\n  text-align: center;\n  background: none;\n  border: none;\n  color: var(--text-secondary);\n  cursor: pointer;\n  font-size: 11px;\n  border-bottom: 2px solid transparent;\n}\n\n.tab.active {\n  color: var(--text-primary);\n  border-bottom-color: var(--accent);\n}\n\n.sub-tabs {\n  display: flex;\n  gap: 4px;\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--border);\n}\n\n.sub-tab {\n  padding: 4px 12px;\n  border-radius: 4px;\n  border: none;\n  background: var(--bg-tertiary);\n  color: var(--text-secondary);\n  cursor: pointer;\n  font-size: 10px;\n}\n\n.sub-tab.active {\n  background: var(--accent);\n  color: #fff;\n}\n\n/* Content */\n.content {\n  padding: 0;\n  overflow-y: auto;\n  height: calc(100vh - 90px);\n}\n\n.empty-state {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 200px;\n  color: var(--text-secondary);\n  font-size: 12px;\n  padding: 24px;\n  text-align: center;\n}\n\n/* Node header */\n.node-header {\n  padding: 12px;\n  border-bottom: 1px solid var(--border);\n}\n\n.node-name {\n  font-weight: 600;\n  font-size: 12px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.node-type {\n  font-size: 9px;\n  color: var(--text-secondary);\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n  font-weight: 400;\n}\n\n.node-size {\n  color: var(--text-secondary);\n  margin-top: 4px;\n  font-size: 11px;\n}\n\n.master-link {\n  color: var(--accent);\n  font-size: 10px;\n  margin-top: 4px;\n}\n\n/* Sections */\n.section {\n  border-bottom: 1px solid var(--border);\n}\n\n.section-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 12px;\n  cursor: pointer;\n  user-select: none;\n}\n\n.section-header:hover {\n  background: var(--bg-secondary);\n}\n\n.section-title {\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 0.5px;\n  color: var(--text-secondary);\n  text-transform: uppercase;\n}\n\n.section-actions {\n  display: flex;\n  gap: 4px;\n}\n\n.icon-btn {\n  background: none;\n  border: none;\n  color: var(--text-secondary);\n  cursor: pointer;\n  padding: 2px 4px;\n  border-radius: 3px;\n  font-size: 12px;\n  line-height: 1;\n}\n\n.icon-btn:hover {\n  color: var(--text-primary);\n  background: var(--bg-tertiary);\n}\n\n.section-body {\n  padding: 0 12px 12px;\n}\n\n.section.collapsed .section-body {\n  display: none;\n}\n\n/* List view rows */\n.prop-row {\n  display: flex;\n  align-items: baseline;\n  padding: 2px 0;\n  font-family: 'JetBrains Mono', 'Fira Code', monospace;\n  font-size: 10px;\n  line-height: 1.6;\n}\n\n.prop-name {\n  color: var(--text-primary);\n  min-width: 110px;\n}\n\n.prop-value {\n  color: var(--pink);\n  word-break: break-all;\n}\n\n.prop-value.mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\n  font-size: 10px;\n}\n\n.color-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 0;\n}\n\n.swatch {\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  border: 1px solid var(--border);\n  flex-shrink: 0;\n  cursor: pointer;\n}\n\n.swatch:hover {\n  outline: 2px solid var(--accent);\n}\n\n.color-info {\n  flex: 1;\n  min-width: 0;\n}\n\n.color-var {\n  font-size: 10px;\n  color: var(--text-primary);\n}\n\n.color-hex {\n  font-size: 10px;\n  color: var(--text-secondary);\n  font-family: monospace;\n}\n\n.color-usage {\n  font-size: 9px;\n  color: var(--text-secondary);\n}\n\n/* Code blocks */\n.code-block {\n  position: relative;\n  background: var(--bg-secondary);\n  border-radius: 4px;\n  padding: 8px;\n  margin-bottom: 8px;\n}\n\n.code-block pre {\n  font-family: 'JetBrains Mono', 'Fira Code', monospace;\n  font-size: 10px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  word-break: break-all;\n}\n\n.css-prop {\n  color: var(--text-primary);\n}\n\n.css-val {\n  color: var(--pink);\n}\n\n.code-copy {\n  position: absolute;\n  top: 4px;\n  right: 4px;\n}\n\n/* Variables */\n.var-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: 4px 0;\n  border-bottom: 1px solid var(--border);\n}\n\n.var-row:last-child {\n  border-bottom: none;\n}\n\n.var-name {\n  font-size: 10px;\n  color: var(--text-primary);\n}\n\n.var-value {\n  font-size: 10px;\n  color: var(--pink);\n  font-family: monospace;\n}\n\n/* Export */\n.export-section {\n  padding: 12px;\n  height: calc(100vh - 120px);\n  overflow-y: auto;\n}\n\n#export-sub-tabs {\n  display: none;\n}\n\n#export-panel:not(.hidden) #export-sub-tabs {\n  display: flex;\n}\n\n.export-toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 12px;\n  gap: 8px;\n}\n\n.export-toolbar-left {\n  font-size: 10px;\n  color: var(--text-secondary);\n}\n\n.export-all-btn {\n  padding: 6px 12px;\n  background: var(--accent);\n  color: #fff;\n  border: none;\n  border-radius: 4px;\n  font-size: 10px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.export-all-btn:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asset-kind {\n  display: inline-block;\n  font-size: 8px;\n  text-transform: uppercase;\n  letter-spacing: 0.3px;\n  padding: 1px 5px;\n  border-radius: 3px;\n  margin-left: 6px;\n  font-weight: 600;\n}\n\n.asset-kind.icon {\n  background: rgba(13, 153, 255, 0.2);\n  color: var(--accent);\n}\n\n.asset-kind.image {\n  background: rgba(255, 71, 133, 0.2);\n  color: var(--pink);\n}\n\n.asset-kind.other {\n  background: var(--bg-tertiary);\n  color: var(--text-secondary);\n}\n\n.asset-meta {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-bottom: 8px;\n}\n\n.asset-type-label {\n  font-size: 9px;\n  color: var(--text-secondary);\n}\n\n.asset-controls {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n  margin-top: 8px;\n}\n\n.asset-controls .form-select {\n  flex: 1;\n  min-width: 0;\n}\n\n.asset-export-btn {\n  padding: 5px 10px;\n  background: var(--bg-tertiary);\n  border: 1px solid var(--border);\n  color: var(--text-primary);\n  border-radius: 4px;\n  font-size: 10px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.asset-export-btn:hover {\n  border-color: var(--accent);\n  color: var(--accent);\n}\n\n.export-quick-btns {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-bottom: 6px;\n}\n\n.asset-card {\n  background: var(--bg-secondary);\n  border-radius: 6px;\n  padding: 10px;\n  margin-bottom: 8px;\n}\n\n.asset-name {\n  font-weight: 500;\n  font-size: 11px;\n  margin-bottom: 2px;\n}\n\n.asset-size {\n  color: var(--text-secondary);\n  font-size: 10px;\n  margin-bottom: 8px;\n}\n\n.export-btns {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n.export-btn {\n  padding: 4px 8px;\n  border-radius: 4px;\n  border: 1px solid var(--border);\n  background: var(--bg-tertiary);\n  color: var(--text-primary);\n  font-size: 10px;\n  cursor: pointer;\n}\n\n.export-btn:hover {\n  border-color: var(--accent);\n  color: var(--accent);\n}\n\n.export-form {\n  margin-top: 16px;\n  padding-top: 12px;\n  border-top: 1px solid var(--border);\n}\n\n.form-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n}\n\n.form-label {\n  font-size: 10px;\n  color: var(--text-secondary);\n  min-width: 50px;\n}\n\n.form-select {\n  flex: 1;\n  background: var(--bg-tertiary);\n  border: 1px solid var(--border);\n  color: var(--text-primary);\n  padding: 4px 8px;\n  border-radius: 4px;\n  font-size: 10px;\n}\n\n.primary-btn {\n  width: 100%;\n  padding: 8px;\n  background: var(--accent);\n  color: #fff;\n  border: none;\n  border-radius: 4px;\n  font-size: 11px;\n  cursor: pointer;\n  margin-top: 4px;\n}\n\n.primary-btn:hover {\n  opacity: 0.9;\n}\n\n.copied {\n  color: #4caf50 !important;\n}\n\n/* Box model */\n.box-model-section {\n  padding: 12px;\n  border-bottom: 1px solid var(--border);\n}\n\n.box-model-wrap {\n  background: var(--bg-secondary);\n  border-radius: 8px;\n  padding: 20px 28px 28px;\n  position: relative;\n}\n\n.box-model-outer {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n}\n\n.margin-indicator {\n  font-size: 10px;\n  font-family: monospace;\n  color: var(--text-secondary);\n  line-height: 1;\n}\n\n.margin-indicator.top {\n  color: var(--pink);\n  margin-bottom: 4px;\n}\n\n.margin-indicator.bottom {\n  color: var(--accent);\n  margin-top: 4px;\n}\n\n.box-model-middle {\n  display: flex;\n  align-items: center;\n  width: 100%;\n  justify-content: center;\n  gap: 4px;\n}\n\n.margin-indicator.side {\n  color: var(--accent);\n  min-width: 16px;\n  text-align: center;\n}\n\n.box-border {\n  flex: 1;\n  max-width: 220px;\n  border: 1px dashed var(--border);\n  border-radius: 6px;\n  padding: 18px 14px 14px;\n  position: relative;\n  background: var(--bg-primary);\n}\n\n.box-border-label,\n.box-padding-label {\n  position: absolute;\n  top: 4px;\n  left: 6px;\n  font-size: 8px;\n  color: var(--text-secondary);\n  text-transform: capitalize;\n}\n\n.radius-label {\n  position: absolute;\n  font-size: 8px;\n  color: var(--text-secondary);\n  font-family: monospace;\n}\n\n.radius-label.tl { top: 2px; left: 14px; }\n.radius-label.tr { top: 2px; right: 14px; }\n.radius-label.bl { bottom: 2px; left: 14px; }\n.radius-label.br { bottom: 2px; right: 14px; }\n\n.border-weight {\n  position: absolute;\n  font-size: 8px;\n  color: var(--text-secondary);\n  font-family: monospace;\n}\n\n.border-weight.top { top: 4px; left: 50%; transform: translateX(-50%); }\n.border-weight.bottom { bottom: 4px; left: 50%; transform: translateX(-50%); }\n.border-weight.left { left: 4px; top: 50%; transform: translateY(-50%); }\n.border-weight.right { right: 4px; top: 50%; transform: translateY(-50%); }\n\n.box-padding {\n  background: rgba(13, 153, 255, 0.15);\n  border: 1px solid rgba(13, 153, 255, 0.3);\n  border-radius: 4px;\n  padding: 18px 12px 12px;\n  position: relative;\n  min-height: 60px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.pad-label {\n  position: absolute;\n  font-size: 9px;\n  font-family: monospace;\n  color: var(--accent);\n}\n\n.pad-label.top { top: 2px; left: 50%; transform: translateX(-50%); }\n.pad-label.bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }\n.pad-label.left { left: 4px; top: 50%; transform: translateY(-50%); }\n.pad-label.right { right: 4px; top: 50%; transform: translateY(-50%); }\n\n.box-content {\n  border: 1px dashed var(--text-secondary);\n  border-radius: 2px;\n  padding: 8px 12px;\n  font-size: 10px;\n  font-family: monospace;\n  color: var(--text-primary);\n  background: var(--bg-tertiary);\n  white-space: nowrap;\n}\n\n.box-sizing-tag {\n  position: absolute;\n  bottom: 6px;\n  right: 10px;\n  font-size: 8px;\n  color: var(--text-secondary);\n}\n\n/* Copyable rows */\n.prop-row,\n.var-row {\n  position: relative;\n  padding-right: 24px;\n}\n\n.prop-row .copy-prop,\n.var-row .copy-prop,\n.color-row-main .copy-prop {\n  position: absolute;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  opacity: 0;\n  transition: opacity 0.1s;\n}\n\n.prop-row:hover .copy-prop,\n.var-row:hover .copy-prop,\n.color-group:hover .copy-prop {\n  opacity: 1;\n}\n\n.color-group {\n  padding: 6px 0;\n  border-bottom: 1px solid var(--border);\n}\n\n.color-group:last-child {\n  border-bottom: none;\n}\n\n.color-row-main {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  position: relative;\n  padding-right: 24px;\n}\n\n.color-usages {\n  margin-left: 24px;\n  margin-top: 2px;\n}\n\n.color-usage-item {\n  font-size: 9px;\n  color: var(--text-secondary);\n  padding: 1px 0;\n}\n</style>\n</head>\n<body>\n  <div class=\"header\">\n    <div class=\"header-actions\">\n      <button id=\"spacing-toggle\" class=\"toggle-pill\">Show Spacing</button>\n    </div>\n    <div class=\"header-selects\">\n      <select id=\"code-platform\" class=\"format-select\" title=\"Code platform\">\n        <option value=\"css\">CSS</option>\n        <option value=\"ios\">iOS</option>\n        <option value=\"android\">Android</option>\n        <option value=\"flutter\">Flutter</option>\n      </select>\n      <select id=\"color-format\" class=\"format-select\" title=\"Color format\">\n        <option value=\"HEX\">HEX</option>\n        <option value=\"RGB\">RGB</option>\n        <option value=\"HSL\">HSL</option>\n        <option value=\"CSS var\">CSS var</option>\n      </select>\n    </div>\n  </div>\n\n  <div class=\"tabs\">\n    <button class=\"tab active\" data-tab=\"inspect\">Inspect</button>\n    <button class=\"tab\" data-tab=\"export\">Export</button>\n  </div>\n\n  <div id=\"inspect-panel\">\n    <div class=\"sub-tabs\">\n      <button class=\"sub-tab active\" data-view=\"list\">List</button>\n      <button class=\"sub-tab\" data-view=\"code\">Code</button>\n    </div>\n    <div class=\"content\" id=\"inspect-content\">\n      <div class=\"empty-state\" id=\"empty-state\">Select a layer to inspect</div>\n      <div id=\"inspect-data\" class=\"hidden\"></div>\n    </div>\n  </div>\n\n  <div id=\"export-panel\" class=\"hidden\">\n    <div class=\"sub-tabs\" id=\"export-sub-tabs\">\n      <button class=\"sub-tab active\" data-export-tab=\"filtered\">Icons & Images</button>\n      <button class=\"sub-tab\" data-export-tab=\"all\">All layers</button>\n    </div>\n    <div class=\"content export-section\" id=\"export-content\">\n      <div class=\"empty-state\">Select a layer to export</div>\n    </div>\n  </div>\n\n  <script>\"use strict\";\n(() => {\n  // src/utils/color-utils.ts\n  function rgbToHex(r, g, b) {\n    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, \"0\");\n    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();\n  }\n  function rgbToArgbInt(color, opacity = 1) {\n    const a = Math.round(opacity * 255);\n    const r = Math.round(color.r * 255);\n    const g = Math.round(color.g * 255);\n    const b = Math.round(color.b * 255);\n    return `0x${a.toString(16).padStart(2, \"0\")}${r.toString(16).padStart(2, \"0\")}${g.toString(16).padStart(2, \"0\")}${b.toString(16).padStart(2, \"0\")}`.toUpperCase();\n  }\n  function rgbToHsl(r, g, b) {\n    const max = Math.max(r, g, b);\n    const min = Math.min(r, g, b);\n    const l = (max + min) / 2;\n    if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;\n    const d = max - min;\n    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);\n    let h = 0;\n    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;\n    else if (max === g) h = ((b - r) / d + 2) / 6;\n    else h = ((r - g) / d + 4) / 6;\n    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;\n  }\n  function formatColor(color, opacity, format, variable) {\n    if (format === \"CSS var\" && variable) return `var(${variable.cssName})`;\n    const hex = rgbToHex(color.r, color.g, color.b);\n    if (format === \"HEX\") return opacity < 1 ? `${hex}${Math.round(opacity * 255).toString(16).padStart(2, \"0\")}` : hex;\n    if (format === \"RGB\") return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity.toFixed(2)})`;\n    return rgbToHsl(color.r, color.g, color.b);\n  }\n  function swiftColor(color, opacity = 1, variable) {\n    if (variable) return `Color(\"${variable.name}\")`;\n    const base = `Color(red: ${color.r.toFixed(3)}, green: ${color.g.toFixed(3)}, blue: ${color.b.toFixed(3)})`;\n    return opacity < 1 ? `${base}.opacity(${opacity.toFixed(2)})` : base;\n  }\n  function kotlinColor(color, opacity = 1, variable) {\n    if (variable) return `colorResource(R.color.${variable.name.replace(/\\//g, \"_\").replace(/\\s+/g, \"_\").toLowerCase()})`;\n    const argb = rgbToArgbInt(color, opacity);\n    return `Color(${argb})`;\n  }\n  function flutterColor(color, opacity = 1, variable) {\n    if (variable) return `AppColors.${variable.name.replace(/\\//g, \"\").replace(/\\s+/g, \"\")}`;\n    return `Color(${rgbToArgbInt(color, opacity)})`;\n  }\n  function tokenName(name) {\n    return name.replace(/\\//g, \"_\").replace(/\\s+/g, \"_\");\n  }\n\n  // src/utils/css-gen.ts\n  function rgbToHex2(r, g, b) {\n    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, \"0\");\n    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();\n  }\n  function rgbToHsl2(r, g, b) {\n    const max = Math.max(r, g, b);\n    const min = Math.min(r, g, b);\n    const l = (max + min) / 2;\n    if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;\n    const d = max - min;\n    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);\n    let h = 0;\n    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;\n    else if (max === g) h = ((b - r) / d + 2) / 6;\n    else h = ((r - g) / d + 4) / 6;\n    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;\n  }\n  function formatColor2(color, opacity, format, variable) {\n    if (format === \"CSS var\" && variable) return `var(${variable.cssName})`;\n    const hex = rgbToHex2(color.r, color.g, color.b);\n    if (format === \"HEX\") return opacity < 1 ? `${hex}${Math.round(opacity * 255).toString(16).padStart(2, \"0\")}` : hex;\n    if (format === \"RGB\") return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity.toFixed(2)})`;\n    return rgbToHsl2(color.r, color.g, color.b);\n  }\n  function serializePaintBackground(fill, format, variable) {\n    var _a2;\n    if (fill.visible === false) return null;\n    if (fill.type === \"SOLID\" && fill.color) {\n      return formatColor2(fill.color, (_a2 = fill.opacity) != null ? _a2 : 1, format, variable);\n    }\n    if (fill.type === \"GRADIENT_LINEAR\" && fill.gradientStops) {\n      const stops = fill.gradientStops.map((s) => {\n        const c = s.color;\n        const hex = rgbToHex2(c.r, c.g, c.b);\n        return `${hex} ${Math.round(s.position * 100)}%`;\n      }).join(\", \");\n      return `linear-gradient(180deg, ${stops})`;\n    }\n    if (fill.type === \"IMAGE\") return \"url(...)\";\n    return null;\n  }\n  function generateLayoutCSS(data) {\n    var _a2, _b, _c, _d, _e, _f;\n    const lines = [];\n    if (data.parentLayoutMode === \"NONE\" || !data.parentLayoutMode) {\n      if (data.x !== void 0 && data.y !== void 0) {\n        lines.push(\"position: absolute;\");\n        lines.push(`top: ${Math.round(data.y)}px;`);\n        lines.push(`left: ${Math.round(data.x)}px;`);\n      }\n    }\n    if (data.layoutMode === \"HORIZONTAL\") {\n      lines.push(\"display: flex;\");\n      lines.push(\"flex-direction: row;\");\n    } else if (data.layoutMode === \"VERTICAL\") {\n      lines.push(\"display: flex;\");\n      lines.push(\"flex-direction: column;\");\n    }\n    if (data.layoutAlign === \"STRETCH\") {\n      lines.push(\"width: 100%;\");\n    } else if (data.width) {\n      lines.push(`width: ${Math.round(data.width)}px;`);\n    }\n    if (data.height) {\n      lines.push(`height: ${Math.round(data.height)}px;`);\n    }\n    const pt = (_a2 = data.paddingTop) != null ? _a2 : 0;\n    const pr = (_b = data.paddingRight) != null ? _b : 0;\n    const pb = (_c = data.paddingBottom) != null ? _c : 0;\n    const pl = (_d = data.paddingLeft) != null ? _d : 0;\n    if (pt || pr || pb || pl) {\n      if (pt === pb && pl === pr) {\n        if (pt === pl) lines.push(`padding: ${pt}px;`);\n        else lines.push(`padding: ${pt}px ${pr}px;`);\n      } else {\n        lines.push(`padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);\n      }\n    }\n    const justifyMap2 = {\n      MIN: \"flex-start\",\n      CENTER: \"center\",\n      MAX: \"flex-end\",\n      SPACE_BETWEEN: \"space-between\"\n    };\n    const alignMap2 = {\n      MIN: \"flex-start\",\n      CENTER: \"center\",\n      MAX: \"flex-end\",\n      STRETCH: \"stretch\"\n    };\n    if (data.primaryAxisAlignItems && data.primaryAxisAlignItems !== \"MIN\") {\n      lines.push(`justify-content: ${(_e = justifyMap2[data.primaryAxisAlignItems]) != null ? _e : data.primaryAxisAlignItems.toLowerCase()};`);\n    }\n    if (data.counterAxisAlignItems && data.counterAxisAlignItems !== \"MIN\") {\n      lines.push(`align-items: ${(_f = alignMap2[data.counterAxisAlignItems]) != null ? _f : data.counterAxisAlignItems.toLowerCase()};`);\n    }\n    if (data.itemSpacing) {\n      lines.push(`gap: ${data.itemSpacing}px;`);\n    }\n    if (data.layoutWrap && data.layoutWrap !== \"NO_WRAP\") {\n      lines.push(\"flex-wrap: wrap;\");\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateStyleCSS(data, format = \"HEX\", variables = []) {\n    var _a2, _b, _c, _d, _e, _f, _g;\n    const lines = [];\n    const fillVar = variables.find((v) => v.name && data.boundVariables[\"fills\"]);\n    if (data.cornerRadius === \"MIXED\" && data.cornerRadii) {\n      const { tl, tr, br, bl } = data.cornerRadii;\n      lines.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`);\n    } else if (typeof data.cornerRadius === \"number\" && data.cornerRadius > 0) {\n      lines.push(`border-radius: ${data.cornerRadius}px;`);\n    }\n    const visibleFills = data.fills.filter((f) => f.visible !== false);\n    if (visibleFills.length === 1) {\n      const bg = serializePaintBackground(visibleFills[0], format, fillVar);\n      if (bg) lines.push(`background: ${bg};`);\n    } else if (visibleFills.length > 1) {\n      lines.push(\"background: /* multiple fills */;\");\n    }\n    const visibleStrokes = data.strokes.filter((s) => s.visible !== false);\n    if (visibleStrokes.length && data.strokeWeight) {\n      const stroke = visibleStrokes[0];\n      if (stroke.type === \"SOLID\" && stroke.color) {\n        const color = formatColor2(stroke.color, (_a2 = stroke.opacity) != null ? _a2 : 1, format);\n        lines.push(`border: ${data.strokeWeight}px solid ${color};`);\n      }\n    }\n    for (const effect of data.effects) {\n      if (effect.visible === false) continue;\n      if (effect.type === \"DROP_SHADOW\" && effect.offset && effect.color) {\n        const { r, g, b, a = 1 } = effect.color;\n        lines.push(\n          `box-shadow: ${effect.offset.x}px ${effect.offset.y}px ${(_b = effect.radius) != null ? _b : 0}px ${(_c = effect.spread) != null ? _c : 0}px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a});`\n        );\n      } else if (effect.type === \"INNER_SHADOW\" && effect.offset && effect.color) {\n        const { r, g, b, a = 1 } = effect.color;\n        lines.push(\n          `box-shadow: inset ${effect.offset.x}px ${effect.offset.y}px ${(_d = effect.radius) != null ? _d : 0}px ${(_e = effect.spread) != null ? _e : 0}px rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a});`\n        );\n      } else if (effect.type === \"LAYER_BLUR\") {\n        lines.push(`filter: blur(${(_f = effect.radius) != null ? _f : 0}px);`);\n      } else if (effect.type === \"BACKGROUND_BLUR\") {\n        lines.push(`backdrop-filter: blur(${(_g = effect.radius) != null ? _g : 0}px);`);\n      }\n    }\n    if (data.opacity !== void 0 && data.opacity < 1) {\n      lines.push(`opacity: ${data.opacity};`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateTypographyCSS(data) {\n    var _a2, _b;\n    if (data.type !== \"TEXT\") return \"\";\n    const lines = [];\n    if (data.fontFamily && data.fontFamily !== \"MIXED\") {\n      lines.push(`font-family: '${data.fontFamily}', sans-serif;`);\n    } else if (data.fontFamily === \"MIXED\") {\n      lines.push(\"font-family: /* Mixed */;\");\n    }\n    if (data.fontSize && data.fontSize !== \"MIXED\") {\n      lines.push(`font-size: ${data.fontSize}px;`);\n    }\n    if (data.fontWeight && data.fontWeight !== \"MIXED\") {\n      lines.push(`font-weight: ${data.fontWeight};`);\n    }\n    if (data.lineHeight && data.lineHeight !== \"MIXED\") {\n      const lh = data.lineHeight;\n      if (lh.unit === \"PIXELS\" && lh.value !== void 0) lines.push(`line-height: ${lh.value}px;`);\n      else if (lh.unit === \"PERCENT\" && lh.value !== void 0) lines.push(`line-height: ${lh.value}%;`);\n      else if (lh.unit === \"AUTO\") lines.push(\"line-height: normal;\");\n    }\n    if (data.letterSpacing && data.letterSpacing !== \"MIXED\") {\n      const ls = data.letterSpacing;\n      if (ls.unit === \"PIXELS\" && ls.value !== void 0) lines.push(`letter-spacing: ${ls.value}px;`);\n      else if (ls.unit === \"PERCENT\" && ls.value !== void 0) lines.push(`letter-spacing: ${ls.value / 100}em;`);\n    }\n    if (data.textAlignHorizontal && data.textAlignHorizontal !== \"MIXED\") {\n      const map = {\n        LEFT: \"left\",\n        CENTER: \"center\",\n        RIGHT: \"right\",\n        JUSTIFIED: \"justify\"\n      };\n      lines.push(`text-align: ${(_a2 = map[data.textAlignHorizontal]) != null ? _a2 : \"left\"};`);\n    }\n    if (data.textDecoration && data.textDecoration !== \"MIXED\") {\n      const map = {\n        NONE: \"none\",\n        UNDERLINE: \"underline\",\n        STRIKETHROUGH: \"line-through\"\n      };\n      lines.push(`text-decoration: ${(_b = map[data.textDecoration]) != null ? _b : \"none\"};`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateAllCSS(data, format = \"HEX\", variables = []) {\n    const parts = [\n      generateLayoutCSS(data),\n      generateStyleCSS(data, format, variables),\n      generateTypographyCSS(data)\n    ].filter(Boolean);\n    return parts.join(\"\\n\\n\");\n  }\n  function highlightCSS(css) {\n    return css.split(\"\\n\").map((line) => {\n      const match = line.match(/^(\\s*[\\w-]+)(\\s*:\\s*)(.+?)(;?)$/);\n      if (!match) return escapeHtml(line);\n      const [, prop, colon, value, semi] = match;\n      return `<span class=\"css-prop\">${escapeHtml(prop)}</span>${escapeHtml(colon)}<span class=\"css-val\">${escapeHtml(value)}</span>${escapeHtml(semi)}`;\n    }).join(\"\\n\");\n  }\n  function escapeHtml(s) {\n    return s.replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\");\n  }\n\n  // src/utils/platform-gen.ts\n  var justifyMap = {\n    MIN: \"start\",\n    CENTER: \"center\",\n    MAX: \"end\",\n    SPACE_BETWEEN: \"spaceBetween\"\n  };\n  var alignMap = {\n    MIN: \"start\",\n    CENTER: \"center\",\n    MAX: \"end\",\n    STRETCH: \"stretch\"\n  };\n  var textAlignMap = {\n    LEFT: \"leading\",\n    CENTER: \"center\",\n    RIGHT: \"trailing\",\n    JUSTIFIED: \"justified\"\n  };\n  function fillVariable(variables, data) {\n    return variables.find((v) => v.name && data.boundVariables[\"fills\"]);\n  }\n  function firstSolidFill(data) {\n    return data.fills.find((f) => f.visible !== false && f.type === \"SOLID\" && f.color);\n  }\n  function firstSolidStroke(data) {\n    return data.strokes.find((s) => s.visible !== false && s.type === \"SOLID\" && s.color);\n  }\n  function generateIosLayout(data) {\n    var _a2, _b, _c, _d, _e, _f, _g, _h, _i;\n    const lines = [];\n    if (data.parentLayoutMode === \"NONE\" || !data.parentLayoutMode) {\n      if (data.x !== void 0 && data.y !== void 0) {\n        lines.push(`.offset(x: ${Math.round(data.x)}, y: ${Math.round(data.y)})`);\n      }\n    }\n    if (data.layoutAlign === \"STRETCH\") {\n      lines.push(\".frame(maxWidth: .infinity)\");\n    } else if (data.width || data.height) {\n      const w = data.width ? `width: ${Math.round(data.width)}` : \"\";\n      const h = data.height ? `height: ${Math.round(data.height)}` : \"\";\n      const parts = [w, h].filter(Boolean).join(\", \");\n      if (parts) lines.push(`.frame(${parts})`);\n    }\n    const pt = (_a2 = data.paddingTop) != null ? _a2 : 0;\n    const pr = (_b = data.paddingRight) != null ? _b : 0;\n    const pb = (_c = data.paddingBottom) != null ? _c : 0;\n    const pl = (_d = data.paddingLeft) != null ? _d : 0;\n    if (pt || pr || pb || pl) {\n      if (pt === pb && pl === pr) {\n        if (pt === pl) lines.push(`.padding(${pt})`);\n        else lines.push(`.padding(.vertical, ${pt}).padding(.horizontal, ${pr})`);\n      } else {\n        lines.push(`.padding(EdgeInsets(top: ${pt}, leading: ${pl}, bottom: ${pb}, trailing: ${pr}))`);\n      }\n    }\n    if (data.layoutMode === \"HORIZONTAL\") {\n      const spacing = data.itemSpacing ? `, spacing: ${data.itemSpacing}` : \"\";\n      lines.push(`HStack(alignment: .${(_f = alignMap[(_e = data.counterAxisAlignItems) != null ? _e : \"MIN\"]) != null ? _f : \"top\"}${spacing}) { }`);\n    } else if (data.layoutMode === \"VERTICAL\") {\n      const spacing = data.itemSpacing ? `, spacing: ${data.itemSpacing}` : \"\";\n      lines.push(`VStack(alignment: .${(_h = alignMap[(_g = data.counterAxisAlignItems) != null ? _g : \"MIN\"]) != null ? _h : \"leading\"}${spacing}) { }`);\n    } else if (data.itemSpacing) {\n      lines.push(`// spacing: ${data.itemSpacing}`);\n    }\n    if (data.primaryAxisAlignItems && data.primaryAxisAlignItems !== \"MIN\") {\n      lines.push(`// main alignment: ${(_i = justifyMap[data.primaryAxisAlignItems]) != null ? _i : data.primaryAxisAlignItems}`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateIosStyle(data, variables) {\n    var _a2, _b, _c, _d;\n    const lines = [];\n    const fillVar = fillVariable(variables, data);\n    const fill = firstSolidFill(data);\n    if (typeof data.cornerRadius === \"number\" && data.cornerRadius > 0) {\n      lines.push(`.cornerRadius(${data.cornerRadius})`);\n    } else if (data.cornerRadius === \"MIXED\" && data.cornerRadii) {\n      const { tl, tr, br, bl } = data.cornerRadii;\n      lines.push(`.clipShape(UnevenRoundedRectangle(topLeadingRadius: ${tl}, bottomLeadingRadius: ${bl}, bottomTrailingRadius: ${br}, topTrailingRadius: ${tr}))`);\n    }\n    if (fill == null ? void 0 : fill.color) {\n      lines.push(`.background(${swiftColor(fill.color, (_a2 = fill.opacity) != null ? _a2 : 1, fillVar)})`);\n    }\n    const stroke = firstSolidStroke(data);\n    if ((stroke == null ? void 0 : stroke.color) && data.strokeWeight) {\n      const radius = typeof data.cornerRadius === \"number\" ? data.cornerRadius : 0;\n      lines.push(`.overlay(`);\n      lines.push(`  RoundedRectangle(cornerRadius: ${radius})`);\n      lines.push(`    .stroke(${swiftColor(stroke.color, (_b = stroke.opacity) != null ? _b : 1)}, lineWidth: ${data.strokeWeight})`);\n      lines.push(`)`);\n    }\n    for (const effect of data.effects) {\n      if (effect.visible === false) continue;\n      if (effect.type === \"DROP_SHADOW\" && effect.offset && effect.color) {\n        const c = effect.color;\n        lines.push(`.shadow(color: ${swiftColor(c, (_c = c.a) != null ? _c : 1)}, radius: ${(_d = effect.radius) != null ? _d : 0}, x: ${effect.offset.x}, y: ${effect.offset.y})`);\n      }\n    }\n    if (data.opacity !== void 0 && data.opacity < 1) {\n      lines.push(`.opacity(${data.opacity})`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateIosTypography(data) {\n    var _a2, _b;\n    if (data.type !== \"TEXT\") return \"\";\n    const lines = [];\n    if (data.fontFamily && data.fontFamily !== \"MIXED\" && data.fontSize && data.fontSize !== \"MIXED\") {\n      lines.push(`.font(.custom(\"${data.fontFamily}\", size: ${data.fontSize}))`);\n    } else if (data.fontSize && data.fontSize !== \"MIXED\") {\n      const weight = data.fontWeight && data.fontWeight !== \"MIXED\" ? `.weight(.${iosWeight(data.fontWeight)})` : \"\";\n      lines.push(`.font(.system(size: ${data.fontSize}${weight}))`);\n    }\n    if (data.letterSpacing && data.letterSpacing !== \"MIXED\" && data.letterSpacing.unit === \"PIXELS\") {\n      lines.push(`.tracking(${(_a2 = data.letterSpacing.value) != null ? _a2 : 0})`);\n    }\n    if (data.textAlignHorizontal && data.textAlignHorizontal !== \"MIXED\") {\n      lines.push(`.multilineTextAlignment(.${(_b = textAlignMap[data.textAlignHorizontal]) != null ? _b : \"leading\"})`);\n    }\n    if (data.textDecoration === \"UNDERLINE\") lines.push(\".underline()\");\n    if (data.textDecoration === \"STRIKETHROUGH\") lines.push(\".strikethrough()\");\n    return lines.join(\"\\n\");\n  }\n  function iosWeight(weight) {\n    if (weight >= 700) return \"bold\";\n    if (weight >= 500) return \"medium\";\n    if (weight >= 300) return \"light\";\n    return \"regular\";\n  }\n  function generateAndroidLayout(data) {\n    var _a2, _b, _c, _d, _e;\n    const lines = [\"Modifier\"];\n    if (data.layoutAlign === \"STRETCH\") {\n      lines.push(\"    .fillMaxWidth()\");\n    } else if (data.width) {\n      lines.push(`    .width(${Math.round(data.width)}.dp)`);\n    }\n    if (data.height) {\n      lines.push(`    .height(${Math.round(data.height)}.dp)`);\n    }\n    if (data.x !== void 0 && data.y !== void 0 && (data.parentLayoutMode === \"NONE\" || !data.parentLayoutMode)) {\n      lines.push(`    .offset(x = ${Math.round(data.x)}.dp, y = ${Math.round(data.y)}.dp)`);\n    }\n    const pt = (_a2 = data.paddingTop) != null ? _a2 : 0;\n    const pr = (_b = data.paddingRight) != null ? _b : 0;\n    const pb = (_c = data.paddingBottom) != null ? _c : 0;\n    const pl = (_d = data.paddingLeft) != null ? _d : 0;\n    if (pt || pr || pb || pl) {\n      lines.push(`    .padding(top = ${pt}.dp, start = ${pl}.dp, bottom = ${pb}.dp, end = ${pr}.dp)`);\n    }\n    if (data.layoutMode === \"HORIZONTAL\") {\n      const spacing = data.itemSpacing ? ` spacedBy(${data.itemSpacing}.dp)` : \"\";\n      lines.push(`// Row(horizontalArrangement = Arrangement.${androidJustify(data.primaryAxisAlignItems)}${spacing})`);\n    } else if (data.layoutMode === \"VERTICAL\") {\n      const spacing = data.itemSpacing ? ` spacedBy(${data.itemSpacing}.dp)` : \"\";\n      lines.push(`// Column(verticalArrangement = Arrangement.${androidJustify(data.primaryAxisAlignItems)}${spacing})`);\n    } else if (data.itemSpacing) {\n      lines.push(`// spacing: ${data.itemSpacing}.dp`);\n    }\n    if (data.counterAxisAlignItems && data.counterAxisAlignItems !== \"MIN\") {\n      lines.push(`// cross alignment: ${(_e = alignMap[data.counterAxisAlignItems]) != null ? _e : data.counterAxisAlignItems}`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function androidJustify(value) {\n    var _a2;\n    const map = {\n      MIN: \"Start\",\n      CENTER: \"Center\",\n      MAX: \"End\",\n      SPACE_BETWEEN: \"SpaceBetween\"\n    };\n    return (_a2 = map[value != null ? value : \"MIN\"]) != null ? _a2 : \"Start\";\n  }\n  function generateAndroidStyle(data, variables) {\n    var _a2, _b, _c;\n    const lines = [\"Modifier\"];\n    const fillVar = fillVariable(variables, data);\n    const fill = firstSolidFill(data);\n    if (fill == null ? void 0 : fill.color) {\n      lines.push(`    .background(${kotlinColor(fill.color, (_a2 = fill.opacity) != null ? _a2 : 1, fillVar)})`);\n    }\n    if (typeof data.cornerRadius === \"number\" && data.cornerRadius > 0) {\n      lines.push(`    .clip(RoundedCornerShape(${data.cornerRadius}.dp))`);\n    } else if (data.cornerRadius === \"MIXED\" && data.cornerRadii) {\n      const { tl, tr, br, bl } = data.cornerRadii;\n      lines.push(`    .clip(RoundedCornerShape(topStart = ${tl}.dp, topEnd = ${tr}.dp, bottomEnd = ${br}.dp, bottomStart = ${bl}.dp))`);\n    }\n    const stroke = firstSolidStroke(data);\n    if ((stroke == null ? void 0 : stroke.color) && data.strokeWeight) {\n      const radius = typeof data.cornerRadius === \"number\" ? data.cornerRadius : 0;\n      lines.push(`    .border(${data.strokeWeight}.dp, ${kotlinColor(stroke.color, (_b = stroke.opacity) != null ? _b : 1)}, RoundedCornerShape(${radius}.dp))`);\n    }\n    for (const effect of data.effects) {\n      if (effect.visible === false || effect.type !== \"DROP_SHADOW\") continue;\n      lines.push(`    .shadow(elevation = ${(_c = effect.radius) != null ? _c : 4}.dp)`);\n      break;\n    }\n    if (data.opacity !== void 0 && data.opacity < 1) {\n      lines.push(`    .alpha(${data.opacity}f)`);\n    }\n    return lines.join(\"\\n\");\n  }\n  function generateAndroidTypography(data) {\n    var _a2;\n    if (data.type !== \"TEXT\") return \"\";\n    const lines = [\"Text(\"];\n    lines.push('    text = \"...\",');\n    if (data.fontSize && data.fontSize !== \"MIXED\") {\n      lines.push(`    fontSize = ${data.fontSize}.sp,`);\n    }\n    if (data.fontWeight && data.fontWeight !== \"MIXED\") {\n      lines.push(`    fontWeight = FontWeight(${androidWeight(data.fontWeight)}),`);\n    }\n    if (data.fontFamily && data.fontFamily !== \"MIXED\") {\n      lines.push(`    fontFamily = FontFamily(Font(R.font.${tokenName(data.fontFamily).toLowerCase()})),`);\n    }\n    if (data.letterSpacing && data.letterSpacing !== \"MIXED\" && data.letterSpacing.unit === \"PIXELS\") {\n      lines.push(`    letterSpacing = ${(_a2 = data.letterSpacing.value) != null ? _a2 : 0}.sp,`);\n    }\n    if (data.textAlignHorizontal && data.textAlignHorizontal !== \"MIXED\") {\n      lines.push(`    textAlign = TextAlign.${androidTextAlign(data.textAlignHorizontal)},`);\n    }\n    if (data.textDecoration === \"UNDERLINE\") lines.push(\"    textDecoration = TextDecoration.Underline,\");\n    if (data.textDecoration === \"STRIKETHROUGH\") lines.push(\"    textDecoration = TextDecoration.LineThrough,\");\n    lines.push(\")\");\n    return lines.join(\"\\n\");\n  }\n  function androidWeight(weight) {\n    if (weight >= 700) return \"Bold\";\n    if (weight >= 500) return \"Medium\";\n    if (weight >= 300) return \"Light\";\n    return \"Normal\";\n  }\n  function androidTextAlign(value) {\n    var _a2;\n    const map = {\n      LEFT: \"Start\",\n      CENTER: \"Center\",\n      RIGHT: \"End\",\n      JUSTIFIED: \"Justify\"\n    };\n    return (_a2 = map[value]) != null ? _a2 : \"Start\";\n  }\n  function generateFlutterLayout(data) {\n    var _a2, _b, _c, _d;\n    const lines = [];\n    if (data.layoutMode === \"HORIZONTAL\") {\n      lines.push(\"Row(\");\n      lines.push(`  mainAxisAlignment: MainAxisAlignment.${flutterJustify(data.primaryAxisAlignItems)},`);\n      lines.push(`  crossAxisAlignment: CrossAxisAlignment.${flutterAlign(data.counterAxisAlignItems)},`);\n      if (data.itemSpacing) lines.push(`  spacing: ${data.itemSpacing},`);\n      lines.push(\"  children: [\");\n      lines.push(\"    // ...\");\n      lines.push(\"  ],\");\n      lines.push(\")\");\n      return lines.join(\"\\n\");\n    }\n    if (data.layoutMode === \"VERTICAL\") {\n      lines.push(\"Column(\");\n      lines.push(`  mainAxisAlignment: MainAxisAlignment.${flutterJustify(data.primaryAxisAlignItems)},`);\n      lines.push(`  crossAxisAlignment: CrossAxisAlignment.${flutterAlign(data.counterAxisAlignItems)},`);\n      if (data.itemSpacing) lines.push(`  spacing: ${data.itemSpacing},`);\n      lines.push(\"  children: [\");\n      lines.push(\"    // ...\");\n      lines.push(\"  ],\");\n      lines.push(\")\");\n      return lines.join(\"\\n\");\n    }\n    lines.push(\"Container(\");\n    if (data.width) lines.push(`  width: ${Math.round(data.width)},`);\n    if (data.height) lines.push(`  height: ${Math.round(data.height)},`);\n    const pt = (_a2 = data.paddingTop) != null ? _a2 : 0;\n    const pr = (_b = data.paddingRight) != null ? _b : 0;\n    const pb = (_c = data.paddingBottom) != null ? _c : 0;\n    const pl = (_d = data.paddingLeft) != null ? _d : 0;\n    if (pt || pr || pb || pl) {\n      lines.push(`  padding: EdgeInsets.fromLTRB(${pl}, ${pt}, ${pr}, ${pb}),`);\n    }\n    if (data.x !== void 0 && data.y !== void 0 && (data.parentLayoutMode === \"NONE\" || !data.parentLayoutMode)) {\n      lines.push(\"  // Position in Stack:\");\n      lines.push(`  // left: ${Math.round(data.x)}, top: ${Math.round(data.y)},`);\n    }\n    lines.push(\"  child: ...,\");\n    lines.push(\")\");\n    return lines.join(\"\\n\");\n  }\n  function flutterJustify(value) {\n    var _a2;\n    const map = {\n      MIN: \"start\",\n      CENTER: \"center\",\n      MAX: \"end\",\n      SPACE_BETWEEN: \"spaceBetween\"\n    };\n    return (_a2 = map[value != null ? value : \"MIN\"]) != null ? _a2 : \"start\";\n  }\n  function flutterAlign(value) {\n    var _a2;\n    const map = {\n      MIN: \"start\",\n      CENTER: \"center\",\n      MAX: \"end\",\n      STRETCH: \"stretch\"\n    };\n    return (_a2 = map[value != null ? value : \"MIN\"]) != null ? _a2 : \"start\";\n  }\n  function generateFlutterStyle(data, variables) {\n    var _a2, _b, _c, _d, _e, _f, _g, _h;\n    const lines = [\"Container(\"];\n    const fillVar = fillVariable(variables, data);\n    const fill = firstSolidFill(data);\n    const hasDecoration = !!((fill == null ? void 0 : fill.color) || data.cornerRadius || firstSolidStroke(data) || data.effects.some((e) => e.visible !== false && e.type === \"DROP_SHADOW\"));\n    if (data.width) lines.push(`  width: ${Math.round(data.width)},`);\n    if (data.height) lines.push(`  height: ${Math.round(data.height)},`);\n    const pt = (_a2 = data.paddingTop) != null ? _a2 : 0;\n    const pr = (_b = data.paddingRight) != null ? _b : 0;\n    const pb = (_c = data.paddingBottom) != null ? _c : 0;\n    const pl = (_d = data.paddingLeft) != null ? _d : 0;\n    if (pt || pr || pb || pl) {\n      lines.push(`  padding: EdgeInsets.fromLTRB(${pl}, ${pt}, ${pr}, ${pb}),`);\n    }\n    if (hasDecoration) {\n      lines.push(\"  decoration: BoxDecoration(\");\n      if (fill == null ? void 0 : fill.color) {\n        lines.push(`    color: ${flutterColor(fill.color, (_e = fill.opacity) != null ? _e : 1, fillVar)},`);\n      }\n      if (typeof data.cornerRadius === \"number\" && data.cornerRadius > 0) {\n        lines.push(`    borderRadius: BorderRadius.circular(${data.cornerRadius}),`);\n      } else if (data.cornerRadius === \"MIXED\" && data.cornerRadii) {\n        const { tl, tr, br, bl } = data.cornerRadii;\n        lines.push(`    borderRadius: BorderRadius.only(`);\n        lines.push(`      topLeft: Radius.circular(${tl}),`);\n        lines.push(`      topRight: Radius.circular(${tr}),`);\n        lines.push(`      bottomRight: Radius.circular(${br}),`);\n        lines.push(`      bottomLeft: Radius.circular(${bl}),`);\n        lines.push(\"    ),\");\n      }\n      const stroke = firstSolidStroke(data);\n      if ((stroke == null ? void 0 : stroke.color) && data.strokeWeight) {\n        lines.push(`    border: Border.all(`);\n        lines.push(`      color: ${flutterColor(stroke.color, (_f = stroke.opacity) != null ? _f : 1)},`);\n        lines.push(`      width: ${data.strokeWeight},`);\n        lines.push(\"    ),\");\n      }\n      const shadow = data.effects.find((e) => e.visible !== false && e.type === \"DROP_SHADOW\" && e.offset && e.color);\n      if ((shadow == null ? void 0 : shadow.offset) && shadow.color) {\n        const c = shadow.color;\n        lines.push(\"    boxShadow: [\");\n        lines.push(\"      BoxShadow(\");\n        lines.push(`        color: ${flutterColor(c, (_g = c.a) != null ? _g : 1)},`);\n        lines.push(`        blurRadius: ${(_h = shadow.radius) != null ? _h : 0},`);\n        lines.push(`        offset: Offset(${shadow.offset.x}, ${shadow.offset.y}),`);\n        lines.push(\"      ),\");\n        lines.push(\"    ],\");\n      }\n      lines.push(\"  ),\");\n    }\n    if (data.opacity !== void 0 && data.opacity < 1) {\n      lines.push(`  // opacity: ${data.opacity} \\u2014 wrap with Opacity(opacity: ${data.opacity}, child: ...)`);\n    }\n    lines.push(\"  child: ...,\");\n    lines.push(\")\");\n    return lines.join(\"\\n\");\n  }\n  function generateFlutterTypography(data) {\n    var _a2, _b;\n    if (data.type !== \"TEXT\") return \"\";\n    const lines = [\"Text(\"];\n    lines.push(\"  '...',\");\n    lines.push(\"  style: TextStyle(\");\n    if (data.fontFamily && data.fontFamily !== \"MIXED\") {\n      lines.push(`    fontFamily: '${data.fontFamily}',`);\n    }\n    if (data.fontSize && data.fontSize !== \"MIXED\") {\n      lines.push(`    fontSize: ${data.fontSize},`);\n    }\n    if (data.fontWeight && data.fontWeight !== \"MIXED\") {\n      lines.push(`    fontWeight: FontWeight.w${data.fontWeight},`);\n    }\n    if (data.lineHeight && data.lineHeight !== \"MIXED\" && data.lineHeight.unit === \"PIXELS\" && data.fontSize && data.fontSize !== \"MIXED\") {\n      const height = ((_a2 = data.lineHeight.value) != null ? _a2 : data.fontSize) / data.fontSize;\n      lines.push(`    height: ${height.toFixed(2)},`);\n    }\n    if (data.letterSpacing && data.letterSpacing !== \"MIXED\" && data.letterSpacing.unit === \"PIXELS\") {\n      lines.push(`    letterSpacing: ${(_b = data.letterSpacing.value) != null ? _b : 0},`);\n    }\n    if (data.textDecoration === \"UNDERLINE\") lines.push(\"    decoration: TextDecoration.underline,\");\n    if (data.textDecoration === \"STRIKETHROUGH\") lines.push(\"    decoration: TextDecoration.lineThrough,\");\n    lines.push(\"  ),\");\n    if (data.textAlignHorizontal && data.textAlignHorizontal !== \"MIXED\") {\n      lines.push(`  textAlign: TextAlign.${flutterTextAlign(data.textAlignHorizontal)},`);\n    }\n    lines.push(\")\");\n    return lines.join(\"\\n\");\n  }\n  function flutterTextAlign(value) {\n    var _a2;\n    const map = {\n      LEFT: \"left\",\n      CENTER: \"center\",\n      RIGHT: \"right\",\n      JUSTIFIED: \"justify\"\n    };\n    return (_a2 = map[value]) != null ? _a2 : \"left\";\n  }\n  function generateLayoutCode(platform, data, _ctx) {\n    if (platform === \"css\") return generateLayoutCSS(data);\n    if (platform === \"ios\") return generateIosLayout(data);\n    if (platform === \"android\") return generateAndroidLayout(data);\n    return generateFlutterLayout(data);\n  }\n  function generateStyleCode(platform, data, ctx) {\n    if (platform === \"css\") return generateStyleCSS(data, ctx.colorFormat, ctx.variables);\n    if (platform === \"ios\") return generateIosStyle(data, ctx.variables);\n    if (platform === \"android\") return generateAndroidStyle(data, ctx.variables);\n    return generateFlutterStyle(data, ctx.variables);\n  }\n  function generateTypographyCode(platform, data, _ctx) {\n    if (platform === \"css\") return generateTypographyCSS(data);\n    if (platform === \"ios\") return generateIosTypography(data);\n    if (platform === \"android\") return generateAndroidTypography(data);\n    return generateFlutterTypography(data);\n  }\n  function generateAllCode(platform, data, ctx) {\n    if (platform === \"css\") return generateAllCSS(data, ctx.colorFormat, ctx.variables);\n    const parts = [\n      generateLayoutCode(platform, data, ctx),\n      generateStyleCode(platform, data, ctx),\n      generateTypographyCode(platform, data, ctx)\n    ].filter(Boolean);\n    return parts.join(\"\\n\\n\");\n  }\n  function generateVariablesCode(platform, variables, colorFormat2) {\n    if (!variables.length) return \"\";\n    return variables.map((v) => {\n      const val = formatVariableValue(platform, v, colorFormat2);\n      if (platform === \"ios\") return `// ${v.collection}/${v.name}\nlet ${tokenName(v.name)} = ${val}`;\n      if (platform === \"android\") return `// ${v.collection}/${v.name}\nval ${tokenName(v.name)} = ${val}`;\n      if (platform === \"flutter\") return `// ${v.collection}/${v.name}\nconst ${tokenName(v.name)} = ${val};`;\n      return `${v.cssName}: ${val};`;\n    }).join(\"\\n\");\n  }\n  function generateColorsCode(platform, colors, colorFormat2) {\n    if (!colors.length) return \"\";\n    return colors.map((c) => {\n      const rgb = hexToRgb(c.hex);\n      if (!rgb) return `${c.hex}`;\n      if (platform === \"ios\") {\n        const label2 = c.variable ? `// ${c.variable.name}\n` : \"\";\n        return `${label2}${swiftColor(rgb, 1, c.variable)}`;\n      }\n      if (platform === \"android\") return kotlinColor(rgb, 1, c.variable);\n      if (platform === \"flutter\") return flutterColor(rgb, 1, c.variable);\n      const label = c.variable ? c.variable.cssName : c.hex;\n      const display = colorFormat2 === \"RGB\" ? c.rgba : c.hex;\n      return `${label}: ${display};`;\n    }).join(\"\\n\");\n  }\n  function formatVariableValue(platform, v, colorFormat2) {\n    if (v.resolvedType === \"COLOR\" && v.value && typeof v.value === \"object\" && \"r\" in v.value) {\n      const c = v.value;\n      if (platform === \"ios\") return swiftColor(c, 1, v);\n      if (platform === \"android\") return kotlinColor(c, 1, v);\n      if (platform === \"flutter\") return flutterColor(c, 1, v);\n      return formatColor(c, 1, colorFormat2, v);\n    }\n    if (v.resolvedType === \"FLOAT\") {\n      const n = Number(v.value);\n      if (platform === \"android\") return `${n}.dp`;\n      if (platform === \"flutter\") return `${n}`;\n      return String(v.value);\n    }\n    if (v.resolvedType === \"BOOLEAN\") return String(v.value);\n    if (v.resolvedType === \"STRING\") return platform === \"ios\" ? `\"${v.value}\"` : `\"${v.value}\"`;\n    return \"\\u2014\";\n  }\n  function hexToRgb(hex) {\n    const m = hex.replace(\"#\", \"\").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);\n    if (!m) return null;\n    return {\n      r: parseInt(m[1], 16) / 255,\n      g: parseInt(m[2], 16) / 255,\n      b: parseInt(m[3], 16) / 255\n    };\n  }\n  function highlightCode(platform, code) {\n    if (platform === \"css\") return highlightCSS(code);\n    return code.split(\"\\n\").map((line) => {\n      const comment = line.match(/^(\\s*)(\\/\\/.*)$/);\n      if (comment) return `${escapeHtml2(comment[1])}<span class=\"css-prop\">${escapeHtml2(comment[2])}</span>`;\n      const swiftMod = line.match(/^(\\s*)(\\.\\w+\\(.*)$/);\n      if (swiftMod && platform === \"ios\") {\n        return `${escapeHtml2(swiftMod[1])}<span class=\"css-val\">${escapeHtml2(swiftMod[2])}</span>`;\n      }\n      const keyVal = line.match(/^(\\s*)([\\w.]+)(\\s*[:=]\\s*)(.+)$/);\n      if (keyVal) {\n        const [, indent, key, sep, value] = keyVal;\n        return `${escapeHtml2(indent)}<span class=\"css-prop\">${escapeHtml2(key)}</span>${escapeHtml2(sep)}<span class=\"css-val\">${escapeHtml2(value)}</span>`;\n      }\n      return escapeHtml2(line);\n    }).join(\"\\n\");\n  }\n  function escapeHtml2(s) {\n    return s.replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\");\n  }\n\n  // src/ui.ts\n  var currentData = null;\n  var currentVariables = [];\n  var currentColors = [];\n  var viewMode = \"list\";\n  var codePlatform = \"css\";\n  var colorFormat = \"HEX\";\n  var spacingEnabled = false;\n  var exportTab = \"filtered\";\n  var collapsedSections = /* @__PURE__ */ new Set();\n  var emptyState = document.getElementById(\"empty-state\");\n  var inspectDataEl = document.getElementById(\"inspect-data\");\n  var exportContent = document.getElementById(\"export-content\");\n  var spacingToggle = document.getElementById(\"spacing-toggle\");\n  var codePlatformSelect = document.getElementById(\"code-platform\");\n  var colorFormatSelect = document.getElementById(\"color-format\");\n  document.querySelectorAll(\".tab\").forEach((tab) => {\n    tab.addEventListener(\"click\", () => {\n      document.querySelectorAll(\".tab\").forEach((t) => t.classList.remove(\"active\"));\n      tab.classList.add(\"active\");\n      const name = tab.getAttribute(\"data-tab\");\n      document.getElementById(\"inspect-panel\").classList.toggle(\"hidden\", name !== \"inspect\");\n      document.getElementById(\"export-panel\").classList.toggle(\"hidden\", name !== \"export\");\n    });\n  });\n  document.querySelectorAll(\".sub-tab\").forEach((tab) => {\n    tab.addEventListener(\"click\", () => {\n      document.querySelectorAll(\".sub-tab\").forEach((t) => t.classList.remove(\"active\"));\n      tab.classList.add(\"active\");\n      viewMode = tab.getAttribute(\"data-view\");\n      render();\n    });\n  });\n  spacingToggle.addEventListener(\"click\", () => {\n    spacingEnabled = !spacingEnabled;\n    spacingToggle.classList.toggle(\"active\", spacingEnabled);\n    parent.postMessage({ pluginMessage: { type: \"TOGGLE_SPACING\", enabled: spacingEnabled } }, \"*\");\n  });\n  colorFormatSelect.addEventListener(\"change\", () => {\n    colorFormat = colorFormatSelect.value;\n    render();\n  });\n  codePlatformSelect.addEventListener(\"change\", () => {\n    codePlatform = codePlatformSelect.value;\n    syncColorFormatOptions();\n    render();\n  });\n  function syncColorFormatOptions() {\n    const cssVarOption = colorFormatSelect.querySelector('option[value=\"CSS var\"]');\n    const hslOption = colorFormatSelect.querySelector('option[value=\"HSL\"]');\n    const isCss = codePlatform === \"css\";\n    if (cssVarOption) cssVarOption.hidden = !isCss;\n    if (hslOption) hslOption.hidden = !isCss;\n    colorFormatSelect.style.display = isCss ? \"\" : \"none\";\n    if (!isCss && (colorFormat === \"CSS var\" || colorFormat === \"HSL\")) {\n      colorFormat = \"HEX\";\n      colorFormatSelect.value = \"HEX\";\n    }\n  }\n  syncColorFormatOptions();\n  var _a;\n  (_a = document.getElementById(\"export-sub-tabs\")) == null ? void 0 : _a.addEventListener(\"click\", (e) => {\n    const btn = e.target.closest(\"[data-export-tab]\");\n    if (!btn) return;\n    exportTab = btn.getAttribute(\"data-export-tab\");\n    document.querySelectorAll(\"#export-sub-tabs .sub-tab\").forEach((t) => t.classList.remove(\"active\"));\n    btn.classList.add(\"active\");\n    renderExport();\n  });\n  function showCopied(btn) {\n    const orig = btn.textContent;\n    btn.textContent = \"\\u2713\";\n    btn.classList.add(\"copied\");\n    setTimeout(() => {\n      btn.textContent = orig;\n      btn.classList.remove(\"copied\");\n    }, 1500);\n  }\n  async function copyText(text, btn) {\n    try {\n      await navigator.clipboard.writeText(text);\n      if (btn) showCopied(btn);\n    } catch (e) {\n      const ta = document.createElement(\"textarea\");\n      ta.value = text;\n      document.body.appendChild(ta);\n      ta.select();\n      document.execCommand(\"copy\");\n      document.body.removeChild(ta);\n      if (btn) showCopied(btn);\n    }\n  }\n  function formatVariableDisplay(v) {\n    return formatVariableValue(codePlatform, v, colorFormat);\n  }\n  function codeContext() {\n    return { colorFormat, variables: currentVariables };\n  }\n  function renderSection(id, title, code, listHtml, codeFallbackToList = false) {\n    const collapsed = collapsedSections.has(id);\n    if (viewMode === \"code\") {\n      const highlighted = highlightCode(codePlatform, code);\n      const showListInCode = codeFallbackToList && !code.trim() && listHtml;\n      const bodyContent = highlighted ? `<div class=\"code-block\"><pre>${highlighted}</pre></div>` : showListInCode ? listHtml : '<span style=\"color:var(--text-secondary)\">\\u2014</span>';\n      return `\n      <div class=\"section ${collapsed ? \"collapsed\" : \"\"}\" data-section=\"${id}\">\n        <div class=\"section-header\">\n          <span class=\"section-title\">${title}</span>\n          <div class=\"section-actions\">\n            <button class=\"icon-btn copy-section\" data-section=\"${id}\" title=\"Copy code\">\\u2398</button>\n            <button class=\"icon-btn collapse-btn\" data-section=\"${id}\">${collapsed ? \"\\u25B8\" : \"\\u25BE\"}</button>\n          </div>\n        </div>\n        <div class=\"section-body\">${bodyContent}</div>\n      </div>`;\n    }\n    return `\n    <div class=\"section ${collapsed ? \"collapsed\" : \"\"}\" data-section=\"${id}\">\n      <div class=\"section-header\">\n        <span class=\"section-title\">${title}</span>\n        <div class=\"section-actions\">\n          <button class=\"icon-btn copy-section\" data-section=\"${id}\" title=\"Copy code\">\\u2398</button>\n          <button class=\"icon-btn collapse-btn\" data-section=\"${id}\">${collapsed ? \"\\u25B8\" : \"\\u25BE\"}</button>\n        </div>\n      </div>\n      <div class=\"section-body\">${listHtml || '<span style=\"color:var(--text-secondary)\">\\u2014</span>'}</div>\n    </div>`;\n  }\n  function attrEscape(s) {\n    return s.replace(/&/g, \"&amp;\").replace(/\"/g, \"&quot;\").replace(/</g, \"&lt;\");\n  }\n  function codeToRows(code) {\n    if (!code.trim()) return \"\";\n    return code.split(\"\\n\").filter(Boolean).map((line) => {\n      const trimmed = line.trim();\n      return `<div class=\"prop-row\">\n        <span class=\"prop-name\"></span>\n        <span class=\"prop-value mono\">${escapeHtml3(trimmed)}</span>\n        <button class=\"icon-btn copy-prop\" data-copy=\"${attrEscape(trimmed)}\" title=\"Copy\">\\u2398</button>\n      </div>`;\n    }).join(\"\");\n  }\n  function cssToRows(css) {\n    if (!css.trim()) return \"\";\n    return css.split(\"\\n\").filter(Boolean).map((line) => {\n      const trimmed = line.trim();\n      const [prop, ...rest] = trimmed.replace(/;$/, \"\").split(\":\");\n      if (!prop || !rest.length) return \"\";\n      const value = rest.join(\":\").trim();\n      const copyVal = `${prop.trim()}: ${value};`;\n      return `<div class=\"prop-row\">\n        <span class=\"prop-name\">${escapeHtml3(prop.trim())}</span>\n        <span class=\"prop-value\">${escapeHtml3(value)}</span>\n        <button class=\"icon-btn copy-prop\" data-copy=\"${attrEscape(copyVal)}\" title=\"Copy\">\\u2398</button>\n      </div>`;\n    }).join(\"\");\n  }\n  function codeToListRows(code) {\n    return codePlatform === \"css\" ? cssToRows(code) : codeToRows(code);\n  }\n  function dashVal(n) {\n    return n > 0 ? String(Math.round(n)) : \"\\u2014\";\n  }\n  function renderBoxModel(bm) {\n    const collapsed = collapsedSections.has(\"boxmodel\");\n    return `\n    <div class=\"section ${collapsed ? \"collapsed\" : \"\"}\" data-section=\"boxmodel\">\n      <div class=\"section-header\">\n        <span class=\"section-title\">Layer properties</span>\n        <div class=\"section-actions\">\n          <button class=\"icon-btn collapse-btn\" data-section=\"boxmodel\">${collapsed ? \"\\u25B8\" : \"\\u25BE\"}</button>\n        </div>\n      </div>\n      <div class=\"section-body box-model-section\" style=\"padding-top:0\">\n        <div class=\"box-model-wrap\">\n          <div class=\"box-model-outer\">\n            ${bm.marginTop !== void 0 ? `<div class=\"margin-indicator top\">${bm.marginTop}</div>` : '<div class=\"margin-indicator top\">\\u2014</div>'}\n            <div class=\"box-model-middle\">\n              ${bm.marginLeft !== void 0 ? `<div class=\"margin-indicator side\">${bm.marginLeft}</div>` : '<div class=\"margin-indicator side\">\\u2014</div>'}\n              <div class=\"box-border\">\n                <span class=\"box-border-label\">Border</span>\n                <span class=\"radius-label tl\">${dashVal(bm.radiusTl)}</span>\n                <span class=\"radius-label tr\">${dashVal(bm.radiusTr)}</span>\n                <span class=\"radius-label bl\">${dashVal(bm.radiusBl)}</span>\n                <span class=\"radius-label br\">${dashVal(bm.radiusBr)}</span>\n                <span class=\"border-weight top\">${dashVal(bm.borderTop)}</span>\n                <span class=\"border-weight bottom\">${dashVal(bm.borderBottom)}</span>\n                <span class=\"border-weight left\">${dashVal(bm.borderLeft)}</span>\n                <span class=\"border-weight right\">${dashVal(bm.borderRight)}</span>\n                <div class=\"box-padding\">\n                  <span class=\"box-padding-label\">Padding</span>\n                  <span class=\"pad-label top\">${dashVal(bm.paddingTop)}</span>\n                  <span class=\"pad-label bottom\">${dashVal(bm.paddingBottom)}</span>\n                  <span class=\"pad-label left\">${dashVal(bm.paddingLeft)}</span>\n                  <span class=\"pad-label right\">${dashVal(bm.paddingRight)}</span>\n                  <div class=\"box-content\">${bm.contentWidth} \\xD7 ${bm.contentHeight}</div>\n                </div>\n              </div>\n              ${bm.marginRight !== void 0 ? `<div class=\"margin-indicator side\">${bm.marginRight}</div>` : '<div class=\"margin-indicator side\">\\u2014</div>'}\n            </div>\n            ${bm.marginBottom !== void 0 ? `<div class=\"margin-indicator bottom\">${bm.marginBottom}</div>` : '<div class=\"margin-indicator bottom\">\\u2014</div>'}\n          </div>\n          <span class=\"box-sizing-tag\">border-box</span>\n        </div>\n      </div>\n    </div>`;\n  }\n  function colorDisplay(c) {\n    if (codePlatform === \"css\" && c.variable && colorFormat === \"CSS var\") return `var(${c.variable.cssName})`;\n    if (codePlatform === \"css\" && colorFormat === \"RGB\") return c.rgba;\n    if (codePlatform === \"ios\" || codePlatform === \"android\" || codePlatform === \"flutter\") {\n      const rgb = hexToRgbLocal(c.hex);\n      if (!rgb) return c.hex;\n      if (codePlatform === \"ios\") return c.variable ? `Color(\"${c.variable.name}\")` : c.hex;\n      if (codePlatform === \"android\") return c.variable ? `colorResource(...)` : `Color(${c.hex.replace(\"#\", \"0xFF\")})`;\n      return c.variable ? `AppColors.${c.variable.name.replace(/\\//g, \"\")}` : `Color(0xFF${c.hex.replace(\"#\", \"\")})`;\n    }\n    return c.hex;\n  }\n  function hexToRgbLocal(hex) {\n    const m = hex.replace(\"#\", \"\").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);\n    if (!m) return null;\n    return {\n      r: parseInt(m[1], 16) / 255,\n      g: parseInt(m[2], 16) / 255,\n      b: parseInt(m[3], 16) / 255\n    };\n  }\n  function renderColorsList(colors) {\n    return colors.map((c) => {\n      const display = colorDisplay(c);\n      const label = c.variable ? c.variable.name : display;\n      const usageRows = c.usages.map((u) => `<div class=\"color-usage-item\">${escapeHtml3(u.usage)} \\xB7 ${escapeHtml3(u.nodeName)}</div>`).join(\"\");\n      return `\n        <div class=\"color-group\">\n          <div class=\"color-row-main\">\n            <div class=\"swatch\" style=\"background:${c.hex}\" data-copy=\"${attrEscape(display)}\" title=\"Click to copy\"></div>\n            <div class=\"color-info\">\n              <div class=\"color-var\">${escapeHtml3(label)}</div>\n              <div class=\"color-hex\">${escapeHtml3(display)}</div>\n            </div>\n            <button class=\"icon-btn copy-prop\" data-copy=\"${attrEscape(display)}\" title=\"Copy\">\\u2398</button>\n          </div>\n          <div class=\"color-usages\">${usageRows}</div>\n        </div>`;\n    }).join(\"\");\n  }\n  function renderColorsSection(colors) {\n    if (!colors.length) return \"\";\n    const code = generateColorsCode(codePlatform, colors, colorFormat);\n    return renderSection(\"colors\", \"Colors\", code, renderColorsList(colors), !code.trim());\n  }\n  function renderVariablesList(variables) {\n    return variables.map((v) => {\n      const val = formatVariableDisplay(v);\n      return `\n      <div class=\"var-row\">\n        <span class=\"var-name\">${escapeHtml3(v.name)}</span>\n        <span class=\"var-value\">${escapeHtml3(val)}</span>\n        <button class=\"icon-btn copy-prop\" data-copy=\"${attrEscape(val)}\" title=\"Copy\">\\u2398</button>\n      </div>`;\n    }).join(\"\");\n  }\n  function renderVariablesSection(variables) {\n    if (!variables.length) return \"\";\n    const code = generateVariablesCode(codePlatform, variables, colorFormat);\n    return renderSection(\"variables\", \"Variables\", code, renderVariablesList(variables), !code.trim());\n  }\n  function variablesToCopyText(variables) {\n    return generateVariablesCode(codePlatform, variables, colorFormat);\n  }\n  function colorsToCopyText(colors) {\n    return generateColorsCode(codePlatform, colors, colorFormat);\n  }\n  function render() {\n    if (!currentData) {\n      emptyState.classList.remove(\"hidden\");\n      inspectDataEl.classList.add(\"hidden\");\n      return;\n    }\n    emptyState.classList.add(\"hidden\");\n    inspectDataEl.classList.remove(\"hidden\");\n    const d = currentData;\n    const ctx = codeContext();\n    const layoutCode = generateLayoutCode(codePlatform, d, ctx);\n    const styleCode = generateStyleCode(codePlatform, d, ctx);\n    const typoCode = generateTypographyCode(codePlatform, d, ctx);\n    let html = `\n    <div class=\"node-header\">\n      <div class=\"node-name\">\n        <span>${escapeHtml3(d.name)}</span>\n        <span class=\"node-type\">${d.type}</span>\n      </div>\n      <div class=\"node-size\">${d.width} \\xD7 ${d.height}</div>\n      ${d.masterComponentName ? `<div class=\"master-link\">\\u21B3 ${escapeHtml3(d.masterComponentName)}</div>` : \"\"}\n    </div>`;\n    if (d.boxModel) {\n      html += renderBoxModel(d.boxModel);\n    }\n    html += renderSection(\"layout\", \"Layout\", layoutCode, codeToListRows(layoutCode));\n    html += renderSection(\"style\", \"Style\", styleCode, codeToListRows(styleCode));\n    if (d.type === \"TEXT\") {\n      html += renderSection(\"typography\", \"Typography\", typoCode, codeToListRows(typoCode));\n    }\n    html += renderVariablesSection(currentVariables);\n    html += renderColorsSection(currentColors);\n    inspectDataEl.innerHTML = html;\n    bindSectionEvents();\n  }\n  function bindSectionEvents() {\n    document.querySelectorAll(\".section-header\").forEach((header) => {\n      header.addEventListener(\"click\", (e) => {\n        if (e.target.closest(\".icon-btn\")) return;\n        const section = header.closest(\".section\");\n        const id = section.getAttribute(\"data-section\");\n        if (collapsedSections.has(id)) collapsedSections.delete(id);\n        else collapsedSections.add(id);\n        section.classList.toggle(\"collapsed\");\n        const btn = section.querySelector(\".collapse-btn\");\n        if (btn) btn.textContent = collapsedSections.has(id) ? \"\\u25B8\" : \"\\u25BE\";\n      });\n    });\n    document.querySelectorAll(\".collapse-btn\").forEach((btn) => {\n      btn.addEventListener(\"click\", (e) => {\n        e.stopPropagation();\n        const id = btn.getAttribute(\"data-section\");\n        const section = btn.closest(\".section\");\n        if (collapsedSections.has(id)) collapsedSections.delete(id);\n        else collapsedSections.add(id);\n        section.classList.toggle(\"collapsed\");\n        btn.textContent = collapsedSections.has(id) ? \"\\u25B8\" : \"\\u25BE\";\n      });\n    });\n    document.querySelectorAll(\".copy-section\").forEach((btn) => {\n      btn.addEventListener(\"click\", (e) => {\n        e.stopPropagation();\n        if (!currentData) return;\n        const section = btn.getAttribute(\"data-section\");\n        const ctx = codeContext();\n        let code = \"\";\n        if (section === \"layout\") code = generateLayoutCode(codePlatform, currentData, ctx);\n        else if (section === \"style\") code = generateStyleCode(codePlatform, currentData, ctx);\n        else if (section === \"typography\") code = generateTypographyCode(codePlatform, currentData, ctx);\n        else if (section === \"variables\") code = variablesToCopyText(currentVariables);\n        else if (section === \"colors\") code = colorsToCopyText(currentColors);\n        else if (section === \"all\") code = generateAllCode(codePlatform, currentData, ctx);\n        copyText(code, btn);\n      });\n    });\n    document.querySelectorAll(\".copy-prop\").forEach((btn) => {\n      btn.addEventListener(\"click\", (e) => {\n        e.stopPropagation();\n        const val = btn.getAttribute(\"data-copy\");\n        if (val) copyText(val, btn);\n      });\n    });\n    document.querySelectorAll(\".swatch\").forEach((sw) => {\n      sw.addEventListener(\"click\", () => {\n        const val = sw.getAttribute(\"data-copy\");\n        if (val) copyText(val);\n      });\n    });\n  }\n  function defaultFormatForAsset(asset) {\n    if (asset.kind === \"image\") return \"PNG\";\n    if (asset.kind === \"icon\") return \"SVG\";\n    return \"PNG\";\n  }\n  function kindLabel(kind) {\n    if (kind === \"icon\") return \"Icon\";\n    if (kind === \"image\") return \"Image\";\n    return \"Layer\";\n  }\n  function renderAssetCard(asset) {\n    const defFmt = defaultFormatForAsset(asset);\n    const indent = Math.min(asset.depth * 8, 32);\n    return `\n    <div class=\"asset-card\" data-id=\"${asset.id}\" style=\"margin-left:${indent}px\">\n      <div class=\"asset-name\">\n        ${escapeHtml3(asset.name)}\n        <span class=\"asset-kind ${asset.kind}\">${kindLabel(asset.kind)}</span>\n      </div>\n      <div class=\"asset-meta\">\n        <span class=\"asset-size\">${asset.width} \\xD7 ${asset.height}</span>\n        <span class=\"asset-type-label\">${escapeHtml3(asset.nodeType)}</span>\n        ${asset.hasExportSettings ? '<span class=\"asset-type-label\">\\xB7 export preset</span>' : \"\"}\n      </div>\n      <div class=\"export-quick-btns\">\n        <button class=\"export-btn\" data-id=\"${asset.id}\" data-format=\"SVG\">SVG</button>\n        <button class=\"export-btn\" data-id=\"${asset.id}\" data-format=\"PNG\" data-scale=\"1\">PNG 1\\xD7</button>\n        <button class=\"export-btn\" data-id=\"${asset.id}\" data-format=\"PNG\" data-scale=\"2\">PNG 2\\xD7</button>\n        <button class=\"export-btn\" data-id=\"${asset.id}\" data-format=\"PNG\" data-scale=\"3\">PNG 3\\xD7</button>\n        <button class=\"export-btn\" data-id=\"${asset.id}\" data-format=\"PDF\">PDF</button>\n      </div>\n      <div class=\"asset-controls\">\n        <select class=\"form-select asset-format\" data-id=\"${asset.id}\">\n          <option value=\"SVG\" ${defFmt === \"SVG\" ? \"selected\" : \"\"}>SVG</option>\n          <option value=\"PNG\" ${defFmt === \"PNG\" ? \"selected\" : \"\"}>PNG</option>\n          <option value=\"PDF\" ${defFmt === \"PDF\" ? \"selected\" : \"\"}>PDF</option>\n        </select>\n        <select class=\"form-select asset-scale\" data-id=\"${asset.id}\">\n          <option value=\"1\">1\\xD7</option>\n          <option value=\"2\">2\\xD7</option>\n          <option value=\"3\">3\\xD7</option>\n          <option value=\"4\">4\\xD7</option>\n        </select>\n        <button class=\"asset-export-btn\" data-id=\"${asset.id}\">Export</button>\n      </div>\n    </div>`;\n  }\n  function collectExportItems() {\n    const items = [];\n    exportContent.querySelectorAll(\".asset-card\").forEach((card) => {\n      var _a2, _b, _c, _d;\n      const id = card.getAttribute(\"data-id\");\n      if (!id) return;\n      const format = (_b = (_a2 = card.querySelector(\".asset-format\")) == null ? void 0 : _a2.value) != null ? _b : \"PNG\";\n      const scale = parseFloat((_d = (_c = card.querySelector(\".asset-scale\")) == null ? void 0 : _c.value) != null ? _d : \"1\");\n      items.push({ nodeId: id, format, scale });\n    });\n    return items;\n  }\n  function sendExport(nodeId, format, scale) {\n    parent.postMessage({ pluginMessage: { type: \"EXPORT_REQUEST\", nodeId, format, scale } }, \"*\");\n  }\n  function sendExportBatch(items) {\n    parent.postMessage({ pluginMessage: { type: \"EXPORT_BATCH_REQUEST\", items } }, \"*\");\n  }\n  function bindExportEvents() {\n    var _a2;\n    exportContent.querySelectorAll(\".export-btn\").forEach((btn) => {\n      btn.addEventListener(\"click\", () => {\n        var _a3;\n        const el = btn;\n        sendExport(\n          el.getAttribute(\"data-id\"),\n          el.getAttribute(\"data-format\"),\n          parseFloat((_a3 = el.getAttribute(\"data-scale\")) != null ? _a3 : \"1\")\n        );\n      });\n    });\n    exportContent.querySelectorAll(\".asset-export-btn\").forEach((btn) => {\n      btn.addEventListener(\"click\", () => {\n        const id = btn.getAttribute(\"data-id\");\n        const card = btn.closest(\".asset-card\");\n        const format = card.querySelector(\".asset-format\").value;\n        const scale = parseFloat(card.querySelector(\".asset-scale\").value);\n        sendExport(id, format, scale);\n      });\n    });\n    (_a2 = document.getElementById(\"export-all-btn\")) == null ? void 0 : _a2.addEventListener(\"click\", () => {\n      const items = collectExportItems();\n      if (items.length) sendExportBatch(items);\n    });\n  }\n  function renderExport() {\n    var _a2, _b;\n    if (!currentData) {\n      exportContent.innerHTML = '<div class=\"empty-state\">Select a layer to export</div>';\n      return;\n    }\n    const assets = exportTab === \"filtered\" ? (_a2 = currentData.filteredAssets) != null ? _a2 : [] : (_b = currentData.allAssets) != null ? _b : [];\n    if (!assets.length) {\n      const msg = exportTab === \"filtered\" ? \"No icons or images detected in this selection\" : \"No exportable layers found\";\n      exportContent.innerHTML = `<div class=\"empty-state\">${msg}</div>`;\n      return;\n    }\n    let html = `\n    <div class=\"export-toolbar\">\n      <span class=\"export-toolbar-left\">${assets.length} item${assets.length === 1 ? \"\" : \"s\"}</span>\n      <button class=\"export-all-btn\" id=\"export-all-btn\">Export all (${assets.length})</button>\n    </div>`;\n    for (const asset of assets) {\n      html += renderAssetCard(asset);\n    }\n    exportContent.innerHTML = html;\n    bindExportEvents();\n  }\n  function escapeHtml3(s) {\n    return s.replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\");\n  }\n  window.onmessage = (event) => {\n    const msg = event.data.pluginMessage;\n    if (!msg) return;\n    switch (msg.type) {\n      case \"NO_SELECTION\":\n        currentData = null;\n        currentVariables = [];\n        currentColors = [];\n        emptyState.textContent = \"Select a layer to inspect\";\n        emptyState.classList.remove(\"hidden\");\n        inspectDataEl.classList.add(\"hidden\");\n        renderExport();\n        break;\n      case \"MULTI_SELECTION\":\n        currentData = null;\n        emptyState.textContent = \"Select a single layer\";\n        emptyState.classList.remove(\"hidden\");\n        inspectDataEl.classList.add(\"hidden\");\n        renderExport();\n        break;\n      case \"INSPECT_DATA\":\n        currentData = msg.data;\n        currentVariables = msg.variables;\n        currentColors = msg.colors;\n        render();\n        renderExport();\n        break;\n      case \"EXPORT_RESULT\": {\n        const blob = new Blob([new Uint8Array(msg.bytes)], { type: msg.mimeType });\n        const url = URL.createObjectURL(blob);\n        const a = document.createElement(\"a\");\n        a.href = url;\n        a.download = msg.filename;\n        a.click();\n        URL.revokeObjectURL(url);\n        break;\n      }\n    }\n  };\n  var ro = new ResizeObserver((entries) => {\n    for (const entry of entries) {\n      parent.postMessage(\n        { pluginMessage: { type: \"RESIZE\", width: entry.contentRect.width, height: entry.contentRect.height + 90 } },\n        \"*\"\n      );\n    }\n  });\n  ro.observe(document.body);\n  window.addEventListener(\"beforeunload\", () => {\n    parent.postMessage({ pluginMessage: { type: \"PLUGIN_CLOSED\" } }, \"*\");\n  });\n})();\n</script>\n</body>\n</html>\n", { width: 320, height: 600, title: "Inspect" });
  var spacingEnabled = false;
  figma.on("selectionchange", () => {
    handleSelectionChange();
  });
  figma.on("currentpagechange", () => {
    clearOverlays();
    handleSelectionChange();
  });
  figma.on("close", () => {
    clearOverlays();
  });
  function serializePaint(paint) {
    const base = {
      type: paint.type,
      visible: paint.visible,
      opacity: "opacity" in paint ? paint.opacity : void 0
    };
    if (paint.type === "SOLID") {
      base.color = { r: paint.color.r, g: paint.color.g, b: paint.color.b };
    }
    if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
      base.gradientStops = paint.gradientStops.map((s) => ({
        position: s.position,
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a }
      }));
      base.gradientTransform = paint.gradientTransform;
    }
    return base;
  }
  function serializeEffect(effect) {
    const base = { type: effect.type, visible: effect.visible };
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      base.radius = effect.radius;
      base.spread = effect.spread;
      base.offset = { x: effect.offset.x, y: effect.offset.y };
      base.color = { r: effect.color.r, g: effect.color.g, b: effect.color.b, a: effect.color.a };
    }
    if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
      base.radius = effect.radius;
    }
    return base;
  }
  function getCornerRadii(node) {
    if (!("topLeftRadius" in node)) return void 0;
    const n = node;
    return {
      tl: n.topLeftRadius,
      tr: n.topRightRadius,
      br: n.bottomRightRadius,
      bl: n.bottomLeftRadius
    };
  }
  function getCornerRadius(node) {
    if (!("cornerRadius" in node)) return void 0;
    const cr = node.cornerRadius;
    if (cr === figma.mixed) return "MIXED";
    return cr;
  }
  async function buildInspectData(node) {
    var _a, _b, _c, _d;
    const box = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
    const parent = node.parent;
    const parentLayoutMode = parent && "layoutMode" in parent ? parent.layoutMode : "NONE";
    const data = {
      id: node.id,
      name: node.name,
      type: node.type,
      width: Math.round("width" in node ? node.width : (_a = box == null ? void 0 : box.width) != null ? _a : 0),
      height: Math.round("height" in node ? node.height : (_b = box == null ? void 0 : box.height) != null ? _b : 0),
      x: box ? Math.round(box.x) : void 0,
      y: box ? Math.round(box.y) : void 0,
      fills: [],
      strokes: [],
      effects: [],
      boundVariables: {}
    };
    if ("layoutAlign" in node) data.layoutAlign = node.layoutAlign;
    data.parentLayoutMode = parentLayoutMode;
    if (isLayoutNode(node)) {
      data.layoutMode = node.layoutMode;
      if (node.layoutMode !== "NONE") {
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
    if ("fills" in node && Array.isArray(node.fills)) {
      data.fills = node.fills.map(serializePaint);
    }
    if ("strokes" in node && Array.isArray(node.strokes)) {
      data.strokes = node.strokes.map(serializePaint);
    }
    if ("strokeWeight" in node && typeof node.strokeWeight === "number") {
      data.strokeWeight = node.strokeWeight;
    }
    if ("opacity" in node && typeof node.opacity === "number") {
      data.opacity = node.opacity;
    }
    if ("effects" in node && Array.isArray(node.effects)) {
      data.effects = node.effects.map(serializeEffect);
    }
    const cr = getCornerRadius(node);
    if (cr !== void 0) {
      data.cornerRadius = cr;
      if (cr === "MIXED") data.cornerRadii = getCornerRadii(node);
    }
    if (node.type === "TEXT") {
      data.fontFamily = node.fontName === figma.mixed ? "MIXED" : node.fontName.family;
      data.fontStyle = node.fontName === figma.mixed ? "MIXED" : node.fontName.style;
      data.fontSize = node.fontSize === figma.mixed ? "MIXED" : node.fontSize;
      data.fontWeight = node.fontWeight === figma.mixed ? "MIXED" : node.fontWeight;
      if (node.lineHeight === figma.mixed) {
        data.lineHeight = "MIXED";
      } else {
        data.lineHeight = { unit: node.lineHeight.unit, value: "value" in node.lineHeight ? node.lineHeight.value : void 0 };
      }
      if (node.letterSpacing === figma.mixed) {
        data.letterSpacing = "MIXED";
      } else {
        data.letterSpacing = { unit: node.letterSpacing.unit, value: node.letterSpacing.value };
      }
      data.textAlignHorizontal = node.textAlignHorizontal;
      const td = node.textDecoration;
      data.textDecoration = td === figma.mixed ? "MIXED" : td;
    }
    if (node.type === "INSTANCE" && node.mainComponent) {
      data.masterComponentName = node.mainComponent.name;
    }
    if ("boundVariables" in node && node.boundVariables) {
      for (const [key, val] of Object.entries(node.boundVariables)) {
        if (Array.isArray(val)) {
          data.boundVariables[key] = { id: (_d = (_c = val[0]) == null ? void 0 : _c.id) != null ? _d : "", type: "array" };
        } else if (val && typeof val === "object" && "id" in val) {
          data.boundVariables[key] = { id: val.id };
        }
      }
    }
    if ("exportSettings" in node && node.exportSettings.length > 0) {
      data.exportSettings = node.exportSettings.map((s) => {
        const entry = { format: s.format };
        if ("constraint" in s && s.constraint) {
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
  async function handleSelectionChange() {
    clearOverlays();
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "NO_SELECTION" });
      return;
    }
    if (selection.length > 1) {
      figma.ui.postMessage({ type: "MULTI_SELECTION" });
      return;
    }
    try {
      const node = selection[0];
      const data = await buildInspectData(node);
      const boundForResolve = {};
      if ("boundVariables" in node && node.boundVariables) {
        for (const [key, val] of Object.entries(node.boundVariables)) {
          if (val && !Array.isArray(val) && typeof val === "object" && "id" in val) {
            boundForResolve[key] = val;
          }
        }
      }
      const variables = await resolveAllVariables(boundForResolve);
      const colors = await collectColors(node);
      figma.ui.postMessage({ type: "INSPECT_DATA", data, variables, colors });
      if (spacingEnabled && isLayoutNode(node)) {
        await drawSpacingOverlay(node);
      }
    } catch (e) {
      figma.ui.postMessage({ type: "NO_SELECTION" });
    }
  }
  async function exportSingle(nodeId, format, scale) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !("exportAsync" in node)) return;
    const result = await exportNode(node, format, scale);
    figma.ui.postMessage({
      type: "EXPORT_RESULT",
      bytes: Array.from(result.bytes),
      filename: result.filename,
      mimeType: result.mimeType
    });
  }
  async function handleExport(msg) {
    try {
      await exportSingle(msg.nodeId, msg.format, msg.scale);
    } catch (e) {
      figma.notify("Export failed: " + String(e));
    }
  }
  async function handleExportBatch(items) {
    let ok = 0;
    for (const item of items) {
      try {
        await exportSingle(item.nodeId, item.format, item.scale);
        ok++;
      } catch (e) {
      }
    }
    if (ok > 0) figma.notify(`Exported ${ok} of ${items.length} assets`);
    else figma.notify("Export failed");
  }
  figma.ui.onmessage = async (msg) => {
    var _a, _b;
    switch (msg.type) {
      case "EXPORT_REQUEST":
        if (msg.nodeId && msg.format) {
          await handleExport({ nodeId: msg.nodeId, format: msg.format, scale: (_a = msg.scale) != null ? _a : 1 });
        }
        break;
      case "EXPORT_BATCH_REQUEST":
        if ((_b = msg.items) == null ? void 0 : _b.length) await handleExportBatch(msg.items);
        break;
      case "TOGGLE_SPACING":
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
      case "RESIZE":
        if (msg.width && msg.height) {
          figma.ui.resize(msg.width, msg.height);
        }
        break;
      case "PLUGIN_CLOSED":
        spacingEnabled = false;
        clearOverlays();
        break;
    }
  };
  handleSelectionChange();
})();

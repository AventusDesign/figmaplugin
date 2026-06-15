import {
  formatVariableValue,
  generateAllCode,
  generateColorsCode,
  generateLayoutCode,
  generateStyleCode,
  generateTypographyCode,
  generateVariablesCode,
  highlightCode,
} from './utils/platform-gen';
import type { AssetEntry, BoxModelData, CodePlatform, ColorFormat, GroupedColorEntry, InspectData, PluginToUI, ResolvedVariable } from './types';

let currentData: InspectData | null = null;
let currentVariables: ResolvedVariable[] = [];
let currentColors: GroupedColorEntry[] = [];
let viewMode: 'list' | 'code' = 'list';
let codePlatform: CodePlatform = 'css';
let colorFormat: ColorFormat = 'HEX';
let spacingEnabled = false;
let exportTab: 'filtered' | 'all' = 'filtered';

const collapsedSections = new Set<string>();

const emptyState = document.getElementById('empty-state')!;
const inspectDataEl = document.getElementById('inspect-data')!;
const exportContent = document.getElementById('export-content')!;
const spacingToggle = document.getElementById('spacing-toggle')!;
const codePlatformSelect = document.getElementById('code-platform') as HTMLSelectElement;
const colorFormatSelect = document.getElementById('color-format') as HTMLSelectElement;

// Tabs
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.getAttribute('data-tab');
    document.getElementById('inspect-panel')!.classList.toggle('hidden', name !== 'inspect');
    document.getElementById('export-panel')!.classList.toggle('hidden', name !== 'export');
  });
});

document.querySelectorAll('.sub-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    viewMode = tab.getAttribute('data-view') as 'list' | 'code';
    render();
  });
});

spacingToggle.addEventListener('click', () => {
  spacingEnabled = !spacingEnabled;
  spacingToggle.classList.toggle('active', spacingEnabled);
  parent.postMessage({ pluginMessage: { type: 'TOGGLE_SPACING', enabled: spacingEnabled } }, '*');
});

colorFormatSelect.addEventListener('change', () => {
  colorFormat = colorFormatSelect.value as ColorFormat;
  render();
});

codePlatformSelect.addEventListener('change', () => {
  codePlatform = codePlatformSelect.value as CodePlatform;
  syncColorFormatOptions();
  render();
});

function syncColorFormatOptions(): void {
  const cssVarOption = colorFormatSelect.querySelector('option[value="CSS var"]') as HTMLOptionElement | null;
  const hslOption = colorFormatSelect.querySelector('option[value="HSL"]') as HTMLOptionElement | null;
  const isCss = codePlatform === 'css';
  if (cssVarOption) cssVarOption.hidden = !isCss;
  if (hslOption) hslOption.hidden = !isCss;
  colorFormatSelect.style.display = isCss ? '' : 'none';
  if (!isCss && (colorFormat === 'CSS var' || colorFormat === 'HSL')) {
    colorFormat = 'HEX';
    colorFormatSelect.value = 'HEX';
  }
}

syncColorFormatOptions();

document.getElementById('export-sub-tabs')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-export-tab]') as HTMLElement | null;
  if (!btn) return;
  exportTab = btn.getAttribute('data-export-tab') as 'filtered' | 'all';
  document.querySelectorAll('#export-sub-tabs .sub-tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  renderExport();
});

function showCopied(btn: HTMLElement): void {
  const orig = btn.textContent;
  btn.textContent = '✓';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove('copied');
  }, 1500);
}

async function copyText(text: string, btn?: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) showCopied(btn);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (btn) showCopied(btn);
  }
}

function formatVariableDisplay(v: ResolvedVariable): string {
  return formatVariableValue(codePlatform, v, colorFormat);
}

function codeContext() {
  return { colorFormat, variables: currentVariables };
}

function renderSection(
  id: string,
  title: string,
  code: string,
  listHtml: string,
  codeFallbackToList = false
): string {
  const collapsed = collapsedSections.has(id);
  if (viewMode === 'code') {
    const highlighted = highlightCode(codePlatform, code);
    const showListInCode = codeFallbackToList && !code.trim() && listHtml;
    const bodyContent = highlighted
      ? `<div class="code-block"><pre>${highlighted}</pre></div>`
      : showListInCode
        ? listHtml
        : '<span style="color:var(--text-secondary)">—</span>';
    return `
      <div class="section ${collapsed ? 'collapsed' : ''}" data-section="${id}">
        <div class="section-header">
          <span class="section-title">${title}</span>
          <div class="section-actions">
            <button class="icon-btn copy-section" data-section="${id}" title="Copy code">⎘</button>
            <button class="icon-btn collapse-btn" data-section="${id}">${collapsed ? '▸' : '▾'}</button>
          </div>
        </div>
        <div class="section-body">${bodyContent}</div>
      </div>`;
  }

  return `
    <div class="section ${collapsed ? 'collapsed' : ''}" data-section="${id}">
      <div class="section-header">
        <span class="section-title">${title}</span>
        <div class="section-actions">
          <button class="icon-btn copy-section" data-section="${id}" title="Copy code">⎘</button>
          <button class="icon-btn collapse-btn" data-section="${id}">${collapsed ? '▸' : '▾'}</button>
        </div>
      </div>
      <div class="section-body">${listHtml || '<span style="color:var(--text-secondary)">—</span>'}</div>
    </div>`;
}

function attrEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function codeToRows(code: string): string {
  if (!code.trim()) return '';
  return code
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim();
      return `<div class="prop-row">
        <span class="prop-name"></span>
        <span class="prop-value mono">${escapeHtml(trimmed)}</span>
        <button class="icon-btn copy-prop" data-copy="${attrEscape(trimmed)}" title="Copy">⎘</button>
      </div>`;
    })
    .join('');
}

function cssToRows(css: string): string {
  if (!css.trim()) return '';
  return css
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim();
      const [prop, ...rest] = trimmed.replace(/;$/, '').split(':');
      if (!prop || !rest.length) return '';
      const value = rest.join(':').trim();
      const copyVal = `${prop.trim()}: ${value};`;
      return `<div class="prop-row">
        <span class="prop-name">${escapeHtml(prop.trim())}</span>
        <span class="prop-value">${escapeHtml(value)}</span>
        <button class="icon-btn copy-prop" data-copy="${attrEscape(copyVal)}" title="Copy">⎘</button>
      </div>`;
    })
    .join('');
}

function codeToListRows(code: string): string {
  return codePlatform === 'css' ? cssToRows(code) : codeToRows(code);
}

function dashVal(n: number): string {
  return n > 0 ? String(Math.round(n)) : '—';
}

function renderBoxModel(bm: BoxModelData): string {
  const collapsed = collapsedSections.has('boxmodel');
  return `
    <div class="section ${collapsed ? 'collapsed' : ''}" data-section="boxmodel">
      <div class="section-header">
        <span class="section-title">Layer properties</span>
        <div class="section-actions">
          <button class="icon-btn collapse-btn" data-section="boxmodel">${collapsed ? '▸' : '▾'}</button>
        </div>
      </div>
      <div class="section-body box-model-section" style="padding-top:0">
        <div class="box-model-wrap">
          <div class="box-model-outer">
            ${bm.marginTop !== undefined ? `<div class="margin-indicator top">${bm.marginTop}</div>` : '<div class="margin-indicator top">—</div>'}
            <div class="box-model-middle">
              ${bm.marginLeft !== undefined ? `<div class="margin-indicator side">${bm.marginLeft}</div>` : '<div class="margin-indicator side">—</div>'}
              <div class="box-border">
                <span class="box-border-label">Border</span>
                <span class="radius-label tl">${dashVal(bm.radiusTl)}</span>
                <span class="radius-label tr">${dashVal(bm.radiusTr)}</span>
                <span class="radius-label bl">${dashVal(bm.radiusBl)}</span>
                <span class="radius-label br">${dashVal(bm.radiusBr)}</span>
                <span class="border-weight top">${dashVal(bm.borderTop)}</span>
                <span class="border-weight bottom">${dashVal(bm.borderBottom)}</span>
                <span class="border-weight left">${dashVal(bm.borderLeft)}</span>
                <span class="border-weight right">${dashVal(bm.borderRight)}</span>
                <div class="box-padding">
                  <span class="box-padding-label">Padding</span>
                  <span class="pad-label top">${dashVal(bm.paddingTop)}</span>
                  <span class="pad-label bottom">${dashVal(bm.paddingBottom)}</span>
                  <span class="pad-label left">${dashVal(bm.paddingLeft)}</span>
                  <span class="pad-label right">${dashVal(bm.paddingRight)}</span>
                  <div class="box-content">${bm.contentWidth} × ${bm.contentHeight}</div>
                </div>
              </div>
              ${bm.marginRight !== undefined ? `<div class="margin-indicator side">${bm.marginRight}</div>` : '<div class="margin-indicator side">—</div>'}
            </div>
            ${bm.marginBottom !== undefined ? `<div class="margin-indicator bottom">${bm.marginBottom}</div>` : '<div class="margin-indicator bottom">—</div>'}
          </div>
          <span class="box-sizing-tag">border-box</span>
        </div>
      </div>
    </div>`;
}

function colorDisplay(c: GroupedColorEntry): string {
  if (codePlatform === 'css' && c.variable && colorFormat === 'CSS var') return `var(${c.variable.cssName})`;
  if (codePlatform === 'css' && colorFormat === 'RGB') return c.rgba;
  if (codePlatform === 'ios' || codePlatform === 'android' || codePlatform === 'flutter') {
    const rgb = hexToRgbLocal(c.hex);
    if (!rgb) return c.hex;
    if (codePlatform === 'ios') return c.variable ? `Color("${c.variable.name}")` : c.hex;
    if (codePlatform === 'android') return c.variable ? `colorResource(...)` : `Color(${c.hex.replace('#', '0xFF')})`;
    return c.variable ? `AppColors.${c.variable.name.replace(/\//g, '')}` : `Color(0xFF${c.hex.replace('#', '')})`;
  }
  return c.hex;
}

function hexToRgbLocal(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

function renderColorsList(colors: GroupedColorEntry[]): string {
  return colors
    .map((c) => {
      const display = colorDisplay(c);
      const label = c.variable ? c.variable.name : display;
      const usageRows = c.usages
        .map((u) => `<div class="color-usage-item">${escapeHtml(u.usage)} · ${escapeHtml(u.nodeName)}</div>`)
        .join('');
      return `
        <div class="color-group">
          <div class="color-row-main">
            <div class="swatch" style="background:${c.hex}" data-copy="${attrEscape(display)}" title="Click to copy"></div>
            <div class="color-info">
              <div class="color-var">${escapeHtml(label)}</div>
              <div class="color-hex">${escapeHtml(display)}</div>
            </div>
            <button class="icon-btn copy-prop" data-copy="${attrEscape(display)}" title="Copy">⎘</button>
          </div>
          <div class="color-usages">${usageRows}</div>
        </div>`;
    })
    .join('');
}

function renderColorsSection(colors: GroupedColorEntry[]): string {
  if (!colors.length) return '';
  const code = generateColorsCode(codePlatform, colors, colorFormat);
  return renderSection('colors', 'Colors', code, renderColorsList(colors), !code.trim());
}

function renderVariablesList(variables: ResolvedVariable[]): string {
  return variables
    .map((v) => {
      const val = formatVariableDisplay(v);
      return `
      <div class="var-row">
        <span class="var-name">${escapeHtml(v.name)}</span>
        <span class="var-value">${escapeHtml(val)}</span>
        <button class="icon-btn copy-prop" data-copy="${attrEscape(val)}" title="Copy">⎘</button>
      </div>`;
    })
    .join('');
}

function renderVariablesSection(variables: ResolvedVariable[]): string {
  if (!variables.length) return '';
  const code = generateVariablesCode(codePlatform, variables, colorFormat);
  return renderSection('variables', 'Variables', code, renderVariablesList(variables), !code.trim());
}

function variablesToCopyText(variables: ResolvedVariable[]): string {
  return generateVariablesCode(codePlatform, variables, colorFormat);
}

function colorsToCopyText(colors: GroupedColorEntry[]): string {
  return generateColorsCode(codePlatform, colors, colorFormat);
}

function render(): void {
  if (!currentData) {
    emptyState.classList.remove('hidden');
    inspectDataEl.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  inspectDataEl.classList.remove('hidden');

  const d = currentData;
  const ctx = codeContext();
  const layoutCode = generateLayoutCode(codePlatform, d, ctx);
  const styleCode = generateStyleCode(codePlatform, d, ctx);
  const typoCode = generateTypographyCode(codePlatform, d, ctx);

  let html = `
    <div class="node-header">
      <div class="node-name">
        <span>${escapeHtml(d.name)}</span>
        <span class="node-type">${d.type}</span>
      </div>
      <div class="node-size">${d.width} × ${d.height}</div>
      ${d.masterComponentName ? `<div class="master-link">↳ ${escapeHtml(d.masterComponentName)}</div>` : ''}
    </div>`;

  if (d.boxModel) {
    html += renderBoxModel(d.boxModel);
  }

  html += renderSection('layout', 'Layout', layoutCode, codeToListRows(layoutCode));
  html += renderSection('style', 'Style', styleCode, codeToListRows(styleCode));

  if (d.type === 'TEXT') {
    html += renderSection('typography', 'Typography', typoCode, codeToListRows(typoCode));
  }

  html += renderVariablesSection(currentVariables);
  html += renderColorsSection(currentColors);

  inspectDataEl.innerHTML = html;
  bindSectionEvents();
}

function bindSectionEvents(): void {
  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.icon-btn')) return;
      const section = header.closest('.section')!;
      const id = section.getAttribute('data-section')!;
      if (collapsedSections.has(id)) collapsedSections.delete(id);
      else collapsedSections.add(id);
      section.classList.toggle('collapsed');
      const btn = section.querySelector('.collapse-btn');
      if (btn) btn.textContent = collapsedSections.has(id) ? '▸' : '▾';
    });
  });

  document.querySelectorAll('.collapse-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-section')!;
      const section = btn.closest('.section')!;
      if (collapsedSections.has(id)) collapsedSections.delete(id);
      else collapsedSections.add(id);
      section.classList.toggle('collapsed');
      btn.textContent = collapsedSections.has(id) ? '▸' : '▾';
    });
  });

  document.querySelectorAll('.copy-section').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentData) return;
      const section = btn.getAttribute('data-section')!;
      const ctx = codeContext();
      let code = '';
      if (section === 'layout') code = generateLayoutCode(codePlatform, currentData, ctx);
      else if (section === 'style') code = generateStyleCode(codePlatform, currentData, ctx);
      else if (section === 'typography') code = generateTypographyCode(codePlatform, currentData, ctx);
      else if (section === 'variables') code = variablesToCopyText(currentVariables);
      else if (section === 'colors') code = colorsToCopyText(currentColors);
      else if (section === 'all') code = generateAllCode(codePlatform, currentData, ctx);
      copyText(code, btn as HTMLElement);
    });
  });

  document.querySelectorAll('.copy-prop').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.getAttribute('data-copy');
      if (val) copyText(val, btn as HTMLElement);
    });
  });

  document.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const val = sw.getAttribute('data-copy');
      if (val) copyText(val);
    });
  });
}

function defaultFormatForAsset(asset: AssetEntry): 'SVG' | 'PNG' | 'PDF' {
  if (asset.kind === 'image') return 'PNG';
  if (asset.kind === 'icon') return 'SVG';
  return 'PNG';
}

function kindLabel(kind: AssetEntry['kind']): string {
  if (kind === 'icon') return 'Icon';
  if (kind === 'image') return 'Image';
  return 'Layer';
}

function renderAssetCard(asset: AssetEntry): string {
  const defFmt = defaultFormatForAsset(asset);
  const indent = Math.min(asset.depth * 8, 32);
  return `
    <div class="asset-card" data-id="${asset.id}" style="margin-left:${indent}px">
      <div class="asset-name">
        ${escapeHtml(asset.name)}
        <span class="asset-kind ${asset.kind}">${kindLabel(asset.kind)}</span>
      </div>
      <div class="asset-meta">
        <span class="asset-size">${asset.width} × ${asset.height}</span>
        <span class="asset-type-label">${escapeHtml(asset.nodeType)}</span>
        ${asset.hasExportSettings ? '<span class="asset-type-label">· export preset</span>' : ''}
      </div>
      <div class="export-quick-btns">
        <button class="export-btn" data-id="${asset.id}" data-format="SVG">SVG</button>
        <button class="export-btn" data-id="${asset.id}" data-format="PNG" data-scale="1">PNG 1×</button>
        <button class="export-btn" data-id="${asset.id}" data-format="PNG" data-scale="2">PNG 2×</button>
        <button class="export-btn" data-id="${asset.id}" data-format="PNG" data-scale="3">PNG 3×</button>
        <button class="export-btn" data-id="${asset.id}" data-format="PDF">PDF</button>
      </div>
      <div class="asset-controls">
        <select class="form-select asset-format" data-id="${asset.id}">
          <option value="SVG" ${defFmt === 'SVG' ? 'selected' : ''}>SVG</option>
          <option value="PNG" ${defFmt === 'PNG' ? 'selected' : ''}>PNG</option>
          <option value="PDF" ${defFmt === 'PDF' ? 'selected' : ''}>PDF</option>
        </select>
        <select class="form-select asset-scale" data-id="${asset.id}">
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="3">3×</option>
          <option value="4">4×</option>
        </select>
        <button class="asset-export-btn" data-id="${asset.id}">Export</button>
      </div>
    </div>`;
}

function collectExportItems(): Array<{ nodeId: string; format: string; scale: number }> {
  const items: Array<{ nodeId: string; format: string; scale: number }> = [];
  exportContent.querySelectorAll('.asset-card').forEach((card) => {
    const id = card.getAttribute('data-id');
    if (!id) return;
    const format = (card.querySelector('.asset-format') as HTMLSelectElement)?.value ?? 'PNG';
    const scale = parseFloat((card.querySelector('.asset-scale') as HTMLSelectElement)?.value ?? '1');
    items.push({ nodeId: id, format, scale });
  });
  return items;
}

function sendExport(nodeId: string, format: string, scale: number): void {
  parent.postMessage({ pluginMessage: { type: 'EXPORT_REQUEST', nodeId, format, scale } }, '*');
}

function sendExportBatch(items: Array<{ nodeId: string; format: string; scale: number }>): void {
  parent.postMessage({ pluginMessage: { type: 'EXPORT_BATCH_REQUEST', items } }, '*');
}

function bindExportEvents(): void {
  exportContent.querySelectorAll('.export-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      sendExport(
        el.getAttribute('data-id')!,
        el.getAttribute('data-format')!,
        parseFloat(el.getAttribute('data-scale') ?? '1')
      );
    });
  });

  exportContent.querySelectorAll('.asset-export-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id')!;
      const card = btn.closest('.asset-card')!;
      const format = (card.querySelector('.asset-format') as HTMLSelectElement).value;
      const scale = parseFloat((card.querySelector('.asset-scale') as HTMLSelectElement).value);
      sendExport(id, format, scale);
    });
  });

  document.getElementById('export-all-btn')?.addEventListener('click', () => {
    const items = collectExportItems();
    if (items.length) sendExportBatch(items);
  });
}

function renderExport(): void {
  if (!currentData) {
    exportContent.innerHTML = '<div class="empty-state">Select a layer to export</div>';
    return;
  }

  const assets = exportTab === 'filtered'
    ? (currentData.filteredAssets ?? [])
    : (currentData.allAssets ?? []);

  if (!assets.length) {
    const msg = exportTab === 'filtered'
      ? 'No icons or images detected in this selection'
      : 'No exportable layers found';
    exportContent.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  let html = `
    <div class="export-toolbar">
      <span class="export-toolbar-left">${assets.length} item${assets.length === 1 ? '' : 's'}</span>
      <button class="export-all-btn" id="export-all-btn">Export all (${assets.length})</button>
    </div>`;

  for (const asset of assets) {
    html += renderAssetCard(asset);
  }

  exportContent.innerHTML = html;
  bindExportEvents();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginToUI;
  if (!msg) return;

  switch (msg.type) {
    case 'NO_SELECTION':
      currentData = null;
      currentVariables = [];
      currentColors = [];
      emptyState.textContent = 'Select a layer to inspect';
      emptyState.classList.remove('hidden');
      inspectDataEl.classList.add('hidden');
      renderExport();
      break;

    case 'MULTI_SELECTION':
      currentData = null;
      emptyState.textContent = 'Select a single layer';
      emptyState.classList.remove('hidden');
      inspectDataEl.classList.add('hidden');
      renderExport();
      break;

    case 'INSPECT_DATA':
      currentData = msg.data;
      currentVariables = msg.variables;
      currentColors = msg.colors;
      render();
      renderExport();
      break;

    case 'EXPORT_RESULT': {
      const blob = new Blob([new Uint8Array(msg.bytes)], { type: msg.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.filename;
      a.click();
      URL.revokeObjectURL(url);
      break;
    }
  }
};

// Resize observer
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    parent.postMessage(
      { pluginMessage: { type: 'RESIZE', width: entry.contentRect.width, height: entry.contentRect.height + 90 } },
      '*'
    );
  }
});
ro.observe(document.body);

window.addEventListener('beforeunload', () => {
  parent.postMessage({ pluginMessage: { type: 'PLUGIN_CLOSED' } }, '*');
});

/// <reference types="@figma/plugin-typings" />

export type ExportFormat = 'SVG' | 'PNG' | 'PDF';

export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'SVG':
      return 'image/svg+xml';
    case 'PNG':
      return 'image/png';
    case 'PDF':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export async function exportNode(
  node: SceneNode,
  format: ExportFormat,
  scale: number = 1
): Promise<{ bytes: Uint8Array; filename: string; mimeType: string }> {
  const settings: ExportSettings =
    format === 'PNG'
      ? { format: 'PNG', constraint: { type: 'SCALE', value: scale } }
      : { format };

  const bytes = await node.exportAsync(settings);
  const safeName = node.name.replace(/[/\\?%*:|"<>]/g, '-');
  return {
    bytes,
    filename: `${safeName}.${format.toLowerCase()}`,
    mimeType: getMimeType(format),
  };
}


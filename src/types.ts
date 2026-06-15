export type ColorFormat = 'HEX' | 'RGB' | 'HSL' | 'CSS var';
export type CodePlatform = 'css' | 'ios' | 'android' | 'flutter';

export interface ResolvedVariable {
  name: string;
  cssName: string;
  collection: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';
  value: unknown;
  modeId?: string;
}

export interface ColorUsage {
  usage: 'fill' | 'stroke' | 'text' | 'background' | 'border';
  nodeName: string;
}

export interface GroupedColorEntry {
  hex: string;
  rgba: string;
  variable: ResolvedVariable | null;
  usages: ColorUsage[];
}

export interface BoxModelData {
  contentWidth: number;
  contentHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  borderTop: number;
  borderRight: number;
  borderBottom: number;
  borderLeft: number;
  radiusTl: number;
  radiusTr: number;
  radiusBr: number;
  radiusBl: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
}

export interface SerializablePaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: { r: number; g: number; b: number };
  gradientStops?: Array<{ position: number; color: { r: number; g: number; b: number; a?: number } }>;
  gradientTransform?: number[][];
}

export interface SerializableEffect {
  type: string;
  visible?: boolean;
  radius?: number;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
  spread?: number;
}

export interface InspectData {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  layoutAlign?: string;
  parentLayoutMode?: string;

  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'GRID' | 'NONE';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutWrap?: string;

  fills: SerializablePaint[];
  strokes: SerializablePaint[];
  strokeWeight?: number;
  cornerRadius?: number | 'MIXED';
  cornerRadii?: { tl: number; tr: number; br: number; bl: number };
  opacity?: number;
  effects: SerializableEffect[];

  fontFamily?: string | 'MIXED';
  fontStyle?: string | 'MIXED';
  fontSize?: number | 'MIXED';
  fontWeight?: number | 'MIXED';
  lineHeight?: { unit: string; value?: number } | 'MIXED';
  letterSpacing?: { unit: string; value?: number } | 'MIXED';
  textAlignHorizontal?: string | 'MIXED';
  textDecoration?: string | 'MIXED';

  boundVariables: Record<string, { id: string; type?: string }>;
  masterComponentName?: string;

  exportSettings?: Array<{ format: string; constraint?: { type: string; value: number } }>;
  allAssets?: AssetEntry[];
  filteredAssets?: AssetEntry[];
  boxModel?: BoxModelData;
}

export interface AssetEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  kind: 'icon' | 'image' | 'other';
  nodeType: string;
  depth: number;
  hasExportSettings: boolean;
}

export type PluginToUI =
  | { type: 'INSPECT_DATA'; data: InspectData; variables: ResolvedVariable[]; colors: GroupedColorEntry[] }
  | { type: 'NO_SELECTION' }
  | { type: 'MULTI_SELECTION' }
  | { type: 'EXPORT_RESULT'; bytes: number[]; filename: string; mimeType: string };

export type UIToPlugin =
  | { type: 'EXPORT_REQUEST'; nodeId: string; format: string; scale: number }
  | { type: 'EXPORT_BATCH_REQUEST'; items: Array<{ nodeId: string; format: string; scale: number }> }
  | { type: 'TOGGLE_SPACING'; enabled: boolean }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'COPY_CSS'; section: 'layout' | 'style' | 'typography' | 'all' }
  | { type: 'PLUGIN_CLOSED' };

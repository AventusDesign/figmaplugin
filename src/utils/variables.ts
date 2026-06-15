/// <reference types="@figma/plugin-typings" />

import type { ResolvedVariable } from '../types';

export function toCSSVarName(name: string): string {
  return '--' + name.replace(/\//g, '-').replace(/\s+/g, '-');
}

export async function resolveVariable(alias: VariableAlias): Promise<ResolvedVariable | null> {
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
      resolvedType: variable.resolvedType as ResolvedVariable['resolvedType'],
      value,
      modeId,
    };
  } catch {
    return null;
  }
}

export async function resolveAllVariables(
  boundVariables: Record<string, VariableAlias | VariableAlias[]>
): Promise<ResolvedVariable[]> {
  const results: ResolvedVariable[] = [];
  const seen = new Set<string>();

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

export async function resolveVariableById(id: string): Promise<ResolvedVariable | null> {
  return resolveVariable({ id, type: 'VARIABLE_ALIAS' });
}

export function getCollectionModes(collection: VariableCollection): Array<{ id: string; name: string }> {
  return collection.modes.map((m) => ({ id: m.modeId, name: m.name }));
}

export async function resolveVariableForMode(
  alias: VariableAlias,
  modeId: string
): Promise<ResolvedVariable | null> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(alias.id);
    if (!variable) return null;
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    if (!collection) return null;

    return {
      name: variable.name,
      cssName: toCSSVarName(variable.name),
      collection: collection.name,
      resolvedType: variable.resolvedType as ResolvedVariable['resolvedType'],
      value: variable.valuesByMode[modeId] ?? variable.valuesByMode[collection.defaultModeId],
      modeId,
    };
  } catch {
    return null;
  }
}

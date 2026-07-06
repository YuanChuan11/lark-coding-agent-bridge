import {
  buildDefaultClaudeModelArgs,
  resolveClaudeBridgeVariant,
} from '../../agent/claude/variant.js';
import type { VariantSnapshot } from './types.js';

export function readVariantSnapshot(): VariantSnapshot {
  const variant = resolveClaudeBridgeVariant();
  const args = buildDefaultClaudeModelArgs(variant);
  const snapshot: VariantSnapshot = {
    settingsPaths: [],
    forcedModelArgs: [],
    ...(variant ? { name: variant } : {}),
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--effort') {
      const next = args[i + 1];
      if (typeof next === 'string') snapshot.effort = next;
      i += 1;
      continue;
    }
    if (token === '--settings') {
      const next = args[i + 1];
      if (typeof next === 'string') snapshot.settingsPaths.push(next);
      i += 1;
      continue;
    }
    if (token === '-force-use-model') {
      for (let j = i + 1; j < args.length; j += 1) {
        const candidate = args[j];
        if (!candidate || candidate.startsWith('-')) break;
        snapshot.forcedModelArgs.push(candidate);
      }
      continue;
    }
  }

  return snapshot;
}

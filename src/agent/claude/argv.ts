import type { ClaudePermissionMode } from '../../config/permissions.js';
import { CLAUDE_DEFAULT_PERMISSION_MODE } from '../types.js';
import { buildDefaultClaudeModelArgs } from './variant.js';

/** Placeholder shown in `/model` spawn preview (real path is a per-run temp file). */
export const CLAUDE_SYSTEM_PROMPT_FILE_PLACEHOLDER =
  '<tmp>/lark-claude-*/append-system-prompt.md';

export interface BuildClaudeArgvInput {
  permissionMode?: ClaudePermissionMode;
  sessionId?: string;
  model?: string;
  systemPromptFile?: string;
}

/** Build `claude` argv for a bridge agent run (prompt is passed via stdin, not argv). */
export function buildClaudeArgv(input: BuildClaudeArgvInput = {}): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    input.permissionMode ?? CLAUDE_DEFAULT_PERMISSION_MODE,
    '--append-system-prompt-file',
    input.systemPromptFile ?? CLAUDE_SYSTEM_PROMPT_FILE_PLACEHOLDER,
  ];
  if (input.sessionId) {
    args.push('--resume', input.sessionId);
  }
  if (input.model) {
    args.push('--model', input.model);
  } else {
    args.push(...buildDefaultClaudeModelArgs());
  }
  return args;
}

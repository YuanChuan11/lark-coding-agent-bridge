# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`lark-channel-bridge` (npm package name) bridges Feishu/Lark messenger with a local `claude` CLI. It connects to Lark's open platform over a long-lived WebSocket, forwards inbound chat messages to a spawned `claude` subprocess, and streams the agent's output back as a live-updating Lark card. The published binary is `lark-channel-bridge`.

## Commands

```bash
pnpm dev          # tsup --watch (rebuild on change)
pnpm build        # tsup → dist/ (two entries: cli.js bundle + index.js library w/ dts)
pnpm typecheck    # tsc --noEmit (strict mode)
pnpm test         # vitest run
prepublishOnly    # runs typecheck + build (gate before npm publish)
```

- Single test: `pnpm vitest run path/to/file.test.ts` or `pnpm vitest run -t "name"`.
- Test files are **gitignored** (`tests-smoke/`, `scripts/` are local-only per `.gitignore`) — there are no committed tests, but `vitest` is the configured runner and `tsconfig` includes `test/**/*.ts`.
- Package manager is **pnpm** (see `pnpm-lock.yaml`); Node **>= 20** required.
- `command grep` instead of `grep` in this shell — `grep` is aliased to `ugrep` and rejects standard flags. Same for `find` (aliased to `bfs`); prefer `git ls-files`.

## Runtime CLI surface (`src/cli/index.ts`)

Two command tiers:
- **Process-level**: `run` (foreground bridge), `ps`, `kill <id>`.
- **Service-level** (OS daemon): `start`, `stop`, `restart`, `status`, `unregister` — wraps launchd (macOS) / systemd (Linux) / schtasks (Windows) via `src/daemon/service-adapter.ts`.
- **`secrets`** subcommands implement the openclaw exec-provider protocol so `lark-cli` can resolve the encrypted App Secret.

## Architecture

The message path is the spine of the codebase. Read it in this order:

1. **`src/cli/commands/start.ts`** — `runStart()` is the boot sequence: load/migrate config → encrypt plaintext secrets → preflight → load telemetry → construct `ClaudeAdapter` + `SessionStore` + `WorkspaceStore` → register in process registry → `startChannel()`. Holds `Controls` (restart/exit/config) used for in-process hot-reload (`/account`, `/reconnect`).

2. **`src/bot/channel.ts`** — `startChannel()` wires the Lark SDK `LarkChannel` event handlers. **`intakeMessage()`** runs access control + group-mention policy + command dispatch, then pushes to the `PendingQueue`. **`runAgentBatch()`** is where a coalesced batch becomes a `claude` run: builds the prompt, resolves the session to resume, spawns the agent, and streams `RunState` into a card. **`processAgentStream()`** drives the agent event loop and the idle watchdog.

3. **Concurrency / batching model** (critical to understand before touching message handling):
   - `PendingQueue` (`src/bot/pending-queue.ts`) debounces (600ms) and coalesces rapid messages per **scope** into one batch. While a run is active on a scope, its queue is **blocked** so new messages accumulate into the next batch.
   - `ProcessPool` (`src/bot/process-pool.ts`) caps concurrent runs across the whole bridge (`preferences.maxConcurrentRuns`, re-read per acquire).
   - `ActiveRuns` (`src/bot/active-runs.ts`) tracks the in-flight run per scope so `/stop` and preemption can interrupt it.
   - **Scope** (`src/bot/scope.ts`): `chatId` for p2p/regular groups; `${chatId}:${threadId}` for topic groups (each topic = independent session/cwd). Everything keys off scope, never raw `chatId`.

4. **Agent layer** (`src/agent/`) — `AgentAdapter` interface (`types.ts`) abstracts the coding agent. `ClaudeAdapter` (`claude/adapter.ts`) spawns `claude -p <prompt> --output-format stream-json --permission-mode bypassPermissions --append-system-prompt <BRIDGE_SYSTEM_PROMPT>`. `stream-json.ts` translates claude's NDJSON into normalized `AgentEvent`s. The large `BRIDGE_SYSTEM_PROMPT` constant teaches claude the bridge's conventions (`<bridge_context>` injection, `__claude_cb` callback cards, the `lark-cli auth login` foreground-blocking OAuth flow).

5. **Card rendering** (`src/card/`) — `run-state.ts` is a reducer: `reduce(state, AgentEvent)` folds agent events into an immutable `RunState`. `run-renderer.ts` / `text-renderer.ts` render that state into the three reply modes (`card` / `markdown` / `text`, see `MessageReplyMode`). `dispatcher.ts` routes card-button clicks back into command handlers.

6. **Commands** (`src/commands/index.ts`) — `tryHandleCommand()` dispatches `/`-prefixed messages. `ADMIN_COMMANDS` (gated on `isAdmin`) cover anything that mutates credentials, lifecycle, or filesystem reach. Card buttons re-enter via `runCommandHandler()`. Unrecognized `/xxx` is forwarded verbatim to claude.

7. **Config & secrets** (`src/config/`) — `schema.ts` is the source of truth for `AppConfig` + all `get*(cfg)` preference accessors + access-control predicates (`isUserAllowed` / `isChatAllowed` / `isAdmin`). Secrets never sit in `config.json` as plaintext: `keystore.ts` (encrypted `secrets.enc`), `secret-resolver.ts` (env/file/exec `SecretRef` resolution), `store.ts` (load/save + plaintext→encrypted migration). Data lives under `~/.lark-channel/` (`paths.ts`).

8. **Persistence** — `SessionStore` (`src/session/store.ts`) maps scope → claude session id + cwd (resumes conversations). `WorkspaceStore` (`src/workspace/store.ts`) maps named workspaces → directories. `runtime/registry.ts` tracks live bridge processes (backs `ps`/`kill` and same-app conflict detection).

## Conventions that matter

- **Access control is fail-secure and silent.** Unauthorized messages are dropped with no reply (replying would reveal the bot). The "creator" identity is the Lark app owner fetched at runtime (`controls.botOwnerId`) — there's no creator field in config. When the owner fetch hasn't landed yet, only explicit whitelists apply. Logic lives in `schema.ts`; don't bypass it.
- **Never crash the bot for one failed reply.** `start.ts` installs `unhandledRejection`/`uncaughtException` handlers that log + keep running. Outbound send sites swallow errors. Preserve this — losing a single message beats taking the process down.
- **Hot-reload over restart.** `/account` and `/reconnect` call `controls.restart()`, which connects a new `LarkChannel` *before* disconnecting the old one (so a failed reconnect leaves the working bridge intact). Stores and the agent adapter are reused across restarts.
- **Telemetry is opt-in and inert by default** (`src/core/telemetry.ts`). It only activates when `LARK_CHANNEL_TELEMETRY_MODULE` points at an adapter module; a bad/throwing adapter degrades to noop and must never break startup or logging. The package zero-deps on telemetry. Public types are re-exported from `src/index.ts`.
- **Structured logging**: use `log.info/warn/fail` + `withTrace` from `src/core/logger.ts` (JSONL to `~/.lark-channel/logs/`, read by `/doctor`). `reportMetric` / `reportError` feed telemetry.
- **Path alias** `@/*` → `src/*` (tsconfig). ESM-only (`"type": "module"`), `verbatimModuleSyntax` is on — use `import type` for type-only imports.

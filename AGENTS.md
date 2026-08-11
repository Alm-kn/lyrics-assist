# AGENTS.md

## Project

Japanese lyric-writing assistance web application.
v0.1 is a personal-use beta for validating candidate generation and scoring quality.

## Source of truth

Read these before implementation:

1. `docs/requirements-v0.1.md`
2. `docs/system-design-v0.1.md`
3. `docs/decisions.md`
4. `docs/implementation-plan-v0.1.md`
5. `docs/roadmap.md`

Requirements and accepted design decisions take precedence over implementation convenience.
If code changes would alter product behavior or scoring semantics, do not silently change the design.
Stop and report the proposed design change.

## v0.1 stack

- Node.js 24 LTS
- Next.js App Router
- React
- TypeScript
- Next.js Route Handlers
- CSS Modules / Global CSS
- Zod
- SQLite
- Drizzle ORM
- Vitest
- Playwright
- OpenAI Responses API + Structured Outputs
- npm
- Git

The concrete OpenAI model is not fixed. Access it through the LLM adapter and configuration.

## Architecture rules

- Keep deterministic phonetic logic independent from LLM logic.
- `ReadingResolver`, `RhymeNormalizer`, `SoundScorer`, and `CandidateSelector` must be independently testable.
- Do not hard-code scoring weights or selector ratios. Use versioned configuration.
- Preserve raw readings, normalized values, score breakdowns, and config/model/prompt versions for beta analysis.
- Keep external LLM calls behind `LLMService` / adapter interfaces.
- Do not expose API keys or secrets to browser-side code.
- Do not add user/account complexity beyond what v0.1 requires.

## Candidate Selector v0.1

Target composition:

- Balanced: 4
- Sound-focused: 3
- Semantic-focused: 3

This is a beta configuration, not a permanent invariant.
Use `SelectionConfig` and preserve its version.

## Workflow

Follow `docs/implementation-plan-v0.1.md`.

- Work on one milestone per task unless explicitly instructed otherwise.
- Do not automatically continue into the next milestone.
- Before changing architecture or product behavior, explain the issue and proposed change.
- Prefer small, reviewable diffs.
- Do not add a production dependency unless it has a clear benefit and fits the documented stack.

## Verification

Before declaring a task complete, run the checks relevant to the milestone.

At minimum when available:

```bash
npm run lint
npm run typecheck
npm test
```

For UI/E2E milestones, also run the appropriate Playwright tests.

Report:

1. files changed
2. behavior implemented
3. commands/tests run and their results
4. design deviations, if any
5. remaining issues or assumptions

## Code review rules

- Flag any change that makes phonetic scoring depend directly on an LLM.
- Flag hard-coded scoring weights or 4/3/3 selector values outside versioned config.
- Flag loss of raw/intermediate beta-analysis data.
- Flag browser exposure of OpenAI API keys or other secrets.
- Flag implementation that bypasses documented domain module boundaries without a stated reason.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

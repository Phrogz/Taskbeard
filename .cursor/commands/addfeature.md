# Add Feature Workflow

You are following a structured multi-phase feature workflow. The user's feature description is provided as additional context after the `/addfeature` command. Execute these steps in order, using the specified model at each phase.

## Step 1: Plan the Feature

**Model: claude-4.6-opus-max (thinking)**

0. Switch the agent into Plan mode.
1. Restate the feature request in your own words.
2. Launch `explore` subagents (readonly) to gather context from the codebase and documentation — particularly `docs/full-plan.md`, `docs/todo.md`, and any source files related to the feature.
3. Produce a detailed implementation plan covering:
   - Files to create or modify.
   - Data model changes (YAML schemas, backend models).
   - API endpoint changes.
   - Frontend component changes.
   - Test strategy (unit tests, E2E if applicable).
4. Present the plan to the user and **wait for confirmation** before proceeding. Do not move to Step 2 until the user approves.

## Step 2: Implement Using Subagents

**Model for subagents: claude-4.5-sonnet**

1. Break the approved plan into discrete, parallelizable work units (e.g., backend API, frontend components, tests).
2. Launch `generalPurpose` subagents with `model: "claude-4.5-sonnet"` for each work unit. Provide each subagent with:
   - The full approved plan.
   - The specific subset of work it is responsible for.
   - File paths and relevant code context from Step 1.
3. After all subagents complete, verify the changes:
   - Check for linter errors on all modified files.
   - **Frontend**: `npm run test` from `frontend/`.
   - **Backend**: `uv run pytest` from the project root.
   - **Frontend E2E** (if applicable): `cd frontend && npx playwright test --reporter=line` (requires `required_permissions: ["all"]`).
4. If tests fail, analyze the failure and iterate. **Maximum 3 attempts** per failing area — if still failing after 3 tries, stop and explain the situation to the user.

## Step 3: Update Documentation

**Model: claude-4.6-opus-max (non-thinking)**

1. Update `docs/full-plan.md`: add a concise summary of what was built to the "Recently Implemented" section.
2. Update `docs/todo.md`: check off any items addressed by this feature; add new items if the feature is only partially complete.
3. Update `README.md` if the feature changes user-facing behavior, UI layout, CLI commands, or data file formats.

Skip documentation updates only if the feature is purely internal with no user-visible or architectural impact.

## Step 4: Self-Review Pass

**Model for subagent: gpt-5.3-codex (thinking)**

1. Launch a **readonly** `generalPurpose` subagent with `model: "gpt-5.3-codex"` to review all changes made in Steps 2–3.
2. The review subagent should evaluate:
   - Missed edge cases or error handling gaps.
   - Naming inconsistencies with existing code conventions.
   - Unnecessary complexity that could be simplified.
   - Missing or insufficient test coverage.
   - Accessibility issues in frontend changes.
   - Potential regressions to existing functionality.
3. Present the review findings as a summary. Apply straightforward improvements (typos, naming fixes, missing null checks) automatically. Flag anything non-trivial for the user to decide on.

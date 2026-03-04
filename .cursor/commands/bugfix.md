# Bugfix Workflow

You are following a structured TDD bugfix workflow. The user's bug report is provided as additional context after the `/bugfix` command. Execute these steps in order.

## Step 1: Understand the Bug

- Restate the bug in your own words; do not look for the root cause, only that you understand the problem being experienced.
- Confirm your understanding with the user before proceeding. Do not move to Step 2 until the user confirms.

## Step 2: Write a Failing Unit Test

Determine whether this is a frontend or backend bug:

- **Frontend**: Vitest + Testing Library. Place the test in the existing `*.test.{ts,tsx}` file next to the affected component under `frontend/src/`. If no test file exists for that component, create one following the naming convention `ComponentName.test.tsx`.
- **Backend**: pytest. Place the test in the existing `test_*.py` file under `tests/backend/`. If no test file exists, create one following the naming convention `test_module_name.py`.

Write a minimal, focused test that reproduces the reported bug. Name the test to describe the **expected correct behavior** (e.g., `it("should persist task name on save")`, not `it("bug #42")`).

## Step 3: Run the Test and Confirm It Fails

Run only the new test:

- **Frontend**: `npm run test -- --reporter=verbose <test-file>` from the `frontend/` directory.
- **Backend**: `pytest <test-file>::<test_name> -v` from the project root.

Verify that:

1. The test **fails** (not passes).
2. The failure is due to the bug, not a syntax error, import error, or test setup issue.

If the test passes, the test does not reproduce the bug. Reassess with the user.

**Playwright/E2E**: If the bug can only be reproduced with a Playwright E2E test (not a unit test), follow the Playwright rule conventions: use `required_permissions: ["all"]` on all Shell calls, and check for installed browsers before running tests.

## Step 4: Analyze Root Cause

Launch a readonly subagent to analyze the root cause:

```py
Task(subagent_type="explore", readonly=true)
```

Prompt the subagent to:

- Trace the code path involved in the bug.
- Identify the affected component, module, or file.   
- Identify the **root cause**, not just the symptom.
- Propose a specific, minimal fix strategy.

Use the subagent's analysis to guide your implementation. Do not skip this step.

## Step 5: Implement the Fix and Iterate

1. Apply the fix based on the root cause analysis.
2. Re-run the failing test from Step 3.
3. If the test still fails, analyze why and iterate. **Maximum 3 attempts** — if the test still fails after 3 tries, stop and explain the situation to the user.
4. Once the test passes, run the full relevant test suite to check for regressions:
   - **Frontend**: `npm run test` from `frontend/`
   - **Backend**: `pytest` from the project root

   - **Frontend E2E**: `cd frontend && npx playwright test --reporter=line` (requires `required_permissions: ["all"]`)

If regressions are found, fix them before proceeding.

## Step 6: Update Documentation

Check whether documentation needs updating:

- **`docs/bugs.md`**: If the bug is listed there, mark it as resolved.
- **`docs/todo.md`**: If there is a related todo item, update it.

Skip documentation updates for trivial internal fixes that have no user-visible or architectural impact.

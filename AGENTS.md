## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- Think long-term: avoid quick fixes that create future maintenance traps.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not create audit, TODO, plan, or summary files unless the user explicitly asks for a file.
- Don't "improve" adjacent code, comments, or formatting.
- Keep code, comments, test names, test fixture text, and non-user-facing strings in English.
- User-facing copy may use the product's target language, but internal diagnostics and tests stay English.
- Do not add automatic client-side diagnostic or telemetry uploads unless the user explicitly asks.
- Use fake or randomized test emails, IPs, URLs, and tokens; never real personal or service values.
- Do not add native hover tooltip text such as `title` attributes by default; only add them when explicitly requested.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

When debugging with logs:
- Do not add enable/disable switches unless explicitly requested.
- When the user says the issue is fixed, do a broader check for similar failure paths before closing.
- If a fix took several attempts, review the full diff and revert any leftover workaround that no longer belongs.
- After the fix is verified, remove temporary diagnostic logs and test noise.

Verification:
- Treat a failing test as evidence to investigate, not as an automatic command to bend production code toward the old assertion.
- First decide whether the failure is a real regression, an intentional behavior change with outdated tests, a brittle test that asserts implementation details, or a mix of those.
- Fix production code when the test exposes broken behavior. Update tests when the intended behavior changed and the old expectation is stale.
- Do not add compatibility hacks, preserve obsolete behavior, or make production code worse only to satisfy an outdated test.
- Do not run type checks by default. Run them only when type/API risk is high or the user asks.
- Do not run the full local test suite by default. Full-suite coverage belongs to GitHub Actions; locally, run only the tests directly relevant to the changed code unless the user explicitly asks for a broader run.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Keep Files Concise

**Target a maximum of 300 lines for hand-written business source files.**

Do not split mechanically by line count alone. Split files that are over 300 lines and mix real business responsibilities; skip generated files, declarations, large fixtures, and dense data tables when splitting would reduce clarity.

After every split, restore normal behavior before moving on: keep public imports/exports, global handlers, button wiring, request paths, payloads, responses, and user-visible behavior unchanged unless explicitly requested. Verify with focused tests or the narrowest practical syntax/runtime check, adding coverage when needed.

## 6. Commit Messages

**Use emoji + conventional keyword + scope.**

Commit only when explicitly requested. Wrap-up or verification requests are not commit permission.

When creating commits:
- Only commit when the user explicitly asks for a commit.
- Format commit messages as `emoji type(scope): subject`.
- Keep the subject short, imperative, and specific.
- Match the type to the change, such as `fix`, `feat`, `refactor`, `test`, `docs`, `chore`.
- Example: `🐛fix(shortcuts): block background shortcuts while dialogs are focused`

For explicit commit-only requests, use the fast path:
- Run at most one pre-commit command: `git status --short`.
- Do not run `git diff`, `git diff --stat`, `git diff --cached`, `git log`, tests, type checks, or extra investigation.
- Do not provide explanatory progress updates.
- If `git status --short` shows only files from the current task, run `git add . && git commit -m "<message>"`.
- If unrelated files are present, run `git add <known current-task files...> && git commit -m "<message>"`.
- After issuing the commit command, stop. Do not poll, verify success or failure, run more commands, or summarize the commit; the user can see the command output.

## 7. Merge Conflicts

Before resolving conflicts:
- Confirm the current worktree, branch, merge direction, and common ancestor.
- Treat the newer side as a baseline hypothesis, not an overwrite rule; do not infer precedence from timestamps or `ours`/`theirs` labels.
- Compare both sides against the common ancestor, including callers, types, tests, and surrounding commits.

When resolving conflicts:
- Preserve additive changes from both sides.
- For a refactor versus a fix, port the fix onto the refactored code.
- If behavior is incompatible and evidence is insufficient, ask the user.
- Never blindly choose `ours` or `theirs`; do not reset, checkout, or abort unless explicitly requested.
- Stage only resolved paths; do not use `git add .` when unrelated changes may exist. Do not commit unless explicitly requested.

After resolving, verify:
- No unmerged paths or conflict markers remain.
- `git diff --check` passes and the staged result preserves required behavior from both sides.
- Relevant tests pass; run type checks when shared APIs or types changed.
- No unintended unstaged changes remain.

## 8. Local Milkdown Vendor

**`vendor/milkdown` is fully maintained locally.**

When a task involves Milkdown behavior, schemas, commands, plugins, or editor internals:
- Inspect and modify `vendor/milkdown` directly when that is the correct layer.
- Treat `vendor/milkdown` as source code, not an external dependency to work around.
- If the bug or behavior originates in Milkdown, fix it at the Milkdown source first instead of masking it in app-level CSS, plugins, or adapters.
- Do not avoid vendor changes by adding workaround code in app-level editor plugins.
- Keep vendor edits as surgical as any other code change, and verify them with the most relevant app and vendor-facing tests.

## 9. Markdown Editor Compatibility

**Every custom Markdown AST node must be editable.**

When changing notes Markdown parsing, rendering, or remark plugins:
- If remark creates a custom node or mark, add the matching Milkdown `parseMarkdown` schema/mark.
- Keep main editor plugin config and round-trip test editor config in sync.
- Add a focused compatibility test that opens the syntax in Milkdown.
- Preserve a source-edit fallback for editor creation failures; do not let one bad node make the note blank.

## 10. Theme Contract

**Keep appearance values centralized.**

- Put app theme CSS variables in `src/styles/theme.css`.
- Put runtime style constants in `src/styles/themeTokens.ts`.
- Do not scatter raw colors, z-index, opacity, scale, shadows, radii, motion, or appearance sizes in components.
- Run `node scripts/theme-audit.mjs` after theme-related changes.

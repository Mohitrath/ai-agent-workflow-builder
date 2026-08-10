# Design Write-up

## Schema reasoning

The schema follows the relationship chain the assignment specifies exactly:
`organizations → org_members → workflows → workflow_steps / workflow_triggers`,
and `workflows → workflow_runs → step_runs`. A few deliberate choices:

- **`workflow_runs.org_id` is denormalized** (also derivable via
  `workflow_id → workflows.org_id`). Every permission filter in this system
  ultimately bottoms out in "does the caller have a row in `org_members`
  for this org", and that check runs on nearly every query. Denormalizing
  `org_id` onto runs turns a three-hop relationship traversal into a
  one-hop join for the highest-traffic table (the live subscription target),
  at the one-time cost of setting it correctly when the run is created.
- **`step_runs` carries `input`/`output`/`error`/`attempt_count`/`approved_by`/`approved_at`**
  directly, rather than splitting approval metadata into a side table.
  Approval is a state a step passes through, not a separate entity — and
  keeping it on the row the subscription already watches means the
  frontend's "paused, awaiting approval" UI needs zero extra joins.
- **`workflow_data` and `notification_events` are separate tables**, not
  columns on `step_runs`. `db_write` output should be queryable/joinable
  as first-class data ("what did this workflow ever write"), and
  `notification_events` exists specifically to be the Event Trigger's
  target — the step engine only ever *inserts* there; delivery is a
  separate, retryable, asynchronous concern.
- **Two aggregations**: `org_usage_view` (simple view, cheap) for
  org-level usage, and `workflow_avg_run_duration_seconds` as a Hasura
  *computed field* (a `stable` SQL function taking the row type) for
  per-workflow average duration — chosen to show both aggregation
  mechanisms the assignment names, applied where each fits best.

## How the two permission layers are enforced differently

**Layer 1 (org + role scoping)** is enforced entirely declaratively, in
Hasura's permission YAML, as boolean expressions over relationships. Every
select/insert/update/delete permission on every table walks up to
`organization.org_members` and requires a row where `user_id` equals the
caller's session variable — role alone is never sufficient, because the
expression is *always* anchored to `X-Hasura-User-Id` matching a specific
org's membership table, not a static claim. This is why cross-org access
fails even against direct ID guessing: an Org B user querying Org A's
`workflow_id` gets an empty result, not a 403 — there is no membership row
to satisfy the `EXISTS` the permission compiles to, so the row is
invisible, full stop.

**Layer 2 (step-type gating)** is split across two mechanisms depending on
whether the decision is a static row property or a live business decision:

- For `db_write`, `notify`, and `webhook` trigger creation — properties
  fully known at write time — it's still a declarative Hasura permission,
  but conditioned on the *new row's own column* (`type`) via an `_or`
  inside the `check`/`filter` expression: "either this isn't a restricted
  type, or the caller is specifically an owner." This keeps it in the
  database layer, which is appropriate since it's a pure row-validity
  question.
- For clearing an `approval_gate`, a database permission can't work: the
  decision isn't "can this row be written", it's "should a paused
  execution be resumed", which requires reading the step's current state,
  verifying it's actually paused, checking the approver's live role, and
  then driving multi-table writes (mark the step succeeded, flip the run
  back to running, continue executing subsequent steps) — all inside one
  handler invocation. `approveStep` is therefore a Hasura Action whose *handler code*
  (`functions/approve-step.ts`) re-derives the caller's org membership from
  `session_variables` and asserts `owner`/`editor` before doing anything,
  using the admin secret only after that check passes. The Action's Hasura
  permission is deliberately coarse (any `user` role may call it) precisely
  because the fine-grained, mid-execution check has to happen in code.

## Approval-gate pause/resume implementation

The step engine (`functions/_lib/engine.ts`) executes an ordered array of
steps in a single loop. When it reaches an `approval_gate` step, it sets
that `step_run.status = "paused"`, sets `workflow_run.status = "paused"`,
and **returns immediately** — the loop is not resumed automatically by
anything. Crucially, before pausing, the engine had already written the
previous step's output into the paused step's own `step_runs.input`
column, so all context needed to continue is durably stored, not held in
memory (the function invocation itself ends here; nothing is "waiting").

Resumption is a second, independent invocation: `approveStep` looks up the
step's `workflow_step.step_order`, refetches the full ordered step list,
and calls the same `runSteps()` engine function with `startIndex` set to
one past the approved gate and `previousOutput` seeded from the stored
`input`. This means the exact same execution path (retries, conditional
branching, quota increment on final completion) runs whether a workflow
executes straight through or gets interrupted by N approval gates — pause
and resume are just two different entry points into one loop, not a
special case bolted on.

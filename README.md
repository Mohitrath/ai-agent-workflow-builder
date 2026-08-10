# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on nhost (Postgres + Hasura +
Auth + Functions) + Next.js.

## Repo layout

```
nhost/
  migrations/default/1710000000000_init/up.sql   # full schema
  metadata/                                       # Hasura config (relationships,
                                                    #   both permission layers,
                                                    #   Actions, Event Triggers, cron)
functions/                                        # Action handlers + Event Trigger
                                                    #   handlers + cron handler (Node/TS)
web/                                               # Next.js frontend
README.md
WRITEUP.md                                        # ~1 page design write-up
```

## Prerequisites

- [nhost CLI](https://docs.nhost.io/platform/cli) (`npm i -g nhost`)
- Node 18+
- A free-tier LLM key (Groq recommended — instant sign-up, generous free
  tier, OpenAI-compatible API). **If you don't set one, `llm_call` steps
  fall back to a disclosed stub** (`functions/_lib/llm.ts`) with an
  artificial 800ms delay, so the rest of the system (retries, branching,
  subscriptions, approval gate) still runs end-to-end without a key.

## Local setup

1. **Start the backend**
   ```bash
   cd nhost
   nhost up
   ```
   This applies `migrations/` and `metadata/` automatically and gives you
   local Hasura Console + GraphQL endpoints.

2. **Set secrets** (nhost Cloud: Project Settings → Environment Variables;
   local: `nhost/.secrets`) — see `.env.example` at repo root for the full
   list. At minimum: `NHOST_ADMIN_SECRET`, `NHOST_GRAPHQL_URL`, and the
   five `NHOST_FUNCTIONS_*_URL` variables (once functions are deployed —
   see below, chicken-and-egg on first deploy: deploy once, copy the URLs
   nhost prints, set the env vars, redeploy metadata).

3. **Deploy functions** — the `functions/` directory is auto-detected by
   `nhost up` / `nhost deploy`; each file becomes
   `https://<subdomain>.functions.<region>.nhost.run/v1/<filename>`.
   ```bash
   cd functions && npm install
   ```

4. **Run the frontend**
   ```bash
   cd web
   npm install
   cp .env.example .env.local   # fill in NEXT_PUBLIC_NHOST_SUBDOMAIN / REGION
   npm run dev
   ```

## Deploying

- **Backend**: `nhost deploy` from the `nhost/` directory pushes
  migrations + metadata + functions to nhost Cloud.
- **Frontend**: push `web/` to a Vercel project, set
  `NEXT_PUBLIC_NHOST_SUBDOMAIN` / `NEXT_PUBLIC_NHOST_REGION` as env vars.

## Demonstrating the Final Task scenario

1. Sign up two users, each creating their own org ("Org A", "Org B") from
   the dashboard's "+ Create org" — the creator becomes `owner`
   automatically (see `WRITEUP.md` on the bootstrap permission).
2. Add a second user to Org A as `editor` or `viewer` via `org_members`
   (owner can do this from the Hasura Console until a members-management
   UI screen is added — out of scope for the time budget here, noted as a
   known gap below).
3. In Org A, build a workflow with steps in this order:
   - `llm_call` — e.g. `{"prompt": "Say either URGENT or NORMAL for: {{previous_output}}"}`
   - `conditional_branch` — `{"condition": {"path": "text", "operator": "contains", "value": "URGENT"}, "jump_to_step_order": 3}`
   - `approval_gate`
   - `http_request` — any public GET endpoint (e.g. httpbin.org)
4. Add a **webhook** trigger (owner-only) and note the returned secret.
5. Click **Run** — watch the step list update live via the `step_runs`
   subscription with no refresh. Separately, `curl` the webhook URL with
   the secret header to show the second trigger path.
6. When the run reaches `approval_gate`, click **Approve** — the run
   resumes live.
7. Log in as an Org B user and confirm: Org A's workflows never appear in
   the list, and hitting Org A's workflow/run/step-run IDs directly via
   GraphQL returns empty results, not a permission error — there is no
   membership row for them, so the row simply doesn't exist from their
   point of view.

## Known gaps (time-boxed)

- No dedicated "manage org members" screen — done via Hasura Console or
  a direct `org_members` mutation for the demo. The permission layer
  fully supports it (`public_org_members.yaml`); it's a missing UI panel,
  not a missing capability.
- `conditional_branch` uses a minimal dot-path + operator config rather
  than a full expression language.
- Scheduled triggers are evaluated by one meta-cron polling every minute
  rather than one native Hasura cron trigger per workflow, to avoid
  needing to mutate Hasura metadata at runtime when a user creates a
  schedule.

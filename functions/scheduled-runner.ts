import type { Request, Response } from "express";
import parser from "cron-parser";
import { gqlAdmin } from "./_lib/db";
import { createRun, runSteps } from "./_lib/engine";
export default async function handler(_req: Request, res: Response) {
  const now = new Date();
  const data = await gqlAdmin<{ workflow_triggers: { id: string; config: { cron?: string; last_fired_at?: string }; workflow: { id: string; org_id: string; is_active: boolean } }[] }>(`query { workflow_triggers(where: { type: { _eq: "scheduled" }, is_enabled: { _eq: true } }) { id config workflow { id org_id is_active } } }`);
  const results: any[] = [];
  for (const trigger of data.workflow_triggers) {
    if (!trigger.workflow.is_active || !trigger.config?.cron) continue;
    try {
      const interval = parser.parseExpression(trigger.config.cron, { currentDate: trigger.config.last_fired_at ? new Date(trigger.config.last_fired_at) : new Date(now.getTime() - 60_000) });
      const nextDue = interval.next().toDate();
      if (nextDue > now) continue;
      const org = await gqlAdmin<{ organizations_by_pk: { quota_used: number; quota_limit: number } | null }>(`query ($orgId: uuid!) { organizations_by_pk(id: $orgId) { quota_used quota_limit } }`, { orgId: trigger.workflow.org_id });
      if (!org.organizations_by_pk || org.organizations_by_pk.quota_used >= org.organizations_by_pk.quota_limit) { results.push({ trigger_id: trigger.id, skipped: "quota_exhausted" }); continue; }
      const { runId, steps } = await createRun({ workflowId: trigger.workflow.id, orgId: trigger.workflow.org_id, triggeredBy: null, triggerType: "scheduled" });
      const status = steps.length === 0 ? "completed" : await runSteps({ runId, orgId: trigger.workflow.org_id, steps, startIndex: 0, previousOutput: null });
      await gqlAdmin(`mutation ($id: uuid!, $config: jsonb!) { update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config }) { id } }`, { id: trigger.id, config: { ...trigger.config, last_fired_at: now.toISOString() } });
      results.push({ trigger_id: trigger.id, run_id: runId, status });
    } catch (err: any) { results.push({ trigger_id: trigger.id, error: String(err?.message || err) }); }
  }
  res.status(200).json({ checked: data.workflow_triggers.length, fired: results });
}

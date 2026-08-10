import type { Request, Response } from "express";
import { gqlAdmin } from "./_lib/db";
import { createRun, runSteps } from "./_lib/engine";
export default async function handler(req: Request, res: Response) {
  const event = req.body.event;
  const newRow = event.data.new;
  const sourceTable = newRow.source_table as string;
  const data = await gqlAdmin<{ workflow_triggers: { id: string; workflow: { id: string; org_id: string; is_active: boolean } }[] }>(`query ($sourceTable: String!) { workflow_triggers(where: { type: { _eq: "database_event" }, is_enabled: { _eq: true }, config: { _contains: { source_table: $sourceTable } } }) { id workflow { id org_id is_active } } }`, { sourceTable });
  const results = [];
  for (const trigger of data.workflow_triggers) {
    if (!trigger.workflow.is_active) continue;
    const org = await gqlAdmin<{ organizations_by_pk: { quota_used: number; quota_limit: number } | null }>(`query ($orgId: uuid!) { organizations_by_pk(id: $orgId) { quota_used quota_limit } }`, { orgId: trigger.workflow.org_id });
    if (!org.organizations_by_pk || org.organizations_by_pk.quota_used >= org.organizations_by_pk.quota_limit) { results.push({ trigger_id: trigger.id, skipped: "quota_exhausted" }); continue; }
    const { runId, steps } = await createRun({ workflowId: trigger.workflow.id, orgId: trigger.workflow.org_id, triggeredBy: null, triggerType: "database_event" });
    const status = steps.length === 0 ? "completed" : await runSteps({ runId, orgId: trigger.workflow.org_id, steps, startIndex: 0, previousOutput: newRow.payload ?? null });
    results.push({ trigger_id: trigger.id, run_id: runId, status });
  }
  res.status(200).json({ matched: data.workflow_triggers.length, fired: results });
}

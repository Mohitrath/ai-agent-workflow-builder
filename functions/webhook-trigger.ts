import type { Request, Response } from "express";
import { gqlAdmin, HttpError } from "./_lib/db";
import { createRun, runSteps } from "./_lib/engine";
export default async function handler(req: Request, res: Response) {
  try {
    const triggerId = req.params.triggerId;
    const providedSecret = req.header("x-webhook-secret");
    const data = await gqlAdmin<{ workflow_triggers_by_pk: { type: string; is_enabled: boolean; config: { secret?: string }; workflow: { id: string; org_id: string } } | null }>(`query ($id: uuid!) { workflow_triggers_by_pk(id: $id) { type is_enabled config workflow { id org_id } } }`, { id: triggerId });
    const trigger = data.workflow_triggers_by_pk;
    if (!trigger || trigger.type !== "webhook" || !trigger.is_enabled) throw new HttpError(404, "No such active webhook trigger.");
    if (!trigger.config?.secret || trigger.config.secret !== providedSecret) throw new HttpError(401, "Invalid webhook secret.");
    const orgData = await gqlAdmin<{ organizations_by_pk: { quota_used: number; quota_limit: number } | null }>(`query ($orgId: uuid!) { organizations_by_pk(id: $orgId) { quota_used quota_limit } }`, { orgId: trigger.workflow.org_id });
    if (!orgData.organizations_by_pk || orgData.organizations_by_pk.quota_used >= orgData.organizations_by_pk.quota_limit) throw new HttpError(429, "Organization usage quota is exhausted for this period.");
    const { runId, steps } = await createRun({ workflowId: trigger.workflow.id, orgId: trigger.workflow.org_id, triggeredBy: null, triggerType: "webhook" });
    const status = steps.length === 0 ? "completed" : await runSteps({ runId, orgId: trigger.workflow.org_id, steps, startIndex: 0, previousOutput: req.body ?? null });
    res.status(200).json({ run_id: runId, status });
  } catch (err: any) { const status = err instanceof HttpError ? err.status : 500; res.status(status).json({ message: err.message || "Internal error" }); }
}

import type { Request, Response } from "express";
import { gqlAdmin, getUserId, HttpError } from "./_lib/db";
import { getMembershipForWorkflow, assertRole } from "./_lib/permissions";
import { createRun, runSteps } from "./_lib/engine";

/** Hasura Action handler for triggerWorkflowRun. */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getUserId(session_variables);
    const workflowId = input.workflow_id as string;
    const membership = await getMembershipForWorkflow(userId, workflowId);
    assertRole(membership?.role ?? null, ["owner", "editor"], "You do not have permission to trigger this workflow.");
    const orgId = membership!.orgId;
    const orgData = await gqlAdmin<{ organizations_by_pk: { quota_used: number; quota_limit: number } | null }>(`query ($orgId: uuid!) { organizations_by_pk(id: $orgId) { quota_used quota_limit } }`, { orgId });
    const org = orgData.organizations_by_pk;
    if (!org) throw new HttpError(404, "Organization not found.");
    if (org.quota_used >= org.quota_limit) throw new HttpError(429, "Organization usage quota is exhausted for this period.");
    const { runId, steps } = await createRun({ workflowId, orgId, triggeredBy: userId, triggerType: "manual" });
    if (steps.length === 0) { res.status(200).json({ run_id: runId, status: "completed" }); return; }
    const status = await runSteps({ runId, orgId, steps, startIndex: 0, previousOutput: null });
    res.status(200).json({ run_id: runId, status });
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    res.status(status).json({ message: err.message || "Internal error" });
  }
}

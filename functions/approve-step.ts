import type { Request, Response } from "express";
import { gqlAdmin, getUserId, HttpError } from "./_lib/db";
import { getMembershipForStepRun, assertRole } from "./_lib/permissions";
import { runSteps } from "./_lib/engine";

/**
 * Hasura Action handler for `approveStep(step_run_id, approved, comment)`.
 *
 * This is deliberately NOT a database permission: clearing an
 * approval_gate is a mid-execution decision (it resumes a paused run),
 * so the approver's org role is checked here, live, against the step's
 * own organization before anything is written or resumed.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const userId = getUserId(session_variables);
    const stepRunId = input.step_run_id as string;
    const approved = Boolean(input.approved);

    const membership = await getMembershipForStepRun(userId, stepRunId);
    assertRole(membership?.role ?? null, ["owner", "editor"], "You cannot approve this step.");

    const stepData = await gqlAdmin<{ step_runs_by_pk: { status: string; input: any; workflow_step: { step_order: number }; workflow_run: { id: string; org_id: string; workflow_id: string } } | null }>(
      `query ($id: uuid!) { step_runs_by_pk(id: $id) { status input workflow_step { step_order } workflow_run { id org_id workflow_id } } }`,
      { id: stepRunId }
    );
    const stepRun = stepData.step_runs_by_pk;
    if (!stepRun) throw new HttpError(404, "Step run not found.");
    if (stepRun.status !== "paused") throw new HttpError(409, `Step is not awaiting approval (status: ${stepRun.status}).`);

    const runId = stepRun.workflow_run.id;
    const orgId = stepRun.workflow_run.org_id;

    if (!approved) {
      await gqlAdmin(`mutation ($id: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "failed", error: "Rejected by approver", completed_at: "now()" }) { id } }`, { id: stepRunId });
      await gqlAdmin(`mutation ($runId: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "failed", completed_at: "now()" }) { id } }`, { runId });
      res.status(200).json({ step_run_id: stepRunId, workflow_run_id: runId, status: "failed", resumed: false });
      return;
    }

    await gqlAdmin(`mutation ($id: uuid!, $approvedBy: uuid!) { update_step_runs_by_pk(pk_columns: { id: $id }, _set: { status: "succeeded", approved_by: $approvedBy, approved_at: "now()", completed_at: "now()" }) { id } }`, { id: stepRunId, approvedBy: userId });
    await gqlAdmin(`mutation ($runId: uuid!) { update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "running" }) { id } }`, { runId });

    const stepsData = await gqlAdmin<{ workflow_steps: any[] }>(`query ($workflowId: uuid!) { workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { step_order: asc }) { id step_order type name config } }`, { workflowId: stepRun.workflow_run.workflow_id });
    const steps = stepsData.workflow_steps;
    const resumeIndex = steps.findIndex((s) => s.step_order === stepRun.workflow_step.step_order) + 1;

    const status = await runSteps({ runId, orgId, steps, startIndex: resumeIndex, previousOutput: stepRun.input });
    res.status(200).json({ step_run_id: stepRunId, workflow_run_id: runId, status, resumed: true });
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    res.status(status).json({ message: err.message || "Internal error" });
  }
}

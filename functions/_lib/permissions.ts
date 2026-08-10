import { gqlAdmin, HttpError } from "./db";
export type OrgRole = "owner" | "editor" | "viewer";
export async function getMembershipForWorkflow(userId: string, workflowId: string): Promise<{ orgId: string; role: OrgRole } | null> {
  const data = await gqlAdmin<{ workflows_by_pk: { org_id: string } | null }>(`query ($workflowId: uuid!) { workflows_by_pk(id: $workflowId) { org_id } }`, { workflowId });
  const workflow = data.workflows_by_pk; if (!workflow) return null; return getMembershipForOrg(userId, workflow.org_id);
}
export async function getMembershipForOrg(userId: string, orgId: string): Promise<{ orgId: string; role: OrgRole } | null> {
  const data = await gqlAdmin<{ org_members: { role: OrgRole }[] }>(`query ($orgId: uuid!, $userId: uuid!) { org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }, limit: 1) { role } }`, { orgId, userId });
  const row = data.org_members[0]; if (!row) return null; return { orgId, role: row.role };
}
export async function getMembershipForStepRun(userId: string, stepRunId: string): Promise<{ orgId: string; role: OrgRole; workflowRunId: string } | null> {
  const data = await gqlAdmin<{ step_runs_by_pk: { workflow_run: { id: string; org_id: string } } | null }>(`query ($stepRunId: uuid!) { step_runs_by_pk(id: $stepRunId) { workflow_run { id org_id } } }`, { stepRunId });
  const stepRun = data.step_runs_by_pk; if (!stepRun) return null; const membership = await getMembershipForOrg(userId, stepRun.workflow_run.org_id); if (!membership) return null; return { ...membership, workflowRunId: stepRun.workflow_run.id };
}
export function assertRole(role: OrgRole | null, allowed: OrgRole[], message: string) { if (!role || !allowed.includes(role)) throw new HttpError(403, message); }

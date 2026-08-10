/** Thin admin-secret GraphQL client. */
const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL || process.env.HASURA_GRAPHQL_ENDPOINT!;
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET!;
export async function gqlAdmin<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const resp = await fetch(HASURA_ENDPOINT, { method: "POST", headers: { "content-type": "application/json", "x-hasura-admin-secret": ADMIN_SECRET }, body: JSON.stringify({ query, variables }) });
  const json = await resp.json(); if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`); return json.data as T;
}
export type SessionVariables = { "x-hasura-user-id"?: string; "x-hasura-role"?: string; [key: string]: string | undefined };
export function getUserId(sessionVariables: SessionVariables): string { const id = sessionVariables["x-hasura-user-id"]; if (!id) throw new HttpError(401, "Missing authenticated user"); return id; }
export class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

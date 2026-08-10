import type { Request, Response } from "express";
import { gqlAdmin } from "./_lib/db";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
export default async function handler(req: Request, res: Response) {
  const event = req.body.event;
  const row = event.data.new as { id: string; channel: string; payload: any };
  try {
    if (row.channel === "slack" && SLACK_WEBHOOK_URL) {
      await fetch(SLACK_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: row.payload?.message || "Workflow notification" }) });
    } else console.log(`[notify stub] channel=${row.channel} payload=`, row.payload);
    await gqlAdmin(`mutation ($id: uuid!) { update_notification_events_by_pk(pk_columns: { id: $id }, _set: { delivered: true, delivered_at: "now()" }) { id } }`, { id: row.id });
    res.status(200).json({ delivered: true });
  } catch (err: any) { res.status(500).json({ message: String(err?.message || err) }); }
}

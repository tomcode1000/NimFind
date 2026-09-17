import { lunaToNim } from "./nimiq";

export const TAG_KINDS = ["phone", "keys", "bag", "wallet", "laptop", "other"] as const;
export const TAG_STATUSES = ["active", "lost", "archived"] as const;

export interface TagRow {
  code: string;
  owner_address: string;
  kind: (typeof TAG_KINDS)[number];
  label: string;
  note: string | null;
  reward_luna: number;
  status: (typeof TAG_STATUSES)[number];
  created_at: number;
  updated_at: number;
}

export interface ReportRow {
  id: string;
  tag_code: string;
  finder_token_hash: string;
  finder_address: string | null;
  status: "open" | "returned" | "closed";
  reward_luna: number;
  reward_data: string | null;
  reward_status: "none" | "awaiting_payment" | "paid";
  reward_tx_hash: string | null;
  reward_paid_luna: number | null;
  reward_paid_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  report_id: string;
  sender: "owner" | "finder";
  body: string;
  created_at: number;
}

export function tagJson(tag: TagRow) {
  return {
    code: tag.code,
    kind: tag.kind,
    label: tag.label,
    note: tag.note,
    rewardNim: lunaToNim(tag.reward_luna),
    status: tag.status,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  };
}

/** Public view of a tag for finders. Never includes the owner's address. */
export function publicTagJson(tag: TagRow) {
  return {
    code: tag.code,
    kind: tag.kind,
    label: tag.label,
    note: tag.note,
    rewardNim: lunaToNim(tag.reward_luna),
    markedLost: tag.status === "lost",
  };
}

export function reportJson(report: ReportRow) {
  return {
    id: report.id,
    tagCode: report.tag_code,
    status: report.status,
    finderAddress: report.finder_address,
    rewardNim: lunaToNim(report.reward_luna),
    rewardStatus: report.reward_status,
    rewardTxHash: report.reward_tx_hash,
    rewardPaidNim: report.reward_paid_luna === null ? null : lunaToNim(report.reward_paid_luna),
    rewardPaidAt: report.reward_paid_at,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  };
}

export function messageJson(message: MessageRow) {
  return { id: message.id, sender: message.sender, body: message.body, createdAt: message.created_at };
}

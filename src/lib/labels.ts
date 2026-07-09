import type { BadgeTone } from "@/components/ui";

type Meta = { label: string; tone: BadgeTone };

export const ticketStatusMeta: Record<string, Meta> = {
  open: { label: "Open", tone: "blue" },
  in_progress: { label: "In progress", tone: "purple" },
  waiting_on_customer: { label: "Waiting on customer", tone: "amber" },
  resolved: { label: "Resolved", tone: "green" },
  closed: { label: "Closed", tone: "slate" },
};

export const ticketPriorityMeta: Record<string, Meta> = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  critical: { label: "Critical", tone: "red" },
};

export const projectStatusMeta: Record<string, Meta> = {
  planning: { label: "Planning", tone: "violet" },
  active: { label: "Active", tone: "purple" },
  on_hold: { label: "On hold", tone: "amber" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const taskStatusMeta: Record<string, Meta> = {
  todo: { label: "To do", tone: "slate" },
  in_progress: { label: "In progress", tone: "purple" },
  done: { label: "Done", tone: "green" },
};

export const quoteStatusMeta: Record<string, Meta> = {
  draft: { label: "Draft", tone: "slate" },
  sent: { label: "Sent", tone: "blue" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  expired: { label: "Expired", tone: "amber" },
};

export const reportStatusMeta: Record<string, Meta> = {
  draft: { label: "Draft", tone: "slate" },
  sent: { label: "Sent", tone: "green" },
};

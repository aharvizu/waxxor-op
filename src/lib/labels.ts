import type { BadgeTone } from "@/components/ui";

type Meta = { label: string; tone: BadgeTone };

export const ticketStatusMeta: Record<string, Meta> = {
  new: { label: "New", tone: "blue" },
  assigned: { label: "Assigned", tone: "violet" },
  in_progress: { label: "In progress", tone: "purple" },
  waiting_customer: { label: "Waiting customer", tone: "amber" },
  waiting_third_party: { label: "Waiting third party", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "blue" },
  resolved: { label: "Resolved", tone: "green" },
  pending_confirmation: { label: "Pending confirmation", tone: "amber" },
  closed: { label: "Closed", tone: "slate" },
  reopened: { label: "Reopened", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const ticketBillingMeta: Record<string, Meta> = {
  pending_review: { label: "Pending review", tone: "amber" },
  included_in_contract: { label: "In contract", tone: "blue" },
  billable: { label: "Billable", tone: "green" },
  contract_overage: { label: "Contract overage", tone: "violet" },
  fixed_price: { label: "Fixed price", tone: "purple" },
  no_charge: { label: "No charge", tone: "slate" },
  included_in_monthly_charge: { label: "Monthly charge", tone: "blue" },
  charged: { label: "Charged", tone: "green" },
};

export const confirmationTypeMeta: Record<string, Meta> = {
  whatsapp: { label: "WhatsApp", tone: "green" },
  phone: { label: "Phone", tone: "blue" },
  email: { label: "Email", tone: "blue" },
  verbal: { label: "Verbal", tone: "slate" },
  no_response: { label: "No response", tone: "amber" },
  not_required: { label: "Not required", tone: "slate" },
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

export const activityStatusMeta: Record<string, Meta> = {
  pending: { label: "Pending", tone: "slate" },
  in_progress: { label: "In progress", tone: "purple" },
  waiting: { label: "Waiting", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
};

export const activityTypeMeta: Record<string, Meta> = {
  general: { label: "General", tone: "slate" },
  follow_up: { label: "Follow-up", tone: "blue" },
  meeting: { label: "Meeting", tone: "violet" },
  research: { label: "Research", tone: "blue" },
  documentation: { label: "Documentation", tone: "slate" },
  training: { label: "Training", tone: "green" },
  review: { label: "Review", tone: "amber" },
  implementation: { label: "Implementation", tone: "purple" },
  preventive: { label: "Preventive", tone: "green" },
  administrative: { label: "Administrative", tone: "slate" },
  commercial: { label: "Commercial", tone: "amber" },
  reminder: { label: "Reminder", tone: "red" },
};

export const slaHealthMeta: Record<string, Meta> = {
  normal: { label: "On track", tone: "green" },
  at_risk: { label: "At risk", tone: "amber" },
  critical: { label: "Critical", tone: "red" },
  overdue: { label: "Overdue", tone: "red" },
  met: { label: "Met", tone: "green" },
  breached: { label: "Breached", tone: "red" },
};

export const roleMeta: Record<string, Meta> = {
  superadmin: { label: "Super Admin", tone: "purple" },
  administrator: { label: "Administrator", tone: "violet" },
  director: { label: "Director", tone: "blue" },
  project_manager: { label: "Project Manager", tone: "amber" },
  technician: { label: "Technician", tone: "slate" },
  client: { label: "Client", tone: "green" },
};

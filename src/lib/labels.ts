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
  active: { label: "Active", tone: "green" },
  on_hold: { label: "On hold", tone: "amber" },
  at_risk: { label: "At risk", tone: "red" },
  completed: { label: "Completed", tone: "blue" },
  cancelled: { label: "Cancelled", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
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
  generating: { label: "Generating", tone: "blue" },
  ready_for_review: { label: "Ready for review", tone: "amber" },
  changes_requested: { label: "Changes requested", tone: "red" },
  approved: { label: "Approved", tone: "green" },
  sent: { label: "Sent", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  archived: { label: "Archived", tone: "slate" },
};

export const reportTypeMeta: Record<string, Meta> = {
  monthly_service: { label: "Servicio mensual", tone: "blue" },
  operational_summary: { label: "Resumen operativo", tone: "blue" },
  executive_summary: { label: "Resumen ejecutivo", tone: "purple" },
  sla_report: { label: "SLA", tone: "violet" },
  time_report: { label: "Tiempo", tone: "slate" },
  project_report: { label: "Proyecto", tone: "violet" },
  billing_support: { label: "Soporte de cobro", tone: "amber" },
  custom_internal: { label: "Interno", tone: "slate" },
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

export const clientStatusMeta: Record<string, Meta> = {
  active: { label: "Active", tone: "green" },
  inactive: { label: "Inactive", tone: "slate" },
  prospect_legacy: { label: "Prospect / legacy", tone: "amber" },
  archived: { label: "Archived", tone: "slate" },
};

export const contactTypeMeta: Record<string, Meta> = {
  owner: { label: "Owner", tone: "purple" },
  primary: { label: "Primary", tone: "blue" },
  technical: { label: "Technical", tone: "violet" },
  administrative: { label: "Administrative", tone: "slate" },
  billing: { label: "Billing", tone: "amber" },
  management: { label: "Management", tone: "blue" },
  requester: { label: "Requester", tone: "slate" },
  other: { label: "Other", tone: "slate" },
};

export const clientServiceTypeMeta: Record<string, Meta> = {
  recurring_service: { label: "Recurring service", tone: "blue" },
  license: { label: "License", tone: "violet" },
  support_contract: { label: "Support contract", tone: "purple" },
  one_time_service: { label: "One-time service", tone: "slate" },
  managed_service: { label: "Managed service", tone: "blue" },
};

/** Derived statuses (expiring/expired) included — they never hit the DB. */
export const clientServiceStatusMeta: Record<string, Meta> = {
  active: { label: "Active", tone: "green" },
  expiring: { label: "Expiring", tone: "amber" },
  expired: { label: "Expired", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
};

export const contractTypeMeta: Record<string, Meta> = {
  support: { label: "Support", tone: "blue" },
  managed_service: { label: "Managed service", tone: "violet" },
  licensing: { label: "Licensing", tone: "purple" },
  consulting: { label: "Consulting", tone: "amber" },
  maintenance: { label: "Maintenance", tone: "slate" },
  other: { label: "Other", tone: "slate" },
};

export const contractStatusMeta: Record<string, Meta> = {
  draft: { label: "Draft", tone: "slate" },
  active: { label: "Active", tone: "green" },
  expiring: { label: "Expiring", tone: "amber" },
  expired: { label: "Expired", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
  archived: { label: "Archived", tone: "slate" },
};

export const supportCoverageMeta: Record<string, Meta> = {
  included: { label: "Included", tone: "green" },
  incident_based: { label: "Per incident", tone: "amber" },
  hourly_bundle: { label: "Hourly bundle", tone: "blue" },
  fixed_price: { label: "Fixed price", tone: "violet" },
  not_applicable: { label: "N/A", tone: "slate" },
};

export const renewalBucketMeta: Record<string, Meta> = {
  overdue: { label: "Vencido", tone: "red" },
  d7: { label: "≤ 7 días", tone: "red" },
  d15: { label: "≤ 15 días", tone: "amber" },
  d30: { label: "≤ 30 días", tone: "amber" },
  d60: { label: "≤ 60 días", tone: "blue" },
  d90: { label: "≤ 90 días", tone: "slate" },
  later: { label: "Más adelante", tone: "slate" },
};

export const projectPriorityMeta: Record<string, Meta> = {
  low: { label: "Low", tone: "slate" },
  normal: { label: "Normal", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

export const projectHealthMeta: Record<string, Meta> = {
  on_track: { label: "On track", tone: "green" },
  attention: { label: "Attention", tone: "amber" },
  at_risk: { label: "At risk", tone: "red" },
  blocked: { label: "Blocked", tone: "red" },
  completed: { label: "Completed", tone: "blue" },
  not_set: { label: "Not set", tone: "slate" },
};

export const projectMemberRoleMeta: Record<string, Meta> = {
  manager: { label: "Manager", tone: "purple" },
  coordinator: { label: "Coordinator", tone: "violet" },
  contributor: { label: "Contributor", tone: "blue" },
  observer: { label: "Observer", tone: "slate" },
};

export const projectListStatusMeta: Record<string, Meta> = {
  planned: { label: "Planned", tone: "slate" },
  active: { label: "Active", tone: "green" },
  completed: { label: "Completed", tone: "blue" },
  archived: { label: "Archived", tone: "slate" },
};

export const milestoneStatusMeta: Record<string, Meta> = {
  pending: { label: "Pending", tone: "slate" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  delayed: { label: "Delayed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const riskSeverityMeta: Record<string, Meta> = {
  low: { label: "Low", tone: "slate" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "red" },
  critical: { label: "Critical", tone: "red" },
};

export const riskStatusMeta: Record<string, Meta> = {
  open: { label: "Open", tone: "red" },
  monitoring: { label: "Monitoring", tone: "amber" },
  mitigated: { label: "Mitigated", tone: "green" },
  occurred: { label: "Occurred", tone: "red" },
  closed: { label: "Closed", tone: "slate" },
};

export const recurrenceStatusMeta: Record<string, Meta> = {
  draft: { label: "Draft", tone: "slate" },
  active: { label: "Active", tone: "green" },
  paused: { label: "Paused", tone: "amber" },
  completed: { label: "Completed", tone: "blue" },
  expired: { label: "Expired", tone: "slate" },
  error: { label: "Error", tone: "red" },
  archived: { label: "Archived", tone: "slate" },
};

export const recurrenceTargetTypeMeta: Record<string, Meta> = {
  activity: { label: "Activity", tone: "purple" },
  ticket: { label: "Ticket", tone: "blue" },
  project_activity: { label: "Project activity", tone: "violet" },
  report: { label: "Report", tone: "slate" },
};

export const recurrenceFrequencyMeta: Record<string, Meta> = {
  daily: { label: "Daily", tone: "slate" },
  weekly: { label: "Weekly", tone: "slate" },
  monthly: { label: "Monthly", tone: "slate" },
  quarterly: { label: "Quarterly", tone: "slate" },
  semiannual: { label: "Semiannual", tone: "slate" },
  annual: { label: "Annual", tone: "slate" },
  weekdays: { label: "Weekdays", tone: "slate" },
  custom: { label: "Custom", tone: "slate" },
};

export const recurrenceExecutionStatusMeta: Record<string, Meta> = {
  pending: { label: "Pending", tone: "slate" },
  running: { label: "Running", tone: "blue" },
  succeeded: { label: "Succeeded", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  skipped: { label: "Skipped", tone: "slate" },
  cancelled: { label: "Cancelled", tone: "slate" },
  duplicate_prevented: { label: "Duplicate prevented", tone: "amber" },
};

export const recurrenceExecutionSourceMeta: Record<string, Meta> = {
  scheduler: { label: "Scheduler", tone: "slate" },
  manual: { label: "Manual", tone: "blue" },
  retry: { label: "Retry", tone: "amber" },
  backfill: { label: "Backfill", tone: "violet" },
};

export const EMAIL_EVENTS = {
  submissions: "New document submissions",
  reviews: "Document review decisions",
  assignments: "Deliverable assignments",
  requests: "Date changes and additional deliverable requests",
  interdisciplinary: "Interdisciplinary checks",
  reports: "Project reports",
  team: "Invitations and team changes",
  overdue: "Overdue submission reminders",
  other: "Other events",
} as const;
export type NotificationPreferences = {emailEnabled:boolean;disciplines:string[]|null;events:string[]|null;choices:string[]};

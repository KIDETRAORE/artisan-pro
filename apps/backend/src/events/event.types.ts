export enum EventType {
  INVOICE_CREATED = "invoice.created",
  INVOICE_OVERDUE = "invoice.overdue", // Déclenche la relance
  INVOICE_PAID = "invoice.paid",       // Déclenche le recalcul du score de risque
  REMINDER_SENT = "reminder.sent",     // Pour les analytics
}
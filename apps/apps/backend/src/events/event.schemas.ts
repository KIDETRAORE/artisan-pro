import { z } from "zod";
import { EventType } from "./event.types";

const Id = z.string().min(1);

export const EventPayloadSchemas = {
  [EventType.INVOICE_CREATED]: z.object({
    invoiceId: Id,
    userId: Id,
  }),

  [EventType.INVOICE_OVERDUE]: z.object({
    invoiceId: Id,
    userId: Id,
  }),

  [EventType.INVOICE_PAID]: z.object({
    invoiceId: Id,
    userId: Id,
  }),

  [EventType.REMINDER_SENT]: z.object({
    invoiceId: Id,
    userId: Id,
  }),
} as const;

export type EventPayloadMap = {
  [K in keyof typeof EventPayloadSchemas]: z.infer<(typeof EventPayloadSchemas)[K]>;
};
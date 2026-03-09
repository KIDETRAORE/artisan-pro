// apps/backend/src/services/stripe/stripeIdempotency.test.ts
import { describe, expect, it, vi } from "vitest";
import { acquireStripeEventLock } from "./stripeIdempotency";

const insertMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("../../lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: insertMock,
      select: selectMock,
      eq: eqMock,
      maybeSingle: maybeSingleMock,
    })),
  },
}));

describe("acquireStripeEventLock", () => {
  it("duplicate 23505 + processed_at set -> already_processed", async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });

    // chain: select().eq().maybeSingle()
    selectMock.mockReturnValueOnce({ eq: eqMock });
    eqMock.mockReturnValueOnce({ maybeSingle: maybeSingleMock });

    maybeSingleMock.mockResolvedValueOnce({
      data: { processed_at: "2026-02-26T00:00:00.000Z" },
      error: null,
    });

    const res = await acquireStripeEventLock({
      eventId: "evt_123",
      type: "invoice.payment_succeeded",
      createdAt: "2026-02-26T00:00:00.000Z",
    });

    expect(res).toBe("already_processed");
  });

  it("duplicate 23505 + processed_at null -> processing_elsewhere", async () => {
    insertMock.mockResolvedValueOnce({
      error: { code: "23505", message: "duplicate key" },
    });

    selectMock.mockReturnValueOnce({ eq: eqMock });
    eqMock.mockReturnValueOnce({ maybeSingle: maybeSingleMock });

    maybeSingleMock.mockResolvedValueOnce({
      data: { processed_at: null },
      error: null,
    });

    const res = await acquireStripeEventLock({
      eventId: "evt_456",
      type: "checkout.session.completed",
      createdAt: "2026-02-26T00:00:00.000Z",
    });

    expect(res).toBe("processing_elsewhere");
  });
});
-- Keep partial and inconsistent Paymob refunds visible as distinct reconciliation events.
alter table app_private.payment_events
  drop constraint if exists payment_events_outcome_check,
  add constraint payment_events_outcome_check
    check (outcome in ('pending', 'succeeded', 'failed', 'refunded', 'partial_refund', 'refund_review', 'voided'));

-- Cancellation log table: append-only audit log for reservation cancellations

CREATE TABLE public.cancellation_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID        NOT NULL REFERENCES public.reservations(id),
  canceled_by    UUID        NOT NULL REFERENCES auth.users(id),
  canceled_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cancellation_log ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users can read cancellation log
CREATE POLICY cancellation_log_select ON public.cancellation_log FOR SELECT
  USING (public.current_user_role() IN ('admin', 'operator'));

-- RLS policy: authenticated users can insert cancellation log entries
CREATE POLICY cancellation_log_insert ON public.cancellation_log FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'operator'));

-- No UPDATE or DELETE policies: records are immutable once written

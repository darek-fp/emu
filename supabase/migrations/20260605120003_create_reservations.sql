-- Reservations table: parking reservations with booking and payment state

CREATE TABLE public.reservations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id      UUID         NOT NULL REFERENCES public.sectors(id),
  customer_name  TEXT         NOT NULL,
  license_plate  TEXT         NOT NULL,
  arrival_at     TIMESTAMPTZ  NOT NULL,
  departure_at   TIMESTAMPTZ  NOT NULL,
  price_total    NUMERIC(10,2) NOT NULL CHECK (price_total >= 0),
  price_override BOOLEAN      NOT NULL DEFAULT false,
  status         TEXT         NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'arrived', 'departed', 'canceled')),
  is_paid        BOOLEAN      NOT NULL DEFAULT false,
  arrived_at     TIMESTAMPTZ,
  departed_at    TIMESTAMPTZ,
  anonymized_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT departure_after_arrival CHECK (departure_at > arrival_at)
);

-- Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users can read reservations
CREATE POLICY reservations_select ON public.reservations FOR SELECT
  USING (public.current_user_role() IN ('admin', 'operator'));

-- RLS policy: authenticated users can insert reservations
CREATE POLICY reservations_insert ON public.reservations FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'operator'));

-- RLS policy: authenticated users can update reservations
CREATE POLICY reservations_update ON public.reservations FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'operator'))
  WITH CHECK (public.current_user_role() IN ('admin', 'operator'));

-- No DELETE policy: reservations are never deleted, only canceled via status

-- Attach updated_at trigger
CREATE TRIGGER reservations_set_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

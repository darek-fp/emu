-- Phase 2 (testing-critical-path-coverage): atomic, capacity-safe reservation creation
--
-- Two concurrent reservation requests for the same sector/time window must not both
-- succeed once the sector's spot_count is reached. Enforce this by locking the sector
-- row (SELECT ... FOR UPDATE) and counting overlapping active reservations inside the
-- same transaction as the insert, so the capacity check and the insert are atomic.

CREATE OR REPLACE FUNCTION public.create_reservation_locked(
  p_sector_id UUID,
  p_arrival_at TIMESTAMPTZ,
  p_departure_at TIMESTAMPTZ,
  p_customer_name TEXT,
  p_license_plate TEXT,
  p_pricing_tier_id UUID,
  p_created_by_operator_id UUID,
  p_price_total NUMERIC,
  p_price_override BOOLEAN
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spot_count INTEGER;
  v_active_count INTEGER;
  v_reservation public.reservations;
BEGIN
  -- Lock the sector row so concurrent transactions targeting the same sector
  -- serialize here instead of both reading a stale availability count.
  SELECT spot_count INTO v_spot_count
  FROM public.sectors
  WHERE id = p_sector_id
  FOR UPDATE;

  IF v_spot_count IS NULL THEN
    RAISE EXCEPTION 'Sector % not found', p_sector_id USING ERRCODE = 'P0002';
  END IF;

  -- Count overlapping active reservations for this sector within the same
  -- (now-locked) transaction, so the count reflects any reservation just
  -- committed by a competing transaction that held the lock first.
  SELECT count(*) INTO v_active_count
  FROM public.reservations
  WHERE sector_id = p_sector_id
    AND status IN ('confirmed', 'arrived')
    AND arrival_at < p_departure_at
    AND departure_at > p_arrival_at;

  IF v_active_count >= v_spot_count THEN
    RAISE EXCEPTION 'Sector % has no available capacity for the requested window', p_sector_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reservations (
    sector_id,
    customer_name,
    license_plate,
    arrival_at,
    departure_at,
    price_total,
    price_override,
    pricing_tier_id,
    created_by_operator_id,
    status
  ) VALUES (
    p_sector_id,
    p_customer_name,
    p_license_plate,
    p_arrival_at,
    p_departure_at,
    p_price_total,
    p_price_override,
    p_pricing_tier_id,
    p_created_by_operator_id,
    'confirmed'
  )
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

-- Only authenticated callers (operators/admins, enforced upstream by the API route)
-- may execute the locked creation path.
GRANT EXECUTE ON FUNCTION public.create_reservation_locked(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, NUMERIC, BOOLEAN
) TO authenticated;

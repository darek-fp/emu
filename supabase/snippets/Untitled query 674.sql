
CREATE OR REPLACE FUNCTION operator_has_sector_access(sector_id UUID)
RETURNS boolean AS $$
DECLARE op_id UUID; p_sector_id UUID := sector_id;
BEGIN IF is_admin() THEN
    RETURN true; END IF; SELECT id INTO op_id
    FROM public.operators
    WHERE user_id = auth.uid() AND deactivated_at IS NULL; IF op_id IS NULL THEN
    RETURN false; END IF; RETURN EXISTS (
    SELECT 1 FROM public.operator_sector_assignments a
    WHERE a.operator_id = op_id AND a.sector_id = p_sector_id );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

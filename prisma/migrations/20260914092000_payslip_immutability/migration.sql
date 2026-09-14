-- Payslips and their lines are immutable once the pay period is APPROVED, RELEASED or LOCKED.
-- The repo layer refuses such writes first; these triggers make the rule hold for every client,
-- including psql. Allowed while frozen: setting pdf_path / generated_at on a payslip (Phase 5)
-- and posting loan payments. The service changes the period status back to COMPUTED (an
-- ADMIN-only, audited revert) before touching a frozen payslip.

CREATE OR REPLACE FUNCTION payslip_period_is_frozen(period_id UUID) RETURNS BOOLEAN AS $$
  SELECT status IN ('APPROVED', 'RELEASED', 'LOCKED') FROM pay_periods WHERE id = period_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION payslip_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF payslip_period_is_frozen(OLD.pay_period_id) THEN
      RAISE EXCEPTION 'payslip % is approved and cannot be deleted', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF payslip_period_is_frozen(OLD.pay_period_id)
     AND (to_jsonb(NEW) - 'pdf_path' - 'generated_at' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'pdf_path' - 'generated_at' - 'updated_at') THEN
    RAISE EXCEPTION 'payslip % is approved and cannot be changed', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payslip_immutable
  BEFORE UPDATE OR DELETE ON payslips
  FOR EACH ROW EXECUTE FUNCTION payslip_guard();

CREATE OR REPLACE FUNCTION payslip_line_guard() RETURNS TRIGGER AS $$
DECLARE
  slip_id UUID := COALESCE(NEW.payslip_id, OLD.payslip_id);
  frozen BOOLEAN;
BEGIN
  SELECT payslip_period_is_frozen(p.pay_period_id) INTO frozen FROM payslips p WHERE p.id = slip_id;
  IF COALESCE(frozen, FALSE) THEN
    RAISE EXCEPTION 'payslip % is approved; its lines cannot be changed', slip_id USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payslip_line_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON payslip_lines
  FOR EACH ROW EXECUTE FUNCTION payslip_line_guard();

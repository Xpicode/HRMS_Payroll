-- An approved, released or locked pay period cannot be deleted (which would cascade to its
-- frozen payslips). Reverting to COMPUTED first is the audited way to undo an approval.
CREATE OR REPLACE FUNCTION pay_period_delete_guard() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'RELEASED', 'LOCKED') THEN
    RAISE EXCEPTION 'pay period % is % and cannot be deleted', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pay_period_no_delete_when_frozen
  BEFORE DELETE ON pay_periods
  FOR EACH ROW EXECUTE FUNCTION pay_period_delete_guard();

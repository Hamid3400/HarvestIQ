CREATE OR REPLACE FUNCTION forbid_ledger_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Ledger rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_immutable
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();

CREATE TRIGGER ledger_tx_immutable
BEFORE UPDATE OR DELETE ON "LedgerTransaction"
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_changes();
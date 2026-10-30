-- Stage 6 evidence script. Run ONLY on the isolated FSP Connect test database.
-- Creates TEMP tables, fictional records, copies them, simulates deletion/replay,
-- checks foreign keys and counts, then ROLLBACK. Does NOT create a real backup
-- and does NOT constitute an independent restoration of production data.
BEGIN;
CREATE TEMP TABLE stage6_contacts(id uuid PRIMARY KEY,contact_key text UNIQUE NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE stage6_conversations(
 id uuid PRIMARY KEY,contact_id uuid REFERENCES stage6_contacts(id) NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE stage6_messages(
 id uuid PRIMARY KEY,conversation_id uuid REFERENCES stage6_conversations(id) NOT NULL,
 body text NOT NULL) ON COMMIT DROP;
INSERT INTO stage6_contacts VALUES('11111111-1111-4111-8111-111111111111','synthetic-test-only');
INSERT INTO stage6_conversations VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
INSERT INTO stage6_messages VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','synthetic recovery rehearsal');

CREATE TEMP TABLE stage6_backup_contacts ON COMMIT DROP AS SELECT * FROM stage6_contacts;
CREATE TEMP TABLE stage6_backup_conversations ON COMMIT DROP AS SELECT * FROM stage6_conversations;
CREATE TEMP TABLE stage6_backup_messages ON COMMIT DROP AS SELECT * FROM stage6_messages;

TRUNCATE TABLE stage6_messages,stage6_conversations,stage6_contacts;
INSERT INTO stage6_contacts SELECT * FROM stage6_backup_contacts;
INSERT INTO stage6_conversations SELECT * FROM stage6_backup_conversations;
INSERT INTO stage6_messages SELECT * FROM stage6_backup_messages;
DO $qa$
DECLARE
 contacts integer;conversations integer;messages integer;orphans integer;
BEGIN
 SELECT count(*) INTO contacts FROM stage6_contacts;
 SELECT count(*) INTO conversations FROM stage6_conversations;
 SELECT count(*) INTO messages FROM stage6_messages;
 SELECT count(*) INTO orphans FROM stage6_messages m LEFT JOIN stage6_conversations c
  ON c.id=m.conversation_id WHERE c.id IS NULL;
 IF contacts<>1 OR conversations<>1 OR messages<>1 OR orphans<>0
   OR NOT EXISTS(SELECT 1 FROM stage6_messages WHERE body='synthetic recovery rehearsal')
 THEN RAISE EXCEPTION 'Stage6 synthetic recovery rehearsal FAILED';END IF;
END $qa$;
ROLLBACK;
SELECT 'SYNTHETIC_TEMP_RESTORE_REPLAY_PASS_NOT_ACTUAL_BACKUP' AS result;

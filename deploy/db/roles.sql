-- Least privilege for the database. Run once as the owner (Neon SQL editor) after the first
-- deployment has created the tables, then use these roles instead of the owner role:
--   stackr_app    → Vercel DATABASE_URL (read/write data, cannot change the schema or other DBs)
--   stackr_backup → GitHub secret BACKUP_DATABASE_URL (read only)
-- Replace both passwords with long random values (e.g. `openssl rand -base64 32`). Never commit them.

create role stackr_app login password 'CHANGE_ME_APP';
create role stackr_backup login password 'CHANGE_ME_BACKUP';

revoke all on schema public from public;
grant usage on schema public to stackr_app, stackr_backup;

grant select, insert, update, delete on app_state, sessions, seller_mfa, rate_limits, audit_log, credentials, auth_codes, gift_codes, gift_redemptions to stackr_app;
grant usage, select on sequence audit_log_id_seq, auth_codes_id_seq, gift_codes_id_seq to stackr_app;

grant select on all tables in schema public to stackr_backup;
grant select on all sequences in schema public to stackr_backup;

-- The app creates tables "if not exists" on start; with stackr_app those statements are no-ops
-- once the tables exist. Schema changes in future versions run as the owner.

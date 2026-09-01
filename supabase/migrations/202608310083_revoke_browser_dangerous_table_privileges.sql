-- Browser roles use ordinary DML behind RLS and narrowly granted RPCs.
-- TRUNCATE bypasses row-level security; REFERENCES and TRIGGER are not needed
-- by the EngiCite browser clients. Remove these privileges from every current
-- and future application table without changing customer data or required DML.
revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

alter default privileges for role postgres in schema public
revoke truncate, references, trigger on tables from anon, authenticated;

comment on schema public is
  'EngiCite application schema. Browser roles are denied TRUNCATE, REFERENCES and TRIGGER; tenant access remains enforced by RLS and explicit grants.';

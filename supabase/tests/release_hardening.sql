begin;
select plan(5);
select has_table('public','api_rate_limits','rate limit state exists');
select has_function('public','consume_rate_limit',array['uuid','text','integer','integer'],'rate limiter exists');
select has_table('public','organisation_deletion_requests','deletion requests exist');
select has_function('public','request_organisation_deletion',array['uuid','text'],'controlled deletion scheduling exists');
select has_function('public','export_organisation_manifest',array['uuid'],'tenant export manifest exists');
select * from finish();
rollback;

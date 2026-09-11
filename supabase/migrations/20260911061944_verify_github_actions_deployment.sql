-- No-op migration used to verify the GitHub Actions deployment pipeline.
-- Supabase records this version in migration history without changing business data or schema.
select 1 as github_actions_migration_check;

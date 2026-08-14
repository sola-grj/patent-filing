# Supplier organization rollout

## Before applying migrations

1. Take a database backup.
2. Set `APP_BASE_URL=https://pat.ecinn.com` after that custom domain is valid in Vercel and points to the same deployment that handles `/auth/callback`.
3. Set `AUTH_INVITE_TTL_SECONDS` to the same duration as Supabase Authentication > Email OTP expiration.
4. Confirm `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `SUPABASE_SERVICE_ROLE_KEY` are available only to the server runtime.
5. Run `supabase db push --dry-run` and review both `20260814041354` and `20260814041442`.

The migration creates the ECI supplier when it does not exist. Legacy `pm`, `ops`, and `admin` memberships attached to non-supplier organizations are moved to ECI. If ECI has staff but no administrator, the earliest staff membership becomes `admin` so customer onboarding remains operable.

## Apply

```powershell
supabase db push
```

Then set these production Auth controls in Supabase:

- Authentication > General Configuration > Allow new users to sign up: off
- Email OTP expiration: the same value as `AUTH_INVITE_TTL_SECONDS`
- Authentication > URL Configuration > Site URL: `https://pat.ecinn.com`
- Authentication > URL Configuration > Redirect URLs: include `https://pat.ecinn.com/auth/callback`

Admin-generated invite and magic links remain the only account-entry path.

## Smoke test

1. Sign in as the migrated ECI supplier administrator.
2. Open `/pm/customers`, create a customer, and invite its first customer administrator.
3. Accept the invitation using the exact invited email; set a password for a new account.
4. Invite a second ordinary customer member.
5. Create one Request as each customer user and confirm neither can see the other's Request.
6. Enable sharing with `npm run admin:request-sharing -- ... --enabled true`; confirm both Requests appear under Organization requests but modification attempts fail.
7. Download a source file, deliverable, and signature file as the shared reader.
8. Disable sharing and confirm the list, direct detail URL, and all three direct download URLs are denied immediately.
9. Confirm a PM from a different supplier cannot read the ECI Request.
10. Run database and Storage RLS tests plus Supabase Advisors after the migration is present.

## Request sharing command

```powershell
npm run admin:request-sharing -- `
  --organization-id "<customer-organization-uuid>" `
  --enabled true `
  --changed-by-email "<eci-supplier-admin-email>" `
  --reason "Customer approved organization-wide read access"
```

Use `--enabled false` to turn sharing off. The named actor must be an administrator in the customer's active supplier organization. Every change writes an organization audit event.

# Repository Guidelines

## Project Structure & Module Organization
`app/` contains Next.js App Router pages, layouts, route handlers, and protected/auth routes. `components/` contains reusable business UI, auth forms, and tutorial blocks; keep Radix UI-based primitives in `components/ui/` and do not add business logic there. `lib/` contains shared utilities and server/browser helpers, including `lib/supabase/server.ts`, `lib/supabase/client.ts`, and `lib/supabase/proxy.ts`. Database changes belong in timestamped SQL migrations under `supabase/migrations/`. Root config files such as `next.config.ts`, `eslint.config.mjs`, `tailwind.config.ts`, and `tsconfig.json` define framework, lint, styling, and TypeScript behavior.

## Business Domain
This repository implements Patentia, a patent translation request system. Core roles are Requester, PM/operations, and Translator. Core business objects are Translation Request, Request File, Translation Requirement, Quote, Negotiation, Order, Translation Task, and Deliverable. Preserve the end-to-end flow from request creation through file confirmation, parsing, configuration, quote handling, PM review, order creation, task assignment, production, and completion.

## Product & Interaction Style
Use the product name `Patentia` in visible navigation and product-facing copy. UI and interaction design should follow European and North American B2B SaaS conventions: restrained, precise, trustworthy, and operationally efficient. Prefer clear hierarchy, strong typography, generous but not wasteful spacing, neutral surfaces, and direct task-oriented actions. Avoid playful consumer patterns, decorative clutter, and marketing-heavy hero sections on workflow pages.

## Next.js App Router Rules
Default to Server Components. Add `"use client"` only for interactivity, browser APIs, local state, effects, or client-only libraries. Keep `app/**/page.tsx` and `layout.tsx` focused on route-level data assembly and composition; move business UI into `components/` and shared logic into `lib/`. Prefer server-side data reads in Server Components or server-only helpers. Do not duplicate Supabase client setup outside `lib/supabase/`.

## Component Size & Decomposition
Use these as review limits, not compile-time rules. A single React component should stay under 200 lines. A `page.tsx` or `layout.tsx` should stay under 250 lines. A single function should stay under 60 lines. A source file should stay under 300 lines. When a limit is exceeded, split by responsibility: form, list, details panel, status badge, action group, hook, server helper, or business rule module.

## Supabase Data Access
Browser code must use `lib/supabase/client.ts`; server code must use `lib/supabase/server.ts`. Never expose a service role key to the client. Store file binaries in Supabase Storage, while database rows store paths, metadata, parse results, and confirmation state. For schema changes, always create a new migration in `supabase/migrations/`; never edit an applied migration.

## Database Modeling Guidelines
Business tables should use `uuid` primary keys, `created_at`, and `updated_at` unless there is a strong reason not to. User identity extends Supabase `auth.users` through `profiles`; authorization should flow through organizations, organization members, and roles.

Use explicit enum or lookup values for lifecycle state instead of scattered string literals. Requester and PM lifecycle fields should stay aligned in the first version: `responding`, `negotiation`, `in_progress`, `rejected`, and `completed`. Store stable query fields as columns, and keep fast-changing configuration, parsing structures, pricing details, and external patent API responses as `jsonb` snapshots. Important workflow actions should be written to an event table so Requester, PM, quote, negotiation, order, and production transitions remain auditable.

## Security & Access Rules
Enable RLS on business tables. Requesters should only access their own or organization-owned requests. PM and operations roles may process requests, quotes, orders, and tasks. Translators should only access tasks and files assigned to them. For any RLS change, describe expected access for Requester, PM/ops, and Translator before applying it.

## Build, Test, and Development Commands
Use `npm run dev` to start the local server on `localhost:3000`. Run `npm run build` for production compilation. Use `npm run start` to serve a successful build locally. Run `npm run lint` for ESLint checks; if generated `.next/` output causes lint noise, document that and validate changed source files directly. For database changes, run `supabase db push --dry-run` before pushing to a remote project.

## Coding Style & Naming Conventions
This repo uses TypeScript with `strict` mode and the `@/*` import alias. Follow the existing style: 2-space indentation, double quotes, and semicolons. Name React components in PascalCase, hooks as `useXxx`, helper functions in camelCase, and server helpers with short verb phrases. Keep route folder names simple and URL-driven.

## UI Composition Guidelines
Split forms, lists, detail views, status badges, and operation buttons into focused components. Continue using Radix UI for component primitives through the existing `components/ui/` layer; do not introduce another UI component library unless explicitly approved. Use `lucide-react` icons where appropriate. Keep operational screens dense and task-focused; avoid marketing-style hero sections for workflow pages.

## Testing Guidelines
There is no dedicated automated test framework configured yet. Validate most changes with `npm run build` plus focused manual checks in the relevant route, especially auth, RLS, and data-fetching flows. For schema work, verify migrations with `supabase db push --dry-run` first, then confirm remote migration alignment after applying.

## Commit & Pull Request Guidelines
The Git history is still minimal, so use short imperative commit subjects such as `Add patent request schema` or `Update quote workflow`. PRs should summarize the purpose, list affected routes or data flows, call out env or migration changes, mention RLS impact, and include screenshots for UI updates.

## Security & Configuration Tips
Keep secrets in `.env.local` only and never commit real Supabase keys. When changing auth, middleware, migrations, or storage paths, verify that local env values and remote schema changes stay in sync.

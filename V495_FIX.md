# V495 — Internal Chat + Cross-Planner Notifications

## Scope
V495 adds one shared Internal Chat workspace to ST Planning and duplicates operational change notifications into that chat without replacing existing alerts/audit workflows.

## Architecture
- Runtime/database: Next.js on Vercel + Aiven PostgreSQL.
- No Supabase Auth is introduced.
- Chat tables: `app_chat_message`, `app_chat_user_state`.
- Permissions: `chat.view`, `chat.send` are granted to ADMIN, PLANNER, PRODUCTION_OPERATOR and SHIFT_SUPERVISOR by migration 085.
- Chat refresh uses lightweight polling; unread count is shown on the Internal Chat navigation item.

## User chat
- All authorized ST Planning users read the same group.
- Users can send normal text messages.
- Last-read position is stored per user so the navigation can show unread count.

## Automatic SYSTEM messages
After the business transaction commits, the app sends a best-effort SYSTEM message for core operational changes including:
- Batch create / add Job / remove Job / recipe change / delete / Reset All.
- Job Hold / Release.
- Schedule create / move / unschedule / row order / production-day shift / Chemical Loading heal.
- Production status reporting.
- Production Add Job / accept downstream attention.
- Daily Production Adjustment scan / approve / reject.
- Planner Assignment change.

Chat notification failure never rolls back a Planning/Scheduling/Production change that already committed.

## Cross-planner resolver
For an operational change the app resolves:
`Source Main → Schedule Area → Planner Assignment`
and then scans downstream active Planning Chain Main operations for affected Jobs.

If at least one downstream Main belongs to the other Planner, the SYSTEM message is marked `CROSS-PLANNER` and shows the direction, for example:
`Planner 1 → Planner 2`.

The reverse direction uses the same resolver. No Main or Planner pair is hard-coded.

## Existing alerts remain canonical
V495 does not remove or replace:
- Production Change Alerts.
- Previous/Next Main attention / handover events.
- Daily Production Adjustment.
- RBAC/audit history.

Chat is a shared communication and awareness layer; it does not approve or mutate Planning/Schedule data by itself.

## SQL
Run `V495_APPLY_AIVEN.sql` on Aiven PostgreSQL. It contains exactly 4 executable SQL statements.

## Logic & Training
`Logic & Guide` and `New User Training` are updated together for V495.

-- 040_planning_board_view_default.sql
-- Lưu "Default View" của Planning Board lên MÁY CHỦ (thay vì localStorage của trình duyệt)
-- để dùng chung ở mọi môi trường: localhost, Vercel, mọi máy/browser.
-- view_key: 'SYSTEM' | 'OP:<Standard Operation>' | 'AREA:<Area ID>'
-- payload: JSON { columns, filters, sortRules, density, routeFocus }

create table if not exists public.planning_board_view (
  view_key   text primary key,
  payload    jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table public.planning_board_view is
  'Default view của Planning Board (cột, bộ lọc, sắp xếp, mật độ) — lưu server, dùng chung mọi môi trường.';

# V378 — Planning Board compact schedule datetime format

- Changed only the compact scheduled datetime shown in Planning Board route-status cells.
- Old: `HH:MM DD` (example `13:00 02`)
- New: `HH:MM DD-MMM` with uppercase English month (example `10:20 02-SEP`).
- Timezone remains `Asia/Ho_Chi_Minh`.
- No Planning, Batch, Schedule, Recipe, READY/WAIT, or database logic changed.

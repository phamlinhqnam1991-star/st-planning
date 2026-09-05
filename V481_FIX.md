# V481 — Fix AccessContext userId type-check

## Lỗi
Next.js build dừng tại `src/app/api/planning/job-hold/route.ts` với TS2339 vì `AccessContext` không có property `id`.

## Nguyên nhân
`AccessContext` chuẩn của V478+ dùng `userId`, nhưng API Job Hold còn một tham chiếu cũ `user?.id` khi ghi `held_by`.

## Sửa
Chỉ thay `user?.id` thành `user?.userId` trong API Job Hold.

Không thay đổi business logic, RBAC, scope, Planning, Scheduling, Production, database hay migration SQL.

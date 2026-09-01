# V365 — Repeated NextOperation khi LastLaborOp blank / START

## Mục tiêu
Sửa trường hợp `NextOperation` là một raw Operation lặp nhiều lần trong cùng route nhưng `LastLaborOp` đang blank hoặc `START`, ví dụ `HE-BAKE` xuất hiện ở before blasting / after plating / HE-BAKE thường.

## Logic mới
1. `START` được xem như chưa có LastLaborOp vật lý.
2. Nếu NextOperation chỉ có một Main occurrence → chọn occurrence đó như cũ.
3. Nếu NextOperation có nhiều occurrence → không trả NO_CHAIN chỉ vì LastLaborOp blank/START.
4. Nếu có Planning/Batch history → chọn occurrence sớm nhất chưa có non-cancelled Batch.
5. Nếu chưa có progress context → chọn occurrence đầu tiên theo route.
6. Nếu mọi occurrence đã có Batch → giữ occurrence đầu để sequential gating replay chuỗi planned một cách deterministic.
7. Rule áp dụng generic cho mọi Operation lặp; không hard-code HE-BAKE hay SIPT.

## Ví dụ
`START → HE-BAKE` với route:
- HE-BAKE before blasting
- M-DBLST
- PLA-ZiNi
- HE-BAKE after plating
- PLA-CC
- HE-BAKE

Nếu chưa occurrence nào có Batch: `HE-BAKE before blasting = READY`, các Main sau = WAIT.

## Ảnh hưởng
- Chỉ sửa Current Main Resolver/Debug cho repeated NextOperation.
- Không đổi Recipe, Batch Compatibility, Process Time, Scheduling, Masking/Unmasking.
- Không cần migration SQL.

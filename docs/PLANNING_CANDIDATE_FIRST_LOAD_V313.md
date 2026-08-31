# v313 Candidate-First Load

Baseline nghiệp vụ: **v313 — NextOperation Main = Current Main fallback**.

## Mục tiêu

Planning Board không chờ các metadata không quyết định Candidate membership trước khi hiển thị Candidate rows.

## Luồng mới

```text
Planning shell
  -> /api/planning/candidates          (ưu tiên: Candidate rows + pagination)
       -> hiển thị Candidate ngay
  -> /api/planning/candidate-metadata  (nền: Recipe Options + Time Rules + Saved View)
  -> /api/planning/route-status        (lazy theo các rows đang xem)
```

`stViewParams` vẫn nằm trên Candidate path vì đây là điều kiện xác định membership của Candidate; không chuyển phần này sang background.

## Không đổi nghiệp vụ

- Resolver v313 giữ nguyên.
- `MANUAL -> AUTO -> AllOperation fallback -> NextOperation Main fallback -> NO_CHAIN` giữ nguyên.
- READY / PLANNED / Schedule giữ nguyên.
- Recipe suggestion / Batch Key suggestion trên từng Candidate vẫn được tính cùng Candidate row trước khi cho phép thao tác Batch.
- Create Batch / Add Batch / Clear / Schedule không đổi.
- Không có migration SQL mới.

## UI

Bỏ banner `Đang tải Candidate metadata...`.
Nút `Load Candidates` vẫn thể hiện trạng thái request Candidate.
Nếu metadata nền lỗi, Candidate vẫn hiển thị và chỉ báo lỗi metadata riêng.

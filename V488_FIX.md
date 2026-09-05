# V488 — Production Add Job: giữ đầy đủ danh sách Job đã thêm

## Lỗi
Khi Production Add thêm Job mới vào cùng Batch, một Job đã thêm trước đó có thể mất khỏi dòng `Jobs added during production` sau lần refresh/reconciliation tiếp theo. Membership Batch vẫn là nguồn dữ liệu chính, nhưng cờ `isAddedJob` trước đây phụ thuộc quá chặt vào `planning_job_operation_id`.

## Sửa
1. `loadBatchJobDetails()` xác định Production-added bằng audit `production_adjustment_item` loại `ADD_JOB`, trạng thái `APPROVED`, ghép theo **Batch + Job Number**. Chỉ fallback occurrence id cho dữ liệu cũ không có Job Number.
2. Client khi nhận `initialItems` mới sau `router.refresh()` chỉ giữ cờ `isAddedJob` cho Job vẫn tồn tại trong cùng Batch/source row; không tự giữ membership đã bị server loại.
3. Dòng `Jobs added during production` hiển thị số lượng và toàn bộ Job cộng dồn.

## Không đổi
- Không đổi Batch membership / Recipe / Batch Size.
- Không đổi Future ST logic V487.
- Không đổi Masking/Unmasking auto Preparation.
- Không đổi downstream Main Attention.
- Không có SQL migration mới.

## Tài liệu
Logic & Guide và Training được cập nhật song song theo V488.

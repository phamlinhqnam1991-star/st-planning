# V494 · Recent Batches — Export Excel per Batch

Phạm vi: chỉ bổ sung xuất danh sách Job của từng Batch từ tab **Planning Board → Recent Batches**.

- Thêm nút **Export Excel / Xuất Excel** ngay cạnh nút Delete của từng Batch.
- File được tạo server-side từ membership thật trong `planning_batch_job`; không lấy từ state UI.
- Mẫu cột giữ theo Planning Matrix mẫu: `Job`, `Part / Rev`, `Qty`, `Surface`, `Operation Code`, `Previous Operation`, `Next Main Operation`, `Recipe`, `Primer 1`, `Primer 2`, `Primer 3`, `Priority`, `Status`, `Batches`.
- `Qty` và `Surface` là allocation thật của Job trong Batch; `Recipe` ưu tiên Recipe đang lưu trên Batch; `Next Main Operation` đọc Planning Chain active ngay sau occurrence hiện tại.
- File có filter header, freeze dòng tiêu đề và format số/row để đọc nhanh.
- API export yêu cầu `planning.view` và kiểm tra scope Main Planning hiện tại.
- Không thay đổi Batch membership, Recipe, READY/WAIT, Scheduling, Production hoặc database schema. Không có migration SQL mới.
- Logic & Guide và Training đã cập nhật song song.

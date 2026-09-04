# V455 · Masking / Unmasking Production Report grouped by Physical Area

- Chỉ thay đổi cách nhóm hiển thị trong Báo cáo sản xuất / báo cáo điều độ phần Masking & Unmasking.
- Preparation Job được gom theo **Khu vực vật lý của Main Planning liên kết** thay vì panel theo từng Main Operation.
- Ví dụ PRIMER1 / PRIMER2 / TOPCOAT1 / TOPCOAT2 cùng thuộc Painting sẽ nằm chung `Painting (Preparation)`.
- Cột Main trong từng Job vẫn giữ nguyên để phân biệt công đoạn đích.
- Một Job vẫn hiển thị support steps theo đúng thứ tự **Unmasking → Masking**.
- Mỗi support step vẫn giữ execution status / actual start / actual end / note riêng.
- Strict Main Support Config V452 vẫn giữ nguyên; không fallback loại support không được chọn.
- Không thay READY/WAIT, Planning Chain, Recipe, Batch, Schedule, Auto Planning hay dữ liệu execution.

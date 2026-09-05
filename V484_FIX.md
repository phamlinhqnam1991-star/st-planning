# V484 · Production Add Job UX + All Downstream Main Attention

## Phạm vi
Chỉ sửa Production Add Job/Attention và tài liệu liên quan. Không thay đổi business logic khác.

## Thay đổi
1. Add Job nằm cạnh Batch No.; ô nhập chỉ mở khi bấm Add Job, Save/Cancel rõ ràng.
2. Attention hiển thị Recipe No. + Recipe Name của downstream Main.
3. Production-added Job tạo Attention cho tất cả downstream Main trong Planning Chain, không chỉ hop kế tiếp.
4. Nếu downstream Main chưa có Batch, event vẫn được ghi; nếu đã có Batch thì Batch đó hiện Attention.
5. Chặn duplicate NEW attention cùng Source Batch + Job + Downstream Main + Target Batch.
6. Logic & Guide + Training cập nhật song song.

## Database
Không cần migration SQL mới.

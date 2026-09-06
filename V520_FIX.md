# V520_FIX.md

## V520 – Planning Board Quick View compact / no horizontal scroll

Mục tiêu:
- Quick View hiển thị đủ thông tin nhưng gọn hơn.
- Không còn phải cuộn ngang trong popup Quick View.

Phần đã sửa:
1. Gộp cột Quick View từ dạng nhiều cột rời thành dạng compact:
   - Job
   - Part / Rev + Description
   - Qty + dm²
   - Priority
   - Flow (Previous / Main / Next)
   - Recipe (Current / Next)
   - Batch
2. Đổi table sang layout fixed + width 100%.
3. Tắt cuộn ngang ở vùng bảng Quick View.
4. Cho phép nội dung wrap nhiều dòng để vẫn thấy đủ thông tin.

Không đổi logic:
- Dataset Quick View
- READY / WAIT / HOLD
- Add to Batch / Create New Batch
- Rule Recipe / Next Main

# Planning Auto Bridge v307 — Same Main occurrence support

## Lỗi

Schema v296 có check `previous_main_operation <> next_main_operation`. Điều này sai với route có cùng Main Planning lặp lại ở hai occurrence khác nhau, ví dụ `CPBILP#1 -> X -> CPBILP#2`.

## Logic chuẩn

Tên Main có thể giống nhau. Identity của bridge occurrence nằm ở `routing_code + previous_main_seq + next_main_seq`. Finalize chỉ publish khi endpoint không rỗng và `previous_main_seq < next_main_seq`.

## Khôi phục run 100% hiện tại

Không rebuild lại. Chạy migration 055 rồi retry Finalize; staging của run hiện tại được giữ nguyên.

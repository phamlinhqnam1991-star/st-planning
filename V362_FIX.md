# V362 — Paint Recipe Occurrence Guard

## Vấn đề
Cùng một raw Operation Code (ví dụ SIPT) có thể có Recipe Rule cho PRIMER1, PRIMER2 và PRIMER3. Job có thể đồng thời chứa `Part_Masterlist.PRIMER1` và `Part_Masterlist.PRIMER2`, nên resolver cũ cho phép cả hai rule cùng match rồi chọn theo Priority. Kết quả PRIMER1 có thể lấy nhầm Recipe của PRIMER2.

## Sửa
- Thêm occurrence context cho Recipe Resolver.
- `PRIMER`/`PRIMER1` chỉ cho rule paint-specific PRIMER1 cạnh tranh.
- `PRIMER2` chỉ cho PRIMER2; `PRIMER3` chỉ cho PRIMER3.
- `TOPCOAT1`/`TOPCOAT2` tương tự.
- Condition không gắn occurrence (Program, Category, Group...) vẫn dùng bình thường.
- Áp dụng cùng logic cho live Planning Board, Rebuild Planning Chain và Recipe Diagnosis.
- Batch Compatibility tự nhận đúng `recipe_mapping_id` từ resolver, nên checkbox condition cũng đúng occurrence.

## Ví dụ
Job có:
- PRIMER1 = 10P4-2NF
- PRIMER2 = LR-200

Target PRIMER1 + Source SIPT:
- Rule PRIMER1=10P4: hợp lệ.
- Rule PRIMER2=LR-200: bị loại vì sai occurrence.

Target PRIMER2:
- Rule PRIMER2=LR-200: hợp lệ.

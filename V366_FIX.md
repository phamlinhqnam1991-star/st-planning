# V366 — Remove Legacy Paint Selection Lock

- Xóa lớp khóa sơn cũ dựa trực tiếp vào Part Master PRIMER1/2/3/TOPCOAT/ANTI-ABRASION/VARNISH ở Planning Board và Batch Detail.
- READY/checkbox/drag/Select All giờ chỉ bị khóa bởi Main Operation scope và Batch Compatibility chuẩn.
- Batch Compatibility dùng effective Recipe + recipe_mapping_id + các selection_rule condition mà planner đang tích.
- Server Create Batch / Add Job không còn validate thêm một lần bằng Part Master paint field; vẫn giữ validation cùng Recipe và assertSameRecipeConditionGroup.
- Không đổi Sequential READY/WAIT, Recipe Resolver, Process Time hay Scheduling.
- Không cần migration SQL.

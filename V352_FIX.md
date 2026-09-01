# v352 — Multiple Recipe Rules + Exact Batch Compatibility Rule

## Mục tiêu
Cho phép cùng một **Operation Code + Recipe** có nhiều Recipe Rule độc lập với các bộ điều kiện khác nhau, không còn lưu đè lên cùng một dòng.

Ví dụ cùng `V_A-SHPN + A24-rev NC`:
- Rule #101: `AutoSP1.RECIPE PVT = A24-rev NC` AND `AutoSP1.New Execution file Name = 44. WEB - REAR SPAR`
- Rule #102: `AutoSP1.RECIPE PVT = A24-rev NC` AND `AutoSP1.New Execution file Name = 45. FRONT SPAR`
- Rule #103: fallback không điều kiện.

## Thay đổi dữ liệu
Migration `064_recipe_mapping_rule_identity.sql`:
- thêm `md_main_operation_recipe.mapping_id` làm Primary Key;
- bỏ PK cũ `(operation_code, recipe_key)` để cùng Recipe có thể có nhiều Rule;
- thêm `planning_batch.recipe_mapping_id` để Batch nhớ đúng Recipe Rule đã được Job đầu tiên match.

## Công thức & Rule
- Mỗi dòng mapping có `Rule ID` riêng.
- `+ Thêm Recipe Rule`: tạo Rule mới.
- Khi đang sửa, `+ Rule mới cùng Recipe`: giữ Operation/Recipe nhưng tạo Rule condition mới, không ghi đè Rule đang sửa.
- `Sửa`/`Bỏ` thao tác theo `mapping_id`, không còn theo cặp Operation + Recipe.

## Recipe Resolver
Job được resolve theo:
1. các Rule có condition thỏa Job;
2. nếu có Rule condition match thì bỏ qua fallback không condition;
3. Priority nhỏ hơn;
4. Default;
5. Updated time;
6. `mapping_id` để tie-break ổn định.

Resolver trả về cả:
- `recipe_key`;
- `recipe_mapping_id` của Rule thắng.

## Planning Board / Batch Compatibility
- Job READY mang theo `effective_recipe_mapping_id`.
- Job đầu tiên tạo Batch quyết định **Recipe Rule gốc**.
- Panel Batch Compatibility đọc checkbox condition từ đúng `recipe_mapping_id`, không lấy đại một Rule có cùng Recipe.
- Planner vẫn có thể bỏ tích một hoặc nhiều condition để mở rộng nhóm Job cùng Recipe.
- Batch lưu:
  - `recipe_key`;
  - `recipe_mapping_id`;
  - `compatibility_conditions` (subset condition planner đã tích).
- Chọn Existing Batch sẽ khôi phục đúng Rule + subset condition của Batch đó.

## Tương thích Batch cũ
Batch cũ có `recipe_mapping_id = NULL` vẫn được hỗ trợ bằng fallback Operation Code + Recipe. Khi có thể xác định Rule lúc Add Job, hệ thống sẽ lưu lại `recipe_mapping_id` cho Batch.

## Lưu ý triển khai
Phải chạy migration **064** sau migration 063 trước khi deploy source v352.

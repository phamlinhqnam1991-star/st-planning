# Masking / Unmasking by Main Operation v451

## Mục tiêu

Thêm lớp cấu hình rõ ràng `Main Operation -> Masking / Unmasking BEFORE MAIN` trên nền resolver routing hiện tại.

## Nguyên tắc occurrence

- PRIMER occurrence 1 -> `PRIMER` trong DB, UI hiển thị `PRIMER1`.
- PRIMER occurrence 2 -> `PRIMER2`.
- PRIMER occurrence 3+ -> `PRIMER3`.
- TOPCOAT occurrence 1 -> `TOPCOAT1`.
- TOPCOAT occurrence 2+ -> `TOPCOAT2`.

Do đó cùng raw paint operation vẫn có thể có cấu hình support khác nhau cho từng lần sơn.

## Default cấu hình

| Main | Masking trước Main | Unmasking trước Main |
|---|---|---|
| PRIMER1 | MSKG-TC | UNMSKG |
| PRIMER2 | MSKG-TC | UNMSKG |
| PRIMER3 | MSKG-TC | UNMSKG |
| TOPCOAT1 | MSKG-TC | UNMSKG |
| TOPCOAT2 | MSKG-TC | UNMSKG |
| ANTI-ABRASION | MSKGABP | UNMSKG |
| PAINT MARKING | MSKG-TC | UNMSKG |
| VARNISH | MSKG-TC | UNMSKG |

Danh sách này là cấu hình, planner có thể thêm/bớt từ UI mà không sửa code.

## Resolver

1. Vẫn xác định đoạn routing support nằm giữa Main trước và Main hiện tại.
2. Vẫn nhận `UNMSKG*` là Unmasking, các `*MSKG*` còn lại là Masking.
3. Nếu Main + Support Type đã có cấu hình active, chỉ Operation Code được chọn mới được nhận. Mã cấu hình dạng family như `MSKG-TC`/`UNMSKG` cũng nhận các detail bắt đầu bằng `MSKG-TC_`/`UNMSKG_`.
4. Nếu Main chưa có cấu hình, giữ fallback resolver v359 để không phá routing cũ.

## Không thay đổi

Không thay READY/WAIT, Planning Chain, Recipe, Batch Compatibility, Process Time, Scheduling Engine, Auto Planning hoặc Production status.

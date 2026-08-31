# Planning NextOperation Main NO_CHAIN Rescue — v313

## Mục tiêu

Bổ sung trường hợp cuối cùng trước `NO CHAIN`:

> Nếu `NextOperation` chính là một Main Planning operation thì Main đó là `Current Main`.

`Next Main Planning` không suy đoán từ history; nó tiếp tục lấy theo thứ tự các Main Planning phía sau trong `AllOperation` của chính Job.

## Resolver

```text
LastLaborOp + NextOperation
  -> MANUAL Segment
  -> AUTO Segment
  -> AllOperation fallback
  -> nếu vẫn NO_CHAIN: NextOperation có phải Main Planning?
       -> Có: NextOperation = Current Main
               Next Main(s) = các Main phía sau trong AllOperation
       -> Không: NO CHAIN
```

Fallback mới chỉ chạy khi resolver trước đó không tìm được vị trí hợp lệ. Nó không thay thế Manual/Auto Bridge hoặc AllOperation fallback đang hoạt động đúng.

## Cách nhận biết NextOperation là Main Planning

Không so chuỗi tên đơn thuần. Hệ thống dùng canonical route đã chuẩn hóa từ:

`AllOperation -> ST Operation Mapping -> Main Operation -> Planning Scope`

`NextOperation` được xem là Main Planning khi nó khớp một canonical Main occurrence thật của Job (theo `sourceCode`, hoặc tên Main chuẩn khi phù hợp).

## Trường hợp occurrence lặp lại

Nếu cùng `NextOperation` xuất hiện nhiều lần trong `AllOperation`:

1. Ưu tiên exact pair `LastLaborOp -> NextOperation`.
2. Nếu không liền nhau, dùng ordered pair gần nhất.
3. Nếu vẫn còn nhiều canonical occurrence khác nhau, trả `NO CHAIN`; không tự đoán.

## LastLaborOp rỗng

Nếu `LastLaborOp` rỗng/stale nhưng `NextOperation` chỉ có đúng một Main Planning occurrence, vẫn áp dụng rule:

`Current Main = NextOperation`.

Nếu có nhiều occurrence và không đủ dữ liệu để xác định occurrence, giữ `NO CHAIN`.

## Next Main Planning

Sau khi xác định Current Main, không cần một resolver song song. Chain active lấy suffix của canonical `full[]`:

```text
Current Main -> Next Main 1 -> Next Main 2 -> ...
```

Do `full[]` được sinh trực tiếp từ `AllOperation`, Next Main Planning tự động tuân theo đúng sequence AllOperation, Mapping và Planning Scope.

## Không thay đổi

- Logic plan-ahead v312: Current + toàn bộ Next Main(s) chưa có Batch = READY.
- Recipe / Batch Key.
- Batch / Schedule model.
- Manual / Auto Intermediate Bridge discovery.
- Scheduling engine.
- Không có migration SQL mới.

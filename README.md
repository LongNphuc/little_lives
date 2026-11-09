# Payment – Thư viện tính hóa đơn và xử lý thanh toán

## 1. Giới thiệu

Đây là bài làm cho bài test **"Payment"** (Node.js / TypeScript).

Đây là **thư viện logic thuần**: không có web, API, database hay giao diện. Thư viện làm 3 việc:

1. **Hóa đơn (Invoice)**: tính tiền từng dòng (`quantity × unitPrice`), cộng thuế GST 7%, ra tổng cuối cùng.
2. **Thanh toán (Payment)**: nhận tiền bằng `cash` hoặc `bank_transfer`, cho phép trả một phần, trả dư, và theo dõi trạng thái hóa đơn.
3. **Biên lai (Receipt)**: phân bổ số tiền vừa trả vào từng dòng của hóa đơn, cho biết còn nợ bao nhiêu, và lưu mã tham chiếu thanh toán.

## 2. Cách cài và chạy

Yêu cầu: Node.js 18 trở lên.

| Lệnh | Việc làm |
|---|---|
| `npm install` | cài thư viện |
| `npm test` | chạy toàn bộ test (Jest) |
| `npm run build` | biên dịch TypeScript ra thư mục `dist/` |
| `npm run test:coverage` | chạy test và xem độ phủ |

## 3. Cấu trúc thư mục

```
src/
  types.ts        Tất cả interface và type (Invoice, Payment, Receipt, ...)
  constants.ts    Hằng số: MAX_AMOUNT, GST_RATE, PAYMENT_METHODS
  errors.ts       Class ValidationError dùng cho mọi lỗi
  money.ts        Đổi tiền <-> cents và làm tròn
  validation.ts   Kiểm tra dữ liệu đầu vào, tạo thông báo lỗi rõ ràng
  invoice.ts      calculateInvoiceTotal, createInvoice
  payment.ts      processPayment
  receipt.ts      generateReceipt (phân bổ tiền vào từng dòng)
  index.ts        Điểm export chung của thư viện
tests/
  helpers.ts                    Hàm hỗ trợ dùng chung cho test
  scenario1.invoice.test.ts     Scenario 1: tính hóa đơn, làm tròn
  scenario2.payment.test.ts     Scenario 2: trả nhiều lần, trả dư
  scenario3.edge-cases.test.ts  Scenario 3: hóa đơn 0 đồng, số âm, số lớn, nhiều lần trả
  receipt.test.ts               Biên lai và đối soát
```

## 4. Luồng hoạt động

```
createInvoice(items, taxRate)
      │  hóa đơn mới: status UNPAID, outstandingAmount = totalAmount
      ▼
processPayment(invoice, amount, method)
      │  trả về { invoice (bản MỚI), payment, overpaymentAmount }
      │  invoice gốc KHÔNG bị sửa
      ▼
generateReceipt(result.payment, result.invoice)
      │  biên lai: số tiền đã trả, còn nợ, phân bổ vào từng dòng
      ▼
processPayment(result.invoice, amount2, method2)   ← lần trả tiếp theo dùng invoice vừa trả về
```

**Bước 1 – Tạo hóa đơn.** `calculateInvoiceTotal` tính từng dòng:

- `lineTotal = quantity × unitPrice × (1 − discountRate)`
- `taxAmount = lineTotal × taxRate`
- `subtotal = tổng lineTotal`, `totalTax = tổng taxAmount`, `totalAmount = subtotal + totalTax`

`createInvoice` gọi hàm trên rồi tạo `Invoice` có `id`, `invoiceNumber` (tự sinh nếu không truyền), `invoiceDate`.

**Bước 2 – Thanh toán.** `processPayment` kiểm tra đầu vào, rồi:

- `outstandingAmount mới = outstandingAmount cũ − số tiền trả`
- Trạng thái hóa đơn:

| outstandingAmount mới | status |
|---|---|
| > 0 | `PARTIALLY_PAID` |
| = 0 | `PAID` |
| < 0 | `OVERPAID` (trả dư) |

- Tạo `Payment` có `referenceNumber` duy nhất (dạng `PAY-<uuid>`) và `status = "COMPLETED"`.

**Bước 3 – Biên lai.** `generateReceipt` nhận payment và **hóa đơn sau khi trả** (`result.invoice`):

- Tính số tiền đã trả trước lần này: `paidBefore = totalAmount − outstandingAmount − payment.amount`.
- Duyệt các dòng theo thứ tự. Mỗi dòng có `itemTotal = lineTotal + taxAmount`. Phần đã được các lần trả trước phủ thì bỏ qua, rồi lấy tiền của lần này trả tiếp cho dòng đó cho đến khi hết tiền.
- `allocatedAmount` = tiền lần này trả cho dòng đó, `remainingAmount` = dòng đó còn nợ bao nhiêu.
- `remainingBalance = invoice.outstandingAmount` (âm nếu trả dư), `receiptNumber` duy nhất (dạng `RCP-<uuid>`).

## 5. Những điểm khác với đề

- **Thêm `discountRate?` (từ 0 đến 1) vào `InvoiceItem`.** Dùng để làm hàng khuyến mãi hoặc hàng miễn phí (`discountRate = 1` nghĩa là giảm 100%). Nhờ vậy dễ tạo được hóa đơn 0 đồng cho Case 3 mà không phải cho phép `unitPrice = 0`. Trường này không bắt buộc, không truyền thì coi như 0.
- **Thêm kiểu `InvoiceItemInput`.** Test của đề truyền item chỉ có `description`, `quantity`, `unitPrice` (chưa có `id`, `lineTotal`, `taxAmount`...). Vì vậy `calculateInvoiceTotal` nhận `InvoiceItemInput[]`.
- **`PaymentResult` có thêm `overpaymentAmount`.** Cho biết lần trả này dư bao nhiêu (0 nếu không dư), người dùng không phải tự tính.

## 6. Quy ước tính toán

- **Tính bằng cents (số nguyên).** Số thực trong JavaScript bị sai lệch nhỏ (`0.1 + 0.2 = 0.30000000000000004`). Vì vậy mọi phép cộng trừ tiền đều đổi sang cents trước (`500.00` → `50000`), tính xong mới đổi lại. Kết quả `0.1 + 0.2` ra đúng `0.30`.
- **Thuế tính theo từng dòng rồi cộng lại**, không tính một lần trên tổng. Nhờ vậy tổng thuế luôn bằng tổng các `taxAmount` trên từng dòng, in ra hóa đơn khớp từng con số.
- **Mỗi dòng chỉ làm tròn một lần** đến cent gần nhất, kiểu làm tròn "nửa lên" (0.5 cent → 1 cent). Trước khi làm tròn, sai số nhỏ của số thực được loại bỏ (ví dụ `16.4999999999` thực chất là `16.5` nên được làm tròn lên `17`).
- Tổng hóa đơn = tổng các dòng, không làm tròn thêm lần nào nữa.

## 7. Quy tắc validate

Mọi lỗi đều ném `ValidationError` (có `name = "ValidationError"`). Thông báo bằng tiếng Anh, có tên trường, vị trí và tên của item bị lỗi, và giá trị đã nhận. Ví dụ:

```
Item #2 ("Activity Fee"): quantity must be greater than 0, received -2
```

| Trường | Điều kiện | Lý do |
|---|---|---|
| `items` | phải là mảng; mảng rỗng **hợp lệ** | hóa đơn rỗng = hóa đơn 0 đồng |
| `description` | chuỗi, sau khi bỏ khoảng trắng không được rỗng | dòng hóa đơn phải có tên |
| `quantity` | số hữu hạn, **> 0** (cho phép số lẻ như 1.5 giờ) | số lượng 0 hoặc âm không có ý nghĩa |
| `unitPrice` | số hữu hạn, **> 0**, tối đa 2 chữ số thập phân | không có giá 0/âm; tránh tự làm tròn mất tiền |
| `discountRate` | không bắt buộc; nếu có: số hữu hạn, **0 ≤ x ≤ 1** | là tỉ lệ (0.1 = 10%) |
| `taxRate` | số hữu hạn, **0 ≤ x ≤ 1** | là tỉ lệ; truyền `7` thay vì `0.07` sẽ bị báo lỗi |
| `quantity × unitPrice` | ≤ 1.000.000.000 | chặn tràn số ngay ở từng dòng |
| tổng hóa đơn | ≤ 1.000.000.000 (`MAX_AMOUNT`) | giới hạn an toàn khi tính bằng cents |
| `paymentAmount` | số hữu hạn, **> 0**, ≤ 1.000.000.000, tối đa 2 chữ số thập phân | không trả 0/âm; không trả 0.005 |
| `paymentMethod` | chỉ `"cash"` hoặc `"bank_transfer"` | đúng đề |
| `invoice` (khi thanh toán) | có `id`; `totalAmount ≥ 0`; `outstandingAmount` hữu hạn và không lớn hơn `totalAmount` | chặn hóa đơn bị sửa sai từ bên ngoài |

`NaN`, `Infinity`, `-Infinity`, và kiểu sai (ví dụ `"500"` dạng chuỗi) đều bị từ chối.

## 8. Mô tả các case

**Case 3 – Hóa đơn 0 đồng.**
Tạo được bằng danh sách item rỗng, hoặc item có `discountRate = 1`. `createInvoice` cho ra `totalAmount = 0`, `outstandingAmount = 0`, `status = "PAID"` (không có gì để trả). Gọi `processPayment` trên hóa đơn này bị từ chối với lỗi `Invoice is already fully paid or has nothing to pay`.

**Case 4 – Số âm và giá trị không hợp lệ.**
`quantity`, `unitPrice`, `paymentAmount` bằng 0 hoặc âm, `discountRate`/`taxRate` ngoài khoảng 0..1, `NaN`, `Infinity`, `description` rỗng, `paymentMethod` sai đều bị từ chối, kèm thông báo nói rõ trường nào sai và giá trị đã nhận.

**Case 5 – Số rất lớn.**
Giới hạn là `MAX_AMOUNT = 1.000.000.000`. Hóa đơn đúng bằng giới hạn được chấp nhận; vượt giới hạn (kể cả chỉ 0.01, hoặc vượt do cộng thuế) bị từ chối; `paymentAmount` vượt giới hạn cũng bị từ chối.

**Case 6 – Nhiều khoản thanh toán cho một hóa đơn.**
Hàm là hàm thuần nên mỗi lần trả sẽ trả về một **invoice mới**. Lần trả sau phải dùng invoice của lần trước:

Mỗi lần trả có `referenceNumber` khác nhau. Sau mỗi lần, `tổng đã trả + outstandingAmount = totalAmount`. Hóa đơn đã `PAID` hoặc `OVERPAID` không nhận thêm tiền.

## 9. Giả định

**Giả định**

- Một hóa đơn chỉ dùng một `taxRate` cho mọi dòng (đúng chữ ký `calculateInvoiceTotal(items, taxRate)`).
- Thuế tính trên số tiền **sau** giảm giá.
- Tiền chỉ có 2 chữ số thập phân (ví dụ SGD, USD). Không hỗ trợ nhiều loại tiền.
- Thanh toán được ghi nhận là thành công ngay (`status = "COMPLETED"`)
- Biên lai phân bổ tiền theo **thứ tự các dòng** trên hóa đơn (dòng đầu được trả trước). Thuế của mỗi dòng được trả cùng với dòng đó.

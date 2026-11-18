---
description: "SnapOtter thu thập dữ liệu sử dụng ẩn danh nào, khi nào nó được gửi, và cách tắt phân tích sản phẩm trên toàn phiên bản."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 05c300999c48
i18n_hash_version: 2
---

# SnapOtter thu thập những gì {#what-snapotter-collects}

Phân tích Sản phẩm Ẩn danh được bật theo mặc định và được đặt cho toàn bộ phiên bản bởi một quản trị viên. Hãy tắt nó trong Settings > System > Privacy.

## Các sự kiện chúng tôi gửi (khi được bật) {#events-we-send-when-enabled}

- tool_used: id công cụ, trạng thái, thời lượng, danh mục, có phải là công cụ AI hay không, mã lỗi khi thất bại.
- pipeline_executed: số bước, id công cụ, cờ batch, số lượng tệp, thời lượng, trạng thái.
- ai_bundle_action: id gói, hành động, thời lượng.
- Sử dụng frontend: những trang công cụ nào được mở, tệp được thêm (chỉ số lượng), công cụ được khởi động, lượt tải xuống, lượt lưu, tìm kiếm (chỉ số lượng kết quả), batch được xử lý.
- Báo cáo sự cố: loại lỗi, thông báo lỗi đã được lược bỏ thông tin nhạy cảm (bỏ tên tệp, đường dẫn, email và các giá trị trong dấu ngoặc kép), một stack nguồn với tên cơ sở của tệp, và với các công cụ AI là một traceback Python chỉ chứa tên cơ sở của tệp.

## Những gì chúng tôi không bao giờ thu thập {#what-we-never-collect}

- Tên hoặc đường dẫn tệp
- Nội dung tệp
- Văn bản kết quả OCR
- Siêu dữ liệu hình ảnh (EXIF)
- Văn bản tài liệu được trích xuất
- Danh tính tài khoản của bạn

Giống như mọi máy chủ, PostHog thấy địa chỉ IP mà mỗi yêu cầu gửi đến. Dự án PostHog của chúng tôi loại bỏ địa chỉ này thay vì lưu trữ, và các sự kiện từ chính máy chủ SnapOtter gửi một giá trị giữ chỗ thay cho nó.

## Thông báo cập nhật {#update-notices}

Khi phân tích đang bật, máy chủ hỏi PostHog vài giờ một lần xem bản phát hành SnapOtter mới nhất là bản nào, dùng ID ẩn danh của phiên bản cài đặt và phiên bản hiện tại. Khi có bản mới hơn, quản trị viên sẽ thấy thông báo kèm liên kết tới ghi chú phát hành. Nếu bạn đóng thông báo, nó sẽ ẩn cho tới bản phát hành tiếp theo. Không có gì được tự động cài đặt hay tải xuống, và khi phân tích bị tắt, máy chủ không bao giờ hỏi.

## Cách tắt nó {#turning-it-off}

Quản trị viên: Settings > System > Privacy, gạt "Anonymous Product Analytics" sang tắt. Nó dừng ngay lập tức, trên toàn phiên bản. Để build một image không bao giờ có thể phát dữ liệu, hãy đặt build arg `SNAPOTTER_ANALYTICS=off`.

Để khởi chạy một phiên bản mới với phân tích đã tắt sẵn, hãy thêm `SNAPOTTER_ANALYTICS_DEFAULT=off` vào môi trường của máy chủ trước lần khởi động đầu tiên. Với Docker Compose, hãy đặt nó dưới `environment:` của dịch vụ ứng dụng, vì chỉ đặt trong `.env` thì biến này không đến được container.

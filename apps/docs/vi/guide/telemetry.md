---
description: "SnapOtter thu thập những dữ liệu sử dụng ẩn danh nào, khi nào chúng được gửi, lựa chọn ở lần chạy đầu tiên hoạt động ra sao và cách tắt phân tích sản phẩm trên toàn bộ phiên bản."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 65a168064c43
i18n_hash_version: 2
---

# SnapOtter thu thập những gì {#what-snapotter-collects}

Anonymous Product Analytics do quản trị viên thiết lập cho toàn bộ phiên bản. Một phiên bản mới sẽ hỏi ở lần chạy đầu tiên và không gửi gì cho đến khi có người trả lời. Bạn có thể thay đổi bất cứ lúc nào tại Settings > System > Privacy.

Khi phân tích được bật, SnapOtter gửi cho PostHog biết công cụ và pipeline nào được chạy, mất bao lâu, có thành công hay không, mã lỗi và số lượng tệp, cùng với ID ẩn danh của phiên bản, phiên bản phần mềm, kiến trúc CPU, hệ điều hành, loại cài đặt và việc có GPU hay không. Báo cáo sự cố được gửi đến Sentry sau khi đã loại bỏ tên tệp, đường dẫn, email và các giá trị trong dấu ngoặc kép. SnapOtter không bao giờ gửi tệp của bạn, tên hay đường dẫn của chúng, nội dung của chúng, kết quả OCR hoặc văn bản đã trích xuất, siêu dữ liệu ảnh, hay danh tính tài khoản của bạn. PostHog và Sentry là hai nơi duy nhất nó gửi dữ liệu đến, và khi phân tích tắt thì không gửi gì đến cả hai.

## Lựa chọn ở lần chạy đầu tiên {#first-run-choice}

Lần đầu tiên quản trị viên mở một phiên bản mới, SnapOtter hỏi: "Gửi thống kê sử dụng ẩn danh và báo cáo sự cố? Tệp của bạn không bao giờ được gửi đi." Hai câu trả lời có trọng số ngang nhau và không câu nào được chọn sẵn. Đóng hộp thoại mà không trả lời sẽ giữ phân tích ở trạng thái tắt và câu hỏi sẽ hiện lại ở lần truy cập tiếp theo. Chỉ quản trị viên mới thấy câu hỏi này. Với `AUTH_ENABLED=false`, không có tài khoản nào và người dùng cục bộ đóng vai trò quản trị viên, nên ai mở ứng dụng thì người đó trả lời. Ứng dụng máy tính hỏi theo cách tương tự.

Phiên bản đã chạy từ trước khi có câu hỏi này sẽ không bị hỏi. Nó giữ nguyên thiết lập phân tích đã có: bật, trừ khi quản trị viên hoặc `SNAPOTTER_ANALYTICS_DEFAULT=off` đã tắt.

## Các sự kiện chúng tôi gửi (khi được bật) {#events-we-send-when-enabled}

- tool_used: id công cụ, trạng thái, thời lượng, danh mục, có phải là công cụ AI hay không, mã lỗi khi thất bại, và tên bước đối với công cụ báo cáo riêng một giai đoạn (bước phân tích của Passport Photo).
- pipeline_executed: số bước, id công cụ, cờ batch, số lượng tệp, thời lượng, trạng thái.
- ai_bundle_action: id gói, hành động (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), thời lượng và, khi cài đặt thất bại, một loại lỗi từ danh sách cố định (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Đầu ra của trình cài đặt, đường dẫn và thông báo lỗi không bao giờ được gửi.
- Sử dụng frontend: những trang công cụ nào được mở, tệp được thêm (chỉ số lượng), công cụ được khởi động, lượt tải xuống, lượt lưu, tìm kiếm (chỉ số lượng kết quả), batch được xử lý.
- Báo cáo sự cố: loại lỗi, thông báo lỗi đã được lược bỏ thông tin nhạy cảm (bỏ tên tệp, đường dẫn, email và các giá trị trong dấu ngoặc kép), một stack nguồn với tên cơ sở của tệp, và với các công cụ AI là một traceback Python chỉ chứa tên cơ sở của tệp.

## Những gì chúng tôi không bao giờ thu thập {#what-we-never-collect}

- Tên tệp hoặc đường dẫn
- Nội dung tệp
- Văn bản kết quả OCR
- Siêu dữ liệu ảnh (EXIF)
- Văn bản trích xuất từ tài liệu
- Danh tính tài khoản của bạn

PostHog thấy địa chỉ IP mà mỗi yêu cầu đến từ đó, như bất kỳ máy chủ nào. Dự án PostHog của chúng tôi loại bỏ địa chỉ này thay vì lưu trữ, và các sự kiện từ máy chủ của chính SnapOtter gửi một giá trị giữ chỗ thay cho nó.

## Thông báo cập nhật {#update-notices}

Khi phân tích đang bật, máy chủ hỏi PostHog vài giờ một lần xem bản phát hành SnapOtter nào là mới nhất, dùng ID ẩn danh của phiên bản và phiên bản phần mềm của nó. Khi có bản phát hành mới hơn, quản trị viên thấy một thông báo kèm liên kết đến ghi chú phát hành. Nếu bạn bỏ qua, thông báo sẽ ẩn cho đến bản phát hành kế tiếp. Không có gì được cài đặt hay tải xuống thay bạn, và khi phân tích tắt thì máy chủ không bao giờ hỏi.

## Tắt tính năng này {#turning-it-off}

Quản trị viên: Settings > System > Privacy, tắt "Anonymous Product Analytics". Việc gửi dừng ngay lập tức, trên toàn bộ phiên bản. Để tạo một image không bao giờ gửi dữ liệu, hãy đặt build arg `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` trong môi trường của máy chủ có tác dụng tương tự khi chạy và được ưu tiên hơn mọi câu trả lời đã lưu trong ứng dụng.

Để trả lời trước câu hỏi ở lần chạy đầu tiên, hãy thêm `SNAPOTTER_ANALYTICS_DEFAULT=off` (hoặc `on`) vào môi trường của máy chủ trước lần khởi động đầu tiên, và sẽ không ai bị hỏi. Với Docker Compose, hãy đặt nó trong `environment:` của dịch vụ ứng dụng, vì chỉ đặt trong `.env` thì giá trị không đến được container.

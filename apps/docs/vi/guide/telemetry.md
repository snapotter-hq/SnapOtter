---
description: "SnapOtter thu thập dữ liệu sử dụng ẩn danh nào, khi nào nó được gửi, và cách tắt phân tích sản phẩm trên toàn phiên bản."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: fe718032834f
---

# SnapOtter thu thập những gì {#what-snapotter-collects}

Phân tích Sản phẩm Ẩn danh được bật theo mặc định và được đặt cho toàn bộ phiên bản bởi một quản trị viên. Hãy tắt nó trong Settings > System > Privacy.

## Các sự kiện chúng tôi gửi (khi được bật) {#events-we-send-when-enabled}

- tool_used: id công cụ, trạng thái, thời lượng, danh mục, có phải là công cụ AI hay không, mã lỗi khi thất bại.
- pipeline_executed: số bước, id công cụ, cờ batch, số lượng tệp, thời lượng, trạng thái.
- ai_bundle_action: id gói, hành động, thời lượng.
- Sử dụng frontend: những trang công cụ nào được mở, tệp được thêm (chỉ số lượng), công cụ được khởi động, lượt tải xuống, lượt lưu, tìm kiếm (chỉ số lượng kết quả), batch được xử lý.
- Báo cáo sự cố: loại lỗi và một stack nguồn chỉ với tên cơ sở của tệp.

## Những gì chúng tôi không bao giờ thu thập {#what-we-never-collect}

- Tên hoặc đường dẫn tệp
- Nội dung tệp
- Văn bản kết quả OCR
- Siêu dữ liệu hình ảnh (EXIF)
- Văn bản tài liệu được trích xuất
- Địa chỉ IP hoặc danh tính tài khoản của bạn

## Cách tắt nó {#turning-it-off}

Quản trị viên: Settings > System > Privacy, gạt "Anonymous Product Analytics" sang tắt. Nó dừng ngay lập tức, trên toàn phiên bản. Để build một image không bao giờ có thể phát dữ liệu, hãy đặt build arg `SNAPOTTER_ANALYTICS=off`.

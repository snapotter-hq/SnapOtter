---
title: "Mã lỗi"
description: "Cấu trúc nội dung lỗi, các mã ổn định và cách xử lý từng mã."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 349fbdcc9823
i18n_hash_version: 2
---

# Mã lỗi {#error-codes}

Mọi phản hồi lỗi JSON đều có cùng một cấu trúc:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Trường | Luôn có | Ý nghĩa |
|-------|----------------|---------|
| `error` | Có | Thông báo dành cho người đọc. An toàn để hiển thị cho người dùng. Không nên phân tích cú pháp nó. |
| `code` | Có | Mã ổn định, đọc được bằng máy. Hãy rẽ nhánh logic theo mã này. |
| `requestId` | Có | ID của máy chủ cho yêu cầu này. Hãy nêu ID này khi báo lỗi; nó khớp với nhật ký máy chủ. |
| `details` | Đôi khi | Thêm ngữ cảnh cho một số lỗi 4xx, chẳng hạn thông báo xác thực. |

Thông báo có thể thay đổi giữa các bản phát hành. Mã thì không, vì vậy hãy viết logic phía client dựa trên `code`.

## Mã suy ra từ trạng thái HTTP {#status-codes}

Khi một route không đặt mã riêng, máy chủ sẽ suy ra mã từ trạng thái:

| Trạng thái HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Bất kỳ mã 4xx nào khác sẽ quay về `BAD_REQUEST`, và bất kỳ mã 5xx nào khác sẽ quay về `INTERNAL_ERROR`.

Một route có thể đặt mã cụ thể hơn, khi đó phản hồi sẽ mang mã đó thay thế. Ví dụ, một công cụ không thể chạy vì thiếu gói AI sẽ trả về một mã riêng của tính năng. Các mã đó được mô tả cùng với tính năng phát sinh ra chúng.

## Xác thực và quyền truy cập {#auth-codes}

| `code` | Trạng thái | Cần làm gì |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Gửi `Authorization: Bearer <token>` kèm token phiên hoặc khóa API (`si_...`). |
| `FORBIDDEN` | 403 | Thông tin xác thực hợp lệ nhưng thiếu quyền. Hãy nhờ quản trị viên cấp quyền. |
| `MUST_CHANGE_PASSWORD` | 403 | Tài khoản phải đổi mật khẩu trước khi gọi các endpoint khác. Gọi `POST /api/auth/change-password` với token phiên, rồi thử lại. |
| `USER_DISABLED` | 403 | Tài khoản đã bị vô hiệu hóa. Quản trị viên phải bật lại. |
| `LOGIN_THROTTLED` | 429 | Quá nhiều lần đăng nhập thất bại. Hãy chờ trước khi thử lại. |
| `VALIDATION_ERROR` | 400 | Nội dung hoặc tham số của yêu cầu không vượt qua bước xác thực. `details` nêu rõ vấn đề. |

Tài khoản quản trị viên chạy lần đầu là `admin` với mật khẩu `admin` trừ khi `DEFAULT_USERNAME` hoặc `DEFAULT_PASSWORD` đã thay đổi. Trừ khi `SKIP_MUST_CHANGE_PASSWORD` được đặt, tài khoản đó nhận `MUST_CHANGE_PASSWORD` ở mọi lệnh gọi cho đến khi mật khẩu được đổi.

## Tác vụ {#job-codes}

Một tác vụ thất bại sẽ báo lý do ngay trên tác vụ đó, không phải trong lỗi HTTP. Hãy đọc `error.code` và `error.message` từ `GET /api/v1/jobs/{jobId}`. Xem [Theo dõi tiến trình](/vi/api/rest#progress-tracking).

## Chưa được lập danh mục {#not-yet-cataloged}

Các mã do từng tính năng riêng lẻ phát sinh (ví dụ mã hóa, OIDC, SCIM và nhóm) chưa được mô tả trên trang này. Mỗi mã đều là một mã ổn định; hãy coi mã chưa được liệt kê là không rõ nghĩa và xử lý nó theo trạng thái.

---
title: "Mã lỗi"
description: "Cấu trúc nội dung lỗi, các mã ổn định và cách xử lý từng mã."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: dc0609daf1f4
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
| `MUST_CHANGE_PASSWORD` | 403 | Tài khoản phải đổi mật khẩu trước khi gọi các endpoint khác. Hãy gọi `POST /api/auth/change-password` bằng token phiên, rồi thử lại. |
| `USER_DISABLED` | 403 | Tài khoản đã bị vô hiệu hóa. Quản trị viên phải bật lại. |
| `LOGIN_THROTTLED` | 429 | Quá nhiều lần đăng nhập thất bại. Hãy đợi một lúc rồi thử lại. |
| `VALIDATION_ERROR` | 400 | Nội dung hoặc tham số của yêu cầu không qua được bước xác thực dữ liệu. `details` chỉ ra vấn đề. |

Tài khoản quản trị viên lần chạy đầu tiên là `admin` với mật khẩu `admin`, trừ khi `DEFAULT_USERNAME` hoặc `DEFAULT_PASSWORD` đã thay đổi. Trừ khi đặt `SKIP_MUST_CHANGE_PASSWORD`, tài khoản đó sẽ nhận `MUST_CHANGE_PASSWORD` ở mọi lệnh gọi cho đến khi mật khẩu được đổi.

## Công việc {#job-codes}

Một công việc thất bại sẽ báo lý do ngay trên công việc đó, không phải trong lỗi HTTP. Hãy đọc `error.code` và `error.message` từ `GET /api/v1/jobs/{jobId}`. Xem [Theo dõi tiến trình](/vi/api/rest#progress-tracking).

Một công việc thất bại chỉ giữ lại `error.code` khi lỗi là lỗi đầu vào hoặc lỗi của máy chủ. Các lỗi khác chỉ mang thông báo.

| `code` | Ý nghĩa | Cần làm gì |
|--------|---------|------------|
| `CANCELED` | Công việc đã bị người dùng hủy. Đây không phải là trạng thái HTTP. Các sự kiện tiến trình mang `phase: failed` với mã này. | Coi đó là người dùng tự hủy. Không tự động thử lại. |
| `INPUT_MISSING` | Đầu vào đã bị xóa trước khi công việc chạy. | Tải tệp lên lại. |
| `ENGINE_UNAVAILABLE` | Một engine cần thiết không thể khởi động trên máy chủ. | Hãy thử lại sau khi quản trị viên sửa bản cài đặt. |

## Xác thực và MFA {#mfa-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Chính sách MFA yêu cầu đăng ký, và instance này không thể đăng ký cho người dùng (không có giấy phép doanh nghiệp). Các instance có giấy phép sẽ trả về 200 kèm `requiresMfaEnrollment: true` và hướng dẫn người dùng đăng ký. | Không thử lại. Quản trị viên phải thay đổi chính sách hoặc dùng CLI khôi phục ngoại tuyến. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Máy chủ không đọc được chính sách MFA trong lúc đăng nhập. | Hãy thử đăng nhập lại sau ít phút. |
| `INVALID_CODE` | 401 | Mã TOTP hoặc mã khôi phục không đúng. | Yêu cầu người dùng nhập mã mới rồi thử lại. Nhiều lần thất bại liên tiếp sẽ dẫn đến `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Nhập sai mã quá nhiều lần. Thử thách bị hủy. | Bắt đầu đăng nhập lại để nhận thử thách mới. |
| `MFA_EXPIRED` | 401 | Thử thách MFA hoặc đăng ký đã hết hạn hoặc không khớp. | Bắt đầu đăng nhập lại. |
| `MFA_NOT_CONFIGURED` | 401 | Tài khoản không có khóa bí mật TOTP, nên không thể kiểm tra mã. | Hãy đăng ký MFA trước khi đăng nhập bằng mã. |
| `MFA_ALREADY_ENABLED` | 409 | MFA đã được bật trên tài khoản. | Không đăng ký lại. |
| `NO_PENDING_ENROLLMENT` | 400 | Một yêu cầu xác nhận đăng ký đến mà không có lượt đăng ký nào đang chờ. | Hãy gọi endpoint đăng ký trước. |
| `MFA_NOT_ENABLED` | 400 | Thao tác này cần MFA đang bật, nhưng nó đang tắt với người dùng này. | Bỏ qua thao tác, hoặc bật MFA trước. |
| `MFA_DECRYPTION_FAILED` | 500 | Không thể giải mã khóa bí mật TOTP đã lưu. | Việc của người vận hành. Thường điều này có nghĩa là khóa mã hóa đã thay đổi. Hãy kiểm tra `DATA_ENCRYPTION_KEY` và `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Không thể giải mã một giá trị đã lưu (một thiết lập, một header xác thực webhook hoặc một khóa bí mật TOTP). | Việc của người vận hành, như trên. Không thử lại. |
| `IDLE_TIMEOUT` | 401 | Phiên đã hết hạn do không hoạt động trong một khoảng thời gian. | Đăng nhập lại. |
| `INVALID_PASSWORD` | 401 | Mật khẩu hiện tại không đúng khi đổi mật khẩu. | Yêu cầu người dùng nhập mật khẩu hiện tại. |
| `PASSWORD_CHANGED` | 409 | Mật khẩu đã được đổi ở một phiên khác, hoặc quản trị viên đã đặt lại nó, trong lúc yêu cầu này đang chạy. | Đăng nhập lại. |
| `OIDC_NO_PASSWORD` | 400 | Có yêu cầu đổi hoặc đặt lại mật khẩu cho một tài khoản được tạo qua SSO. | Hướng người dùng đến nhà cung cấp danh tính. |

## OIDC {#oidc-codes}

Lỗi OIDC khi đăng nhập không trả về nội dung JSON. Route đăng nhập chuyển hướng đến trang đăng nhập với một lý do chung, và nhật ký kiểm toán ghi lại mã. Route đăng xuất vẫn kết thúc phiên cục bộ khi không thể kết nối đến nhà cung cấp danh tính.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Không có (chuyển hướng) | URL của issuer là `http`, nhưng `EXTERNAL_URL` là `https`, nên client từ chối bước discovery. | Quản trị viên: phục vụ issuer qua `https`, hoặc chạy instance qua `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Không có (chuyển hướng) | Bước discovery của issuer bị hết thời gian chờ. | Kiểm tra máy chủ có kết nối được đến issuer không, rồi thử lại. |
| `OIDC_DISCOVERY_FAILED` | Không có (chuyển hướng) | Bước discovery thất bại vì lý do khác. | Kiểm tra URL của issuer và quyền truy cập ra ngoài của máy chủ. |
| `OIDC_END_SESSION_INVALID` | Không có (đăng xuất vẫn tiếp tục) | `end_session_endpoint` của nhà cung cấp danh tính không phải là URL hợp lệ. Phiên cục bộ vẫn được xóa. | Quản trị viên: sửa metadata của nhà cung cấp. |
| `OIDC_END_SESSION_SCHEME` | Không có (đăng xuất vẫn tiếp tục) | `end_session_endpoint` dùng một scheme mà máy chủ không cho phép. Phiên cục bộ vẫn được xóa. | Quản trị viên: sửa metadata của nhà cung cấp. |

## SAML {#saml-codes}

Lỗi SAML không đặt `code`. Một assertion thất bại sẽ chuyển hướng đến trang đăng nhập với `saml_auth_failed`, và sự kiện kiểm toán `SAML_LOGIN_FAILED` ghi lại lý do.

## SCIM {#scim-codes}

Các route SCIM trả lời bằng phong bì lỗi theo RFC 7644 (`schemas`, `detail`, `status`, và đôi khi `scimType`). Chúng không đặt `code`. Hãy rẽ nhánh theo trạng thái HTTP.

## Nhóm, vai trò và người dùng {#team-role-codes}

Tên nhóm hoặc vai trò bị trùng sẽ trả về `CONFLICT` chung, còn nhóm hoặc vai trò không tồn tại sẽ trả về `NOT_FOUND`.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Vai trò của người gọi không cho phép thay đổi này. Đối tượng nằm trên thẩm quyền của người gọi, vai trò là vai trò tích hợp sẵn, hoặc yêu cầu cấp những quyền mà người gọi không có. | Không thử lại. Hãy nhờ người dùng có thẩm quyền cao hơn. |
| `UNKNOWN_ROLE` | 400 | ID vai trò không khớp với vai trò nào hiện có. | Sửa ID vai trò. Liệt kê các vai trò để tìm nó. |
| `UNKNOWN_TEAM` | 400 | ID nhóm không khớp với nhóm nào hiện có. | Sửa ID nhóm. |
| `SELF_DEMOTE` | 400 | Một quản trị viên cố gỡ vai trò quản trị của chính mình. | Nhờ quản trị viên khác thực hiện thay đổi. |
| `SELF_DELETE` | 400 | Một quản trị viên cố xóa tài khoản của chính mình. | Nhờ quản trị viên khác xóa. |
| `LAST_ADMIN` | 400 trên các route người dùng, 409 trên các route xóa vĩnh viễn GDPR | Thay đổi sẽ khiến không còn quản trị viên nào, hoặc xóa vĩnh viễn một nhóm chứa toàn bộ quản trị viên. | Hãy đặt một người dùng khác làm quản trị viên trước. |
| `USER_LIMIT_REACHED` | 403 | Instance đã đạt giới hạn `MAX_USERS`. | Xóa một người dùng, hoặc tăng `MAX_USERS`. |

## Tính năng và gói AI {#feature-codes}

Các công cụ, lượt chạy hàng loạt và pipeline cần một gói AI tùy chọn sẽ dùng các mã này.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Công cụ, hoặc một bước của pipeline hay lượt chạy hàng loạt, cần một gói chưa được cài đặt. Nội dung phản hồi có `feature` (ID của gói) và `featureName`. | Cài gói trong Cài đặt, rồi thử lại. |
| `FEATURE_INCOMPATIBLE` | 501 | Tính năng đã cài không thể đáp ứng chất lượng hoặc ngôn ngữ được yêu cầu. | Đổi thiết lập, hoặc cài một gói có hỗ trợ. |
| `ENGINE_UNAVAILABLE` | 503 | Một engine cần thiết không thể khởi động, hoặc một runtime OCR đã bị gỡ sau khi yêu cầu được xác thực. | Hãy thử lại sau khi quản trị viên sửa hoặc cài lại tính năng. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium chưa được cài, nên HTML sang hình ảnh không thể chạy. | Nhờ quản trị viên cài trình duyệt. |
| `BROWSER_CRASHED` | 503 | Trình duyệt chụp ảnh màn hình bị treo khi đang kết xuất. | Thử lại yêu cầu. |

## Công cụ {#tool-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Đầu vào đã tải lên bị xóa trước khi công việc chạy. | Tải tệp lên lại rồi gửi công việc. |
| `ANALYSIS_EXPIRED` | 410 | Kết quả phân tích ảnh hộ chiếu đã hết hạn trước khi tạo ảnh. | Phân tích lại ảnh, rồi tạo ảnh. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Kết quả xóa nền đã hết hạn trước bước tiếp theo. | Xóa nền lại. |
| `NOT_ANIMATED` | 400 | Remove GIF Background nhận được một ảnh tĩnh. | Dùng Remove Background cho ảnh tĩnh. |
| `TOO_MANY_FRAMES` | 400 | Ảnh động có nhiều khung hình hơn mức máy chủ cho phép (`GIF_BG_MAX_FRAMES`). | Gửi ảnh động ngắn hơn, hoặc nhờ quản trị viên tăng giới hạn. |

## Tệp {#file-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Việc lưu vào Tệp sẽ vượt quá hạn mức lưu trữ của người dùng. | Xóa bớt tệp, hoặc nhờ quản trị viên cấp thêm dung lượng. |
| `INVALID_STORED_NAME` | 400 | Máy chủ từ chối tên của một tệp đã lưu. | Tải tệp lên lại. |

## Pipeline và xử lý hàng loạt {#pipeline-codes}

Các yêu cầu pipeline và hàng loạt trả về các mã tính năng ở trên cho từng bước cần một gói. Một ID công việc đã được dùng sẽ trả về `CONFLICT` với trạng thái 409. Hãy gửi một ID công việc mới.

## Cài đặt {#settings-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Khóa này không phải là một thiết lập đã biết. | Kiểm tra tên khóa. |
| `READONLY_SETTING` | 400 | Thiết lập này không thể thay đổi qua API. | Hãy thay đổi qua biến môi trường hoặc giao diện quản trị. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Giá trị mới xung đột với các thiết lập khác. Nội dung phản hồi nêu tên thiết lập trong `setting` và liệt kê các vấn đề trong `validationErrors`. | Sửa các thiết lập được liệt kê, rồi thử lại. |
| `SETTING_DECRYPTION_FAILED` | 500 | Không thể giải mã một thiết lập đã lưu. | Việc của người vận hành, như với `DECRYPTION_FAILED`. |

Với `VALIDATION_ERROR` trên một thiết lập, `details` chứa các vấn đề về schema.

## Doanh nghiệp {#enterprise-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Thiết lập hoặc chính sách này cần giấy phép doanh nghiệp, chẳng hạn SSO enforcement hoặc chính sách MFA. | Dùng instance có giấy phép, hoặc để thiết lập ở trạng thái tắt. |
| `IP_NOT_ALLOWED` | 403 | Địa chỉ IP của yêu cầu không nằm trong danh sách cho phép. | Kết nối từ một mạng được phép. |
| `INVALID_CIDR` | 400 | Một mục trong danh sách cho phép không phải là CIDR hợp lệ. Thông báo liệt kê các mục sai. | Sửa các mục rồi lưu lại. |
| `SELF_LOCKOUT` | 400 | Việc lưu danh sách cho phép sẽ chặn IP hiện tại của người gọi. | Hãy thêm IP hiện tại của bạn vào danh sách trước. |

Các route xóa vĩnh viễn GDPR trả về `CONFLICT` thông thường với trạng thái 409 khi một người dùng hoặc nhóm đang bị giữ pháp lý.

## Các mã mà client không nhận được {#internal-codes}

Các mã này tồn tại trong mã nguồn máy chủ cho nhật ký, telemetry hoặc lỗi riêng của Fastify. Client không nhận chúng trong nội dung phản hồi hay dòng công việc, nên đừng viết logic phía client dựa trên chúng.

| `code` | Chúng đi đâu |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Được báo cho hệ thống theo dõi lỗi bởi bộ đánh giá cảnh báo. Không thể giải mã header xác thực của webhook cảnh báo. |
| `SIEM_DECRYPTION_FAILED` | Được báo cho hệ thống theo dõi lỗi bởi tính năng chuyển tiếp SIEM. Không thể giải mã header xác thực của SIEM. |
| `WEBHOOK_DECRYPTION_FAILED` | Được báo cho hệ thống theo dõi lỗi. Yêu cầu gặp cùng lỗi này sẽ trả lời bằng `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Được báo cho hệ thống theo dõi lỗi khi không thể xóa một tệp tải lên tạm. |
| `USERNAME_RACE_EXHAUSTED` | Phát sinh khi SSO tự tạo tài khoản thua cuộc đua tên người dùng ở mọi lần thử lại. Trang đăng nhập hiển thị lỗi thay thế. |
| `ERR_OUT_OF_RANGE` | Được ném ra bởi trình đọc object storage khi dải byte không hợp lệ. |
| `ETIMEDOUT` | Được đặt trên lỗi hết thời gian chờ của một lần xuất GDPR. Lần xuất thất bại, và có thể yêu cầu lại. |
| `FST_REQ_FILE_TOO_LARGE` | Mã của Fastify cho tệp tải lên vượt quá giới hạn. Client nhận mã 413 với `PAYLOAD_TOO_LARGE`, hoặc thông báo 413 riêng của route. |
| `TARGET_SIZE_EXCEEDED` | Được ném ra khi nén theo dung lượng mục tiêu không đạt mục tiêu. Lỗi không có trạng thái hay mã, nên client nhận một lỗi thất bại chung. |

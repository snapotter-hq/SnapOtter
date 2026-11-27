---
title: "Mã lỗi"
description: "Cấu trúc nội dung lỗi, các mã ổn định và cách xử lý từng mã."
i18n_source_hash: 7e48ef36024d
i18n_provenance: machine
i18n_output_hash: 29c84d50c9f3
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

Một tác vụ thất bại chỉ giữ lại `error.code` khi lỗi là lỗi đầu vào hoặc lỗi của máy chủ. Các lỗi khác chỉ mang thông báo.

| `code` | Ý nghĩa | Cần làm gì |
|--------|---------|------------|
| `CANCELED` | Tác vụ đã bị người dùng hủy. Đây không phải trạng thái HTTP. Các sự kiện tiến trình mang `phase: failed` cùng với mã này. | Coi đó là người dùng hủy. Không tự động thử lại. |
| `INPUT_MISSING` | Đầu vào đã bị xóa trước khi tác vụ chạy. | Tải tệp lên lại. |
| `ENGINE_UNAVAILABLE` | Một engine cần thiết không thể khởi động trên máy chủ. | Thử lại sau khi quản trị viên sửa chữa bản cài đặt. |
| `JOB_STALLED` | Không trả về cho client; nó dùng làm nhãn cho báo cáo lỗi của máy chủ. Worker đã mất khóa của tác vụ nhiều lần hơn mức hàng đợi cho phép, thường do máy chủ khởi động lại hoặc thiếu bộ nhớ hay CPU. Tác vụ thất bại với thông báo cho biết nó đã bị gián đoạn. | Thử lại. Nếu vẫn tiếp diễn, hãy cấp thêm bộ nhớ cho máy chủ hoặc giảm `CONCURRENT_JOBS`. |

## Xác thực và MFA {#mfa-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Chính sách MFA yêu cầu đăng ký, và phiên bản này không thể đăng ký MFA cho người dùng (không có giấy phép doanh nghiệp). Các phiên bản có giấy phép trả về 200 kèm `requiresMfaEnrollment: true` và hướng dẫn người dùng đăng ký. | Không thử lại. Quản trị viên phải thay đổi chính sách hoặc dùng CLI khôi phục ngoại tuyến. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Máy chủ không đọc được chính sách MFA trong lúc đăng nhập. | Thử đăng nhập lại sau ít phút. |
| `INVALID_CODE` | 401 | Mã TOTP hoặc mã khôi phục không đúng. | Yêu cầu người dùng nhập mã mới rồi thử lại. Nhiều lần thất bại liên tiếp sẽ dẫn đến `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Nhập sai mã quá nhiều lần. Thử thách xác thực đã bị hủy. | Bắt đầu đăng nhập lại để nhận thử thách mới. |
| `MFA_EXPIRED` | 401 | Thử thách MFA hoặc đăng ký đã hết hạn hoặc không khớp. | Bắt đầu đăng nhập lại. |
| `MFA_NOT_CONFIGURED` | 401 | Tài khoản không có khóa bí mật TOTP, nên không thể kiểm tra mã. | Đăng ký MFA trước khi đăng nhập bằng mã. |
| `MFA_ALREADY_ENABLED` | 409 | MFA đã được kích hoạt trên tài khoản. | Không đăng ký lại. |
| `NO_PENDING_ENROLLMENT` | 400 | Một xác nhận đăng ký đến mà không có đăng ký nào đang chờ. | Hãy gọi endpoint đăng ký trước. |
| `MFA_NOT_ENABLED` | 400 | Thao tác cần MFA đang bật, nhưng người dùng này đang tắt. | Bỏ qua thao tác, hoặc bật MFA trước. |
| `MFA_DECRYPTION_FAILED` | 500 | Không thể giải mã khóa bí mật TOTP đã lưu. | Cần nhà vận hành xử lý. Thường điều này có nghĩa là khóa mã hóa đã thay đổi. Kiểm tra `DATA_ENCRYPTION_KEY` và `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Không thể giải mã một giá trị đã lưu (một thiết lập, một header xác thực webhook hoặc một khóa bí mật TOTP). | Cần nhà vận hành xử lý, như trên. Không thử lại. |
| `IDLE_TIMEOUT` | 401 | Phiên đã hết hạn sau một thời gian không hoạt động. | Đăng nhập lại. |
| `INVALID_PASSWORD` | 401 | Mật khẩu hiện tại không đúng khi đổi mật khẩu. | Yêu cầu người dùng nhập mật khẩu hiện tại. |
| `PASSWORD_CHANGED` | 409 | Mật khẩu đã được đổi trong một phiên khác, hoặc quản trị viên đã đặt lại, trong khi yêu cầu này đang chạy. | Đăng nhập lại. |
| `OIDC_NO_PASSWORD` | 400 | Có yêu cầu đổi hoặc đặt lại mật khẩu cho tài khoản được tạo qua SSO. | Hướng dẫn người dùng đến nhà cung cấp danh tính. |

## OIDC {#oidc-codes}

Lỗi OIDC trong lúc đăng nhập không trả về nội dung JSON. Route đăng nhập chuyển hướng đến trang đăng nhập với một lý do chung, và nhật ký kiểm toán ghi lại mã. Route đăng xuất vẫn kết thúc phiên cục bộ khi không thể kết nối đến nhà cung cấp danh tính.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Không có (chuyển hướng) | URL của issuer là `http`, nhưng `EXTERNAL_URL` là `https`, nên client từ chối discovery. | Quản trị viên: phục vụ issuer qua `https`, hoặc chạy phiên bản qua `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Không có (chuyển hướng) | Discovery của issuer đã hết thời gian chờ. | Kiểm tra máy chủ có kết nối được đến issuer không, rồi thử lại. |
| `OIDC_DISCOVERY_FAILED` | Không có (chuyển hướng) | Discovery thất bại vì lý do khác. | Kiểm tra URL của issuer và quyền truy cập ra ngoài của máy chủ. |
| `OIDC_END_SESSION_INVALID` | Không có (đăng xuất vẫn tiếp tục) | `end_session_endpoint` của nhà cung cấp danh tính không phải là URL hợp lệ. Phiên cục bộ vẫn được xóa. | Quản trị viên: sửa metadata của nhà cung cấp. |
| `OIDC_END_SESSION_SCHEME` | Không có (đăng xuất vẫn tiếp tục) | `end_session_endpoint` dùng một scheme mà máy chủ không cho phép. Phiên cục bộ vẫn được xóa. | Quản trị viên: sửa metadata của nhà cung cấp. |

## SAML {#saml-codes}

Lỗi SAML không đặt `code`. Một assertion thất bại sẽ chuyển hướng đến trang đăng nhập với `saml_auth_failed`, và sự kiện kiểm toán `SAML_LOGIN_FAILED` ghi lại lý do.

## SCIM {#scim-codes}

Các route SCIM trả lời bằng phong bì lỗi theo RFC 7644 (`schemas`, `detail`, `status`, và đôi khi `scimType`). Chúng không đặt `code`. Hãy rẽ nhánh theo trạng thái HTTP.

## Nhóm, vai trò và người dùng {#team-role-codes}

Tên nhóm hoặc vai trò trùng lặp trả về `CONFLICT` chung, và nhóm hoặc vai trò không tồn tại trả về `NOT_FOUND`.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Vai trò của người gọi không cho phép thay đổi này. Đối tượng nằm trên thẩm quyền của người gọi, vai trò là vai trò tích hợp sẵn, hoặc yêu cầu cấp các quyền mà người gọi không có. | Không thử lại. Hãy nhờ người dùng có thẩm quyền cao hơn. |
| `UNKNOWN_ROLE` | 400 | ID vai trò không khớp với vai trò nào hiện có. | Sửa ID vai trò. Liệt kê các vai trò để tìm. |
| `UNKNOWN_TEAM` | 400 | ID nhóm không khớp với nhóm nào hiện có. | Sửa ID nhóm. |
| `SELF_DEMOTE` | 400 | Một quản trị viên cố gỡ vai trò quản trị của chính mình. | Nhờ quản trị viên khác thực hiện thay đổi. |
| `SELF_DELETE` | 400 | Một quản trị viên cố xóa tài khoản của chính mình. | Nhờ quản trị viên khác xóa. |
| `LAST_ADMIN` | 400 trên các route người dùng, 409 trên các route xóa vĩnh viễn GDPR | Thay đổi sẽ khiến không còn quản trị viên nào, hoặc xóa vĩnh viễn một nhóm chứa tất cả quản trị viên. | Hãy đặt một người dùng khác làm quản trị viên trước. |
| `USER_LIMIT_REACHED` | 403 | Phiên bản đã đạt giới hạn `MAX_USERS`. | Xóa một người dùng, hoặc tăng `MAX_USERS`. |

## Tính năng và gói AI {#feature-codes}

Các công cụ, lần chạy hàng loạt và pipeline cần một gói AI tùy chọn sử dụng các mã này.

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, hoặc 400 từ chế độ khuôn mặt của Smart Crop | Công cụ, hoặc một bước của pipeline hay lần chạy hàng loạt, cần một gói chưa được cài đặt. Nội dung phản hồi gồm `feature` (ID của gói) và `featureName`. | Cài đặt gói trong Cài đặt, rồi thử lại. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Việc cài đặt hoặc nhập ngoại tuyến bị từ chối vì các thư viện x86-64 của gói cần AVX mà CPU của máy chủ này không có. Chưa có gì được tải xuống hay cài đặt. Nội dung phản hồi gồm `feature` (ID của gói) và `reason` (`cpu-no-avx`). `GET /api/v1/features` báo cáo cùng gói đó với `compatibility: "incompatible"` và `compatibilityReason: "cpu-no-avx"`. | Chạy SnapOtter trên CPU có AVX, hoặc trên arm64. Các gói khác vẫn cài đặt được. |
| `FEATURE_INSTALL_BUSY` | 409 | Yêu cầu hủy bị từ chối vì trình cài đặt đang ghi vào môi trường AI dùng chung, và việc dừng nó ở đó sẽ làm hỏng mọi công cụ AI đã cài đặt. | Chờ việc cài đặt hoàn tất, rồi gỡ cài đặt gói nếu bạn không muốn dùng nó. |
| `FEATURE_INCOMPATIBLE` | 501, hoặc 400 khi Fast OCR nhận một ngôn ngữ mà nó không đọc được | Tính năng đã cài đặt không thể thực hiện chất lượng hoặc ngôn ngữ được yêu cầu. | Đổi thiết lập, hoặc cài đặt một gói hỗ trợ nó. |
| `ENGINE_UNAVAILABLE` | 503 | Một engine cần thiết không thể khởi động, hoặc runtime OCR đã bị gỡ sau khi yêu cầu được xác thực. | Thử lại sau khi quản trị viên sửa chữa hoặc cài đặt lại tính năng. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium chưa được cài đặt, nên HTML sang ảnh không thể chạy. | Nhờ quản trị viên cài đặt trình duyệt. |
| `BROWSER_CRASHED` | 503 | Trình duyệt chụp màn hình bị lỗi trong lúc kết xuất. | Thử lại yêu cầu. |

## Công cụ {#tool-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Đầu vào đã tải lên bị xóa trước khi tác vụ chạy. | Tải tệp lên lại rồi gửi tác vụ. |
| `ANALYSIS_EXPIRED` | 410 | Kết quả phân tích ảnh hộ chiếu đã hết hạn trước khi tạo ảnh. | Phân tích lại ảnh, rồi tạo. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Kết quả xóa nền đã hết hạn trước bước tiếp theo. | Xóa nền lại. |
| `NOT_ANIMATED` | 400 | Remove GIF Background nhận được một ảnh tĩnh. | Dùng Remove Background cho ảnh tĩnh. |
| `TOO_MANY_FRAMES` | 400 | Ảnh động có nhiều khung hình hơn mức máy chủ cho phép (`GIF_BG_MAX_FRAMES`). | Gửi ảnh động ngắn hơn, hoặc nhờ quản trị viên nâng giới hạn. |
| `TOO_MANY_PIXELS` | 400 | Kích thước khung của ảnh động nhân với số khung hình vượt quá giới hạn của máy chủ: 268,402,689 điểm ảnh (16383 x 16383) cho Remove GIF Background, hoặc mức trần khối lượng GIF cho các công cụ ảnh động khác. | Gửi ít khung hình hơn hoặc ảnh động nhỏ hơn. |
| `MULTI_FRAME_UNSUPPORTED` | 400 | Một công cụ ảnh AI nhận được TIFF nhiều trang hoặc GIF hay WebP động, và định dạng đầu ra sẽ giữ mọi khung hình. Các công cụ này chạy mô hình trên từng ảnh một. | Tách tệp thành các ảnh riêng. Nếu công cụ có thiết lập định dạng đầu ra, một định dạng tĩnh như PNG sẽ chỉ xử lý khung hình đầu tiên. |
| `IMAGE_TOO_LARGE` | 400 | Ảnh có nhiều điểm ảnh hơn mức bộ giải mã chấp nhận. | Gửi ảnh nhỏ hơn. |
| `SVG_TOO_COMPLEX` | 400 | SVG không hoàn tất việc rasterize trong vòng `JOB_TIMEOUT_FAST_S`. Nguyên nhân thường gặp là các bộ lọc trên những hình mà `<use>` lặp lại, vì mỗi bản sao vẽ lại bộ lọc. | Đơn giản hóa các bộ lọc hoặc hình lặp lại, hoặc nhờ quản trị viên nâng giới hạn. |
| `RESULT_TOO_LARGE` | 400 | Các thiết lập sẽ tạo ra ảnh lớn hơn mức bộ mã hóa hoặc giới hạn điểm ảnh cho phép. | Dùng ảnh nhỏ hơn hoặc các thiết lập cho kết quả nhỏ hơn. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice hoặc pandoc không mở được tài liệu. Tài liệu có thể bị hỏng, được bảo vệ bằng mật khẩu, hoặc không đúng định dạng như phần mở rộng cho biết. | Kiểm tra tệp mở được trong ứng dụng văn phòng, rồi gửi lại. |
| `PDF_DAMAGED` | 400 | Engine PDF phát hiện cấu trúc tài liệu bị hỏng. | Chạy tệp qua Repair PDF, rồi thử lại. |
| `PDF_PASSWORD_PROTECTED` | 400 | PDF bị mã hóa và công cụ này không mở được. | Hãy mở khóa bằng Unlock PDF trước. |
| `NO_AUDIO_TRACK` | 400 | Tệp không có luồng âm thanh để công cụ âm thanh sử dụng. | Gửi tệp có âm thanh. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg không đọc được âm thanh hoặc video: không tìm thấy gói dữ liệu, không có tham số codec, không có atom `moov`, hoặc dữ liệu không phân tích được. | Kiểm tra tệp phát được trong trình phát media, hoặc xuất lại, rồi thử lại. |
| `ENCODED_TEXT_INVALID` | 400 | Base64 Encode / Decode nhận đầu vào không phải Base64. Khoảng trắng bị bỏ qua và chấp nhận cả bảng chữ cái chuẩn lẫn an toàn cho URL. | Kiểm tra văn bản xem có ký tự lạ hoặc phần cuối bị cắt không. |
| `DECODED_DATA_NOT_TEXT` | 400 | Base64 hợp lệ nhưng giải mã ra dữ liệu nhị phân, không phải văn bản UTF-8. | Giải mã bằng công cụ lưu thành tệp thay vì hiển thị văn bản. |
| `PAGE_OUT_OF_RANGE` | 400 | Phạm vi trang nêu một trang mà PDF không có. | Kiểm tra số trang và gửi phạm vi nằm trong đó. |
| `INVALID_PAGE_RANGE` | 400 | Phạm vi trang không đúng cú pháp. | Dùng số trang như `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages được yêu cầu xóa mọi trang. | Giữ lại ít nhất một trang. |
| `NESTING_TOO_DEEP` | 400 | JSON hoặc XML lồng nhau sâu hơn 100 cấp. | Làm phẳng tài liệu, rồi chuyển đổi. |
| `IMAGE_UNDECODABLE` | 400 | Không giải mã được ảnh, hoặc không đọc được kích thước của ảnh. Tệp có thể bị hỏng hoặc dùng một kiểu mã hóa mà bộ giải mã không hỗ trợ. | Xuất lại ảnh từ ứng dụng khác, hoặc chuyển sang PNG hay JPEG trước. |
| `INVALID_SETTINGS` | 400 | Một thiết lập nằm ngoài phạm vi hoặc không phù hợp với tệp này: vùng cắt nằm ngoài ảnh, thay đổi kích thước bằng không, một khung hình GIF mà ảnh động không có, một quy cách ảnh hộ chiếu không tồn tại. Văn bản `error` nêu rõ thiết lập đó. | Sửa thiết lập được nêu trong `error`, rồi thử lại. |
| `CHART_DATA_INVALID` | 400 | Chart Maker không đọc được dữ liệu biểu đồ từ tệp: CSV hoặc JSON không phân tích được, không có cột số, có hơn 100 dòng, hoặc có giá trị âm. Văn bản `error` cho biết lỗi cụ thể. | Gửi CSV hoặc JSON tối đa 100 dòng, mỗi dòng gồm một nhãn và một số không âm. |
| `NO_FACE_DETECTED` | 400 | Passport Photo không tìm thấy khuôn mặt trong ảnh. | Gửi ảnh chụp rõ, nhìn thẳng, đủ sáng. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Nén ảnh, hoặc giới hạn kích thước của ảnh hộ chiếu, không thể đưa tệp xuống dưới kích thước yêu cầu, ngay cả sau khi thu nhỏ. | Yêu cầu kích thước mục tiêu lớn hơn, hoặc cắt ảnh trước. |
| `TOO_MANY_PAGES` | 400 | OCR được yêu cầu xử lý nhiều trang hơn mức nó xử lý trong một tác vụ. | Chọn ít trang hơn bằng phạm vi trang. |
| `OCR_OUTPUT_TOO_LARGE` | 500 | OCR trên TIFF nhiều trang đọc hơn 1,000,000 byte văn bản qua các trang của nó, nhiều hơn mức một kết quả có thể lưu. | Tách TIFF thành các tệp nhỏ hơn và chạy OCR trên từng tệp. |
| `METADATA_DAMAGED` | 400 | Edit Metadata phát hiện dữ liệu EXIF hiện có của ảnh bị hỏng, nên không thể ghi lại an toàn. | Xóa metadata bằng Remove Image Metadata trước, rồi chỉnh sửa. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML hoặc Markdown sang PDF phát hiện tham chiếu đến ảnh, stylesheet hoặc phông chữ trên mạng, mà máy chủ không tải về. | Nhúng tài nguyên vào tệp (ví dụ dưới dạng URI `data:`), rồi thử lại. |

## Tệp {#file-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Lưu vào Files sẽ vượt quá hạn mức dung lượng của người dùng. | Xóa bớt tệp, hoặc nhờ quản trị viên cấp thêm dung lượng. |
| `INVALID_STORED_NAME` | 400 | Máy chủ từ chối tên của một tệp đã lưu. | Tải tệp lên lại. |

## Pipeline và hàng loạt {#pipeline-codes}

Yêu cầu pipeline và hàng loạt trả về các mã tính năng ở trên cho từng bước cần một gói. Một ID tác vụ đã được dùng sẽ trả về `CONFLICT` với trạng thái 409. Hãy gửi ID tác vụ mới.

## Thiết lập {#settings-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Khóa không phải là một thiết lập đã biết. | Kiểm tra tên khóa. |
| `READONLY_SETTING` | 400 | Thiết lập không thể thay đổi qua API. | Thay đổi qua biến môi trường hoặc giao diện quản trị. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Giá trị mới xung đột với các thiết lập khác. Nội dung phản hồi nêu thiết lập trong `setting` và liệt kê các vấn đề trong `validationErrors`. | Sửa các thiết lập được liệt kê, rồi thử lại. |
| `SETTING_DECRYPTION_FAILED` | 500 | Không thể giải mã một thiết lập đã lưu. | Cần nhà vận hành xử lý, như với `DECRYPTION_FAILED`. |

Với `VALIDATION_ERROR` trên một thiết lập, `details` chứa các vấn đề của schema.

## Doanh nghiệp {#enterprise-codes}

| `code` | Trạng thái | Ý nghĩa | Cần làm gì |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Thiết lập hoặc chính sách cần giấy phép doanh nghiệp, chẳng hạn bắt buộc SSO hoặc chính sách MFA. | Dùng phiên bản có giấy phép, hoặc để thiết lập ở trạng thái tắt. |
| `IP_NOT_ALLOWED` | 403 | Địa chỉ IP của yêu cầu không nằm trong danh sách cho phép. | Kết nối từ một mạng được phép. |
| `INVALID_CIDR` | 400 | Một mục trong danh sách cho phép không phải CIDR hợp lệ. Thông báo liệt kê các mục sai. | Sửa các mục rồi lưu lại. |
| `SELF_LOCKOUT` | 400 | Lưu danh sách cho phép sẽ chặn IP hiện tại của người gọi. | Hãy thêm IP hiện tại của bạn vào danh sách trước. |

Các route xóa vĩnh viễn GDPR trả về `CONFLICT` thuần với trạng thái 409 khi người dùng hoặc nhóm đang bị lưu giữ pháp lý.

## Các mã client không nhận được {#internal-codes}

Các mã này tồn tại trong mã nguồn máy chủ cho nhật ký, telemetry hoặc lỗi riêng của Fastify. Client không nhận chúng trong nội dung phản hồi hay dòng tác vụ, vì vậy đừng viết logic phía client dựa trên chúng.

| `code` | Đi đến đâu |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Được báo cáo đến hệ thống theo dõi lỗi bởi bộ đánh giá cảnh báo. Không thể giải mã header xác thực của một webhook cảnh báo. |
| `SIEM_DECRYPTION_FAILED` | Được báo cáo đến hệ thống theo dõi lỗi bởi việc chuyển tiếp SIEM. Không thể giải mã header xác thực của SIEM. |
| `WEBHOOK_DECRYPTION_FAILED` | Được báo cáo đến hệ thống theo dõi lỗi. Yêu cầu gặp cùng lỗi này trả lời bằng `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Được báo cáo đến hệ thống theo dõi lỗi khi không thể xóa một tệp tải lên tạm. |
| `RETENTION_DEADLINE_BACKFILLED` | Được báo cáo đến hệ thống theo dõi lỗi bởi lượt quét TTL của lưu trữ khi nó điền hạn giữ lại của nhóm còn thiếu cho một tác vụ đã hoàn tất. Khi đó các tệp của tác vụ tuân theo chính sách giữ lại của nhóm. |
| `USERNAME_RACE_EXHAUSTED` | Phát sinh khi việc tự tạo tài khoản SSO thua cuộc đua tên người dùng ở mọi lần thử lại. Trang đăng nhập hiển thị một lỗi thay thế. |
| `ERR_OUT_OF_RANGE` | Được ném ra bởi trình đọc object storage khi dải byte không hợp lệ. |
| `ETIMEDOUT` | Được đặt trên lỗi hết thời gian chờ của một lần xuất GDPR. Lần xuất thất bại, và có thể yêu cầu lại. |
| `FST_REQ_FILE_TOO_LARGE` | Mã của Fastify cho tệp tải lên vượt giới hạn. Client nhận 413 với `PAYLOAD_TOO_LARGE`, hoặc thông báo 413 riêng của route. |
| `TARGET_SIZE_EXCEEDED` | Được ném ra khi việc nén theo kích thước mục tiêu không đạt mục tiêu. Lỗi không có trạng thái hay mã, nên client nhận một lỗi thất bại chung. |
| `OCR_CACHE_PERMISSIONS` | Được báo cáo đến hệ thống theo dõi lỗi như một sự cố vận hành khi ổ dữ liệu AI để bộ nhớ đệm runtime OCR cho phép ghi với mọi người. Tác vụ cài đặt thất bại với thông báo nêu rõ vấn đề lưu trữ. |
| `OCR_RUNTIME_UNREACHABLE` | Được báo cáo đến hệ thống theo dõi lỗi như một sự cố vận hành khi máy chủ không bao giờ kết nối được huggingface.co để tải runtime OCR. Tác vụ cài đặt thất bại với thông báo về truy cập mạng, `HTTPS_PROXY`, `HF_ENDPOINT` và nhập ngoại tuyến. |

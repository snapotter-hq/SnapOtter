---
description: "Quản lý người dùng, vai trò tích hợp sẵn và tùy chỉnh, quyền, khóa API, nhóm, phiên và nhật ký kiểm toán trong SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: e8d2b2c5dd61
---

# Người dùng, Vai trò & Quyền {#users-roles-permissions}

SnapOtter được cung cấp sẵn ba vai trò tích hợp, 17 quyền chi tiết, và hỗ trợ vai trò tùy chỉnh với kiểm soát truy cập theo từng công cụ tùy chọn. Trang này bao quát toàn bộ mô hình phân quyền, phạm vi khóa API, quản lý nhóm và ghi nhật ký kiểm toán.

::: tip Các trang liên quan
[OIDC / SSO](/vi/guide/oidc) | [SAML SSO](/vi/guide/saml) | [Cấp phát SCIM](/vi/guide/scim) | [Bảo mật & Gia cố](/vi/guide/security)
:::

## Người dùng {#users}

### Tạo người dùng {#creating-users}

Quản trị viên có thể tạo người dùng qua bảng điều khiển quản trị hoặc endpoint `POST /api/auth/register`. Mỗi người dùng có một tên đăng nhập, vai trò, phân bổ nhóm, và một địa chỉ email tùy chọn.

### Admin mặc định {#default-admin}

Ở lần khởi động đầu tiên, SnapOtter tạo một tài khoản admin mặc định. Thông tin đăng nhập đến từ các biến môi trường:

| Biến | Mặc định | Mô tả |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Tên đăng nhập cho tài khoản admin ban đầu |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu cho tài khoản admin ban đầu |

Admin mặc định buộc phải đổi mật khẩu ở lần đăng nhập đầu tiên.

### Nhà cung cấp xác thực {#authentication-providers}

Người dùng có thể xác thực qua nhiều phương thức:

- **Cục bộ** - tên đăng nhập và mật khẩu được lưu trong cơ sở dữ liệu SnapOtter
- **OIDC** - bất kỳ nhà cung cấp OpenID Connect nào (xem [OIDC / SSO](/vi/guide/oidc))
- **SAML** - các nhà cung cấp danh tính SAML 2.0 (xem [SAML SSO](/vi/guide/saml))
- **SCIM** - cấp phát tự động từ một nhà cung cấp danh tính (xem [Cấp phát SCIM](/vi/guide/scim))

### Tắt xác thực {#disabling-authentication}

Đặt `AUTH_ENABLED=false` để tắt hoàn toàn xác thực. Ở chế độ này, một người dùng ẩn danh giả lập với vai trò `admin` được dùng cho mọi yêu cầu. Không cần đăng nhập.

::: warning 
Tắt xác thực cấp quyền truy cập admin đầy đủ cho bất kỳ ai có thể tiếp cận phiên bản. Chỉ dùng điều này trong các môi trường tin cậy.
:::

## Vai trò tích hợp sẵn {#built-in-roles}

SnapOtter bao gồm ba vai trò tích hợp sẵn. Chúng không thể được sửa đổi hoặc xóa.

### Admin {#admin}

Cả 17 quyền. Toàn quyền kiểm soát phiên bản.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 quyền. Có thể dùng mọi công cụ và quản lý mọi tệp cùng pipeline, nhưng không thể truy cập các chức năng quản trị.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 quyền. Có thể dùng công cụ và quản lý tài nguyên của chính mình.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Tham chiếu quyền {#permissions-reference}

| Quyền | Mô tả |
|---|---|
| `tools:use` | Dùng bất kỳ công cụ xử lý nào |
| `files:own` | Xem và quản lý tệp của chính mình |
| `files:all` | Xem và quản lý tệp của mọi người dùng |
| `apikeys:own` | Tạo và quản lý khóa API của chính mình |
| `apikeys:all` | Xem khóa API của mọi người dùng |
| `pipelines:own` | Tạo và quản lý pipeline của chính mình |
| `pipelines:all` | Xem và quản lý pipeline của mọi người dùng |
| `settings:read` | Xem cài đặt phiên bản |
| `settings:write` | Sửa đổi cài đặt phiên bản |
| `users:manage` | Tạo, cập nhật và xóa tài khoản người dùng |
| `teams:manage` | Tạo, cập nhật và xóa nhóm |
| `features:manage` | Cài đặt và quản lý các gói tính năng AI |
| `system:health` | Truy cập các endpoint kiểm tra sức khỏe và sẵn sàng |
| `audit:read` | Xem nhật ký kiểm toán và liệt kê vai trò |
| `compliance:manage` | Quản lý vòng đời GDPR và các tính năng tuân thủ |
| `webhooks:manage` | Cấu hình webhook đi ra |
| `security:manage` | Quản lý cài đặt bảo mật (danh sách IP cho phép, ép buộc SSO) |

## Vai trò tùy chỉnh {#custom-roles}

Quản trị viên có quyền `security:manage` có thể tạo vai trò tùy chỉnh qua bảng điều khiển quản trị hoặc API vai trò. Liệt kê vai trò cần quyền `audit:read`.

### Tạo một vai trò tùy chỉnh {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Tên vai trò phải dài 2-30 ký tự, chữ và số viết thường kèm dấu gạch nối và gạch dưới.

### Các quyền dành riêng cho admin {#admin-reserved-permissions}

Ba quyền được dành riêng cho các vai trò tích hợp sẵn và không thể được gán cho vai trò tùy chỉnh:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

API vai trò từ chối bất kỳ yêu cầu nào chứa các quyền này. Chỉ vai trò `admin` tích hợp sẵn mới có quyền truy cập chúng.

### Quyền ở cấp công cụ {#tool-level-permissions}

Vai trò tùy chỉnh có thể tùy chọn hạn chế những công cụ mà người dùng được truy cập. Có hai chế độ:

| Chế độ | Hành vi | Yêu cầu giấy phép |
|---|---|---|
| `category` | Hạn chế theo phương thức (image, video, audio, document, file) | Không (miễn phí) |
| `tool` | Hạn chế theo ID công cụ riêng lẻ | Yêu cầu tính năng doanh nghiệp `per_tool_permissions` |

Khi chế độ `tool` được đặt nhưng tính năng doanh nghiệp không khả dụng, SnapOtter suy giảm mượt mà và cho phép truy cập mọi công cụ.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Xóa một vai trò tùy chỉnh {#deleting-a-custom-role}

Khi một vai trò tùy chỉnh bị xóa, mọi người dùng được gán vai trò đó tự động được gán lại về vai trò `user`.

## Nhóm {#teams}

Nhóm gom người dùng lại để quản lý lưu trữ và lưu giữ. Một nhóm `Default` được tạo ở lần khởi động đầu tiên.

| Trường | Kiểu | Mô tả |
|---|---|---|
| `name` | string | Tên nhóm duy nhất (1-50 ký tự) |
| `storageQuota` | number | Giới hạn lưu trữ mỗi nhóm tính bằng byte (hoạt động không cần doanh nghiệp) |
| `retentionHours` | number | Tự xóa đầu ra sau bấy nhiêu giờ (yêu cầu `team_retention_overrides`, doanh nghiệp) |
| `legalHold` | boolean | Ngăn việc tự động xóa tệp của thành viên nhóm (yêu cầu `legal_hold`, doanh nghiệp) |

::: info 
Nhóm `Default` không thể bị xóa. Các nhóm vẫn còn thành viên không thể bị xóa. Hãy gán lại thành viên trước.
:::

## Khóa API {#api-keys}

Người dùng có thể tạo khóa API để truy cập theo lập trình. Mỗi khóa dùng tiền tố `si_` và chỉ được hiển thị một lần tại thời điểm tạo.

### Quyền có phạm vi {#scoped-permissions}

Khóa API có thể tùy chọn mang một mảng `permissions`. Khi được đặt, quyền hiệu lực cho một yêu cầu là **giao** của quyền vai trò của người dùng và quyền có phạm vi của khóa. Điều này có nghĩa một khóa API không bao giờ có thể leo thang vượt quá quyền của chính người dùng.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Hết hạn {#expiration}

Khóa chấp nhận một dấu thời gian `expiresAt` tùy chọn. Các khóa hết hạn bị từ chối tại thời điểm xác thực.

## Nhật ký kiểm toán {#audit-log}

SnapOtter ghi lại các sự kiện liên quan đến bảo mật trong một nhật ký kiểm toán có cấu trúc, được lưu trong bảng cơ sở dữ liệu `audit_log`.

### Xem nhật ký kiểm toán {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Yêu cầu quyền `audit:read`. Hỗ trợ phân trang (`page`, `limit`) và bộ lọc (`action`, `ip`, `from`, `to`).

### Kiểm toán thao tác công cụ {#tool-operation-auditing}

::: warning 
Sự kiện `TOOL_EXECUTED` **không** được ghi lại theo mặc định. Chúng là tùy chọn bật qua một trong hai đường:

1. Đặt cài đặt admin `auditToolOperations` thành `true`.
2. Giữ một giấy phép còn hiệu lực với tính năng `audit_export` (khả dụng ở cả gói team và enterprise).

Nếu không có một trong hai thứ này, các lần thực thi công cụ riêng lẻ không được ghi vào nhật ký kiểm toán.
:::

### Xuất {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Yêu cầu quyền `audit:read` và tính năng doanh nghiệp `audit_export` (khả dụng ở cả gói team và enterprise). Hỗ trợ định dạng CSV và JSON, được lọc theo `action`, `actorId`, `targetType`, `targetId`, `from`, và `to`.

### Ký chống giả mạo {#tamper-resistant-signing}

Khi được bật, mỗi mục nhật ký kiểm toán được ký bằng một HMAC dẫn xuất từ `DATA_ENCRYPTION_KEY`. Điều này yêu cầu:

1. Đặt `DATA_ENCRYPTION_KEY` trong môi trường của bạn.
2. Bật cài đặt admin `tamperResistantAudit`.
3. Một giấy phép doanh nghiệp với tính năng `tamper_resistant_audit`.

### Lưu giữ {#retention}

Đặt `AUDIT_RETENTION_DAYS` để tự động dọn sạch các mục cũ. Mặc định là `0`, nghĩa là các mục được giữ vô thời hạn.

### Tham chiếu sự kiện {#event-reference}

| Sự kiện | Danh mục |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Xác thực |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Xác thực |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Xác thực |
| `LOGOUT` | Xác thực |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Quản lý người dùng |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Quản lý người dùng |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Vai trò |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Khóa API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Cài đặt |
| `FILE_UPLOADED`, `FILE_DELETED` | Tệp |
| `TOOL_EXECUTED` | Công cụ (tùy chọn bật) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Tuân thủ |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Tuân thủ |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Cấu hình |

## Quản lý phiên {#session-management}

Các phiên dựa trên cookie, được kiểm soát bởi `SESSION_DURATION_HOURS` (mặc định: 168 giờ / 7 ngày).

### Thay đổi vai trò làm mất hiệu lực phiên {#role-changes-invalidate-sessions}

Khi một admin thay đổi vai trò của một người dùng, mọi phiên đang hoạt động của người dùng đó bị xóa. Người dùng phải đăng nhập lại để nhận quyền mới của mình.

### Cơ chế an toàn {#safety-guards}

- **Bảo vệ admin cuối cùng**: admin còn lại cuối cùng không thể bị hạ xuống vai trò thấp hơn. API trả về lỗi nếu bạn thử.
- **Ngăn tự xóa**: admin không thể xóa tài khoản của chính mình qua API.

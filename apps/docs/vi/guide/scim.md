---
description: "Thiết lập cung cấp tài khoản SCIM 2.0 để đồng bộ người dùng và nhóm từ nhà cung cấp danh tính của bạn sang SnapOtter. Bao gồm Okta, Azure AD / Entra ID, và các tích hợp tùy chỉnh."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: ee904bcc38be
---

# Cung cấp tài khoản SCIM {#scim-provisioning}

SnapOtter triển khai SCIM 2.0 (System for Cross-domain Identity Management) để tự động cung cấp người dùng và nhóm. Nhà cung cấp danh tính của bạn có thể tạo, cập nhật, vô hiệu hóa và kích hoạt lại tài khoản người dùng cũng như đồng bộ tư cách thành viên nhóm một cách tự động.

::: tip Tính năng dành cho doanh nghiệp
Cung cấp tài khoản SCIM yêu cầu giấy phép **enterprise** với tính năng `scim`. Tính năng này không có sẵn trong gói team. Nếu không có tính năng này, tất cả các endpoint SCIM (ngoại trừ discovery) trả về 403.
:::

## Điều kiện tiên quyết {#prerequisites}

- Một phiên bản SnapOtter đang chạy, có thể truy cập tại một URL công khai
- Một khóa giấy phép enterprise với tính năng `scim`
- Quyền truy cập admin vào SnapOtter (cần quyền `users:manage` để tạo hoặc thu hồi token SCIM)
- Quyền truy cập admin vào cài đặt cung cấp tài khoản của nhà cung cấp danh tính của bạn

## Bắt đầu nhanh {#quick-start}

1. Tạo một token bearer SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Phản hồi chứa token. Hãy lưu lại ngay lập tức; nó không thể được truy xuất lại.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Trong nhà cung cấp danh tính của bạn, cấu hình cung cấp tài khoản SCIM với:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: Bearer token (dán token từ bước 1)

## Xác thực {#authentication}

Các endpoint SCIM sử dụng một token Bearer chuyên dụng, tách biệt với phiên người dùng và khóa API.

### Tạo một token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` tạo một token SCIM mới. Endpoint này yêu cầu một phiên hợp lệ với quyền `users:manage`.

Token được trả về ở dạng văn bản thuần túy đúng một lần. SnapOtter chỉ lưu trữ một hash scrypt. Nếu bạn mất token, hãy thu hồi nó và tạo một token mới.

Chỉ có một token SCIM hoạt động tại một thời điểm. Việc tạo một token mới sẽ thay thế token trước đó.

### Thu hồi một token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` thu hồi token SCIM hiện tại. Endpoint này cũng yêu cầu `users:manage`.

### Giới hạn tốc độ {#rate-limiting}

Các endpoint SCIM bị giới hạn tốc độ ở mức 1000 yêu cầu mỗi phút cho mỗi token. Vượt quá giới hạn này sẽ trả về HTTP 429.

## Tài nguyên được hỗ trợ {#supported-resources}

| Tài nguyên SCIM | Khái niệm SnapOtter | Tạo | Đọc | Cập nhật | Xóa |
|---|---|---|---|---|---|
| User | Tài khoản người dùng | Có | Có | Có | Xóa mềm |
| Group | Team | Có | Có | Có | Có |

::: warning 
Các Group SCIM ánh xạ tới **teams** của SnapOtter, không phải vai trò. SCIM không thể đặt vai trò của người dùng. Tất cả người dùng được tạo qua SCIM đều được gán vai trò `user`. Để thay đổi vai trò của người dùng, hãy sử dụng giao diện admin của SnapOtter.
:::

## Các thao tác với người dùng {#user-operations}

### Tạo người dùng {#create-user}

`POST /api/v1/scim/v2/Users`

Tạo một tài khoản người dùng mới với `authProvider` đặt thành `scim` và vai trò `user`. Người dùng được gán vào team Default. Nếu `active` là `false`, vai trò được đặt thành `disabled` thay vào đó.

Thuộc tính bắt buộc: `userName`. Tùy chọn: `externalId`, `emails`, `active` (mặc định `true`).

### Liệt kê và lọc người dùng {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Trả về một danh sách người dùng được phân trang. Hỗ trợ các tham số truy vấn `startIndex` và `count` (tối đa 200 kết quả mỗi trang).

Việc lọc chỉ hỗ trợ `eq` (bằng), trên các thuộc tính sau:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Các toán tử lọc và thuộc tính khác trả về HTTP 400.

### Lấy người dùng {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Trả về một người dùng duy nhất theo ID người dùng SnapOtter của họ.

### Thay thế người dùng {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Thay thế các thuộc tính của người dùng. Hỗ trợ `userName`, `externalId`, `emails`, và `active`. Việc thay đổi tên người dùng được kiểm tra xung đột (409 nếu tên người dùng mới đã bị người dùng khác chiếm dụng).

### Vá người dùng {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Cập nhật một phần bằng SCIM PatchOp. Các thao tác được hỗ trợ:

| Thao tác | Đường dẫn |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Giống như `replace` |
| `remove` | `externalId`, `emails` |

Các đường dẫn `name.formatted` và `displayName` được chấp nhận để tương thích nhưng không có tác động lâu dài (SnapOtter không lưu trữ một tên hiển thị riêng biệt).

Các thao tác `replace` không có giá trị (khi giá trị là một object không có `path`) cũng được hỗ trợ, với các khóa `userName`, `externalId`, `emails`, và `active`.

### Vô hiệu hóa người dùng (xóa mềm) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter không xóa cứng người dùng qua SCIM. Thay vào đó, DELETE thực hiện một quá trình vô hiệu hóa mềm:

1. Vai trò của người dùng được đổi từ giá trị hiện tại (ví dụ `editor`) thành `disabled:editor`, giữ nguyên vai trò gốc.
2. Mật khẩu của người dùng được xóa.
3. Tất cả các phiên đang hoạt động bị thu hồi.
4. Tất cả các khóa API bị thu hồi.

Người dùng không còn có thể đăng nhập hoặc sử dụng bất kỳ khóa API nào. Dữ liệu của họ (tệp, lịch sử) được giữ lại.

### Kích hoạt lại người dùng {#reactivate-user}

Để kích hoạt lại một người dùng đã bị vô hiệu hóa trước đó, hãy gửi một yêu cầu `PUT` hoặc `PATCH` với `active: true`. SnapOtter khôi phục vai trò gốc từ trước khi bị vô hiệu hóa (ví dụ `disabled:editor` trở lại thành `editor`). Nếu không thể xác định vai trò gốc, nó quay về `user`.

::: details Ví dụ: vô hiệu hóa và kích hoạt lại qua PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Các thao tác với nhóm {#group-operations}

Các Group SCIM ánh xạ tới các team của SnapOtter. Tạo một nhóm sẽ tạo một team. Tư cách thành viên nhóm kiểm soát người dùng thuộc về team nào.

### Tạo nhóm {#create-group}

`POST /api/v1/scim/v2/Groups`

Bắt buộc: `displayName`. Tùy chọn: `members` (mảng gồm `{ value: userId }`).

### Liệt kê và lọc nhóm {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Việc lọc chỉ hỗ trợ `displayName eq "..."`. Được phân trang với `startIndex` và `count` (tối đa 200 kết quả mỗi trang).

### Lấy nhóm {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Thay thế nhóm {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Thay thế tên nhóm và toàn bộ danh sách thành viên. Các thành viên hiện có không nằm trong danh sách mới sẽ được chuyển sang team Default.

### Vá nhóm {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Hỗ trợ các thao tác sau:

| Thao tác | Đường dẫn | Tác động |
|---|---|---|
| `add` | `members` | Thêm người dùng vào team |
| `remove` | `members[value eq "userId"]` | Chuyển người dùng sang team Default |
| `replace` | `displayName` | Đổi tên team |
| `replace` | `members` | Thay thế toàn bộ thành viên (các thành viên bị loại bỏ chuyển sang team Default) |

### Xóa nhóm {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Xóa team. Tất cả thành viên của team bị xóa được chuyển sang team Default. Người dùng không bị vô hiệu hóa hoặc xóa.

## Thiết lập IdP {#idp-setup}

### Okta {#okta}

1. Trong bảng điều khiển admin của Okta, mở ứng dụng SnapOtter của bạn (hoặc tạo một ứng dụng mới).
2. Đi tới tab **Provisioning** và nhấp **Configure API Integration**.
3. Chọn **Enable API Integration** và nhập:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: Token bearer SCIM được tạo ở trên
4. Nhấp **Test API Credentials**, sau đó **Save**.
5. Trong mục **Provisioning > To App**, bật:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Trong mục **Push Groups**, cấu hình những nhóm Okta nào sẽ đồng bộ thành các team SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Trong cổng Azure, đi tới ứng dụng doanh nghiệp SnapOtter của bạn.
2. Đi tới **Provisioning** và đặt **Provisioning Mode** thành **Automatic**.
3. Trong mục **Admin Credentials**, nhập:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: Token bearer SCIM được tạo ở trên
4. Nhấp **Test Connection**, sau đó **Save**.
5. Trong mục **Mappings**, cấu hình ánh xạ thuộc tính người dùng và nhóm. Các giá trị mặc định thường hoạt động, nhưng hãy xác minh rằng `userName` ánh xạ tới `userPrincipalName` hoặc `mail` theo mong muốn.
6. Đặt **Provisioning Status** thành **On** và lưu.

Azure cung cấp người dùng và nhóm theo một chu kỳ đồng bộ cố định (thường là mỗi 40 phút).

## Các endpoint discovery {#discovery-endpoints}

Ba endpoint này có sẵn mà không cần xác thực và mô tả các khả năng của máy chủ SCIM:

| Endpoint | Mô tả |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Khả năng của máy chủ và các tính năng được hỗ trợ |
| `GET /api/v1/scim/v2/Schemas` | Định nghĩa schema cho User và Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Các loại tài nguyên có sẵn (User, Group) |

`ServiceProviderConfig` công bố các khả năng sau:

| Tính năng | Được hỗ trợ |
|---|---|
| Patch | Có |
| Bulk | Không |
| Filter | Có (tối đa 200 kết quả, chỉ toán tử `eq`) |
| Change password | Không |
| Sort | Không |
| ETag | Không |

## Hạn chế {#limitations}

- **Lọc**: Chỉ hỗ trợ toán tử `eq`. Các bộ lọc phức tạp, toán tử `and`/`or`, `co` (chứa), và `sw` (bắt đầu bằng) không được triển khai.
- **Thao tác hàng loạt**: Không được hỗ trợ.
- **Sort và ETag**: Không được hỗ trợ.
- **Vai trò**: SCIM không thể gán vai trò SnapOtter. Tất cả người dùng được cung cấp đều nhận vai trò `user`.
- **MAX_USERS**: Giới hạn của biến môi trường `MAX_USERS` không được thực thi khi tạo người dùng SCIM. Nếu bạn cần giới hạn số lượng người dùng, hãy quản lý việc gán trong IdP của bạn.
- **Một token**: Chỉ một token SCIM có thể hoạt động tại một thời điểm. Nếu nhiều IdP cần quyền truy cập SCIM, chúng phải dùng chung token.
- **Nhóm là team**: Các Group SCIM tương ứng với team, không phải vai trò hay nhóm quyền.

## Khắc phục sự cố {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Giấy phép của bạn không bao gồm tính năng `scim`, hoặc không có giấy phép nào được cấu hình. SCIM yêu cầu một giấy phép gói enterprise. Hãy xác minh `SNAPOTTER_LICENSE_KEY` đã được đặt và giấy phép bao gồm tính năng `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

Yêu cầu SCIM không bao gồm header `Authorization: Bearer <token>`. Hãy kiểm tra cấu hình cung cấp tài khoản của IdP của bạn.

### 401 "Invalid token" {#_401-invalid-token}

Token không khớp với hash đã lưu. Điều này xảy ra nếu token đã bị thu hồi và tạo lại. Hãy cập nhật token trong cài đặt cung cấp tài khoản của IdP của bạn.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Chưa có token SCIM nào được tạo. Hãy sử dụng endpoint `POST /api/v1/enterprise/scim/token` để tạo một token.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Một người dùng có cùng tên người dùng đã tồn tại. Điều này có thể xảy ra khi một IdP thử lại một thao tác tạo bị thất bại. Hãy kiểm tra tên người dùng trùng lặp trong bảng điều khiển admin của SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP đang gửi hơn 1000 yêu cầu mỗi phút. Điều này thường xảy ra trong lần đồng bộ ban đầu quy mô lớn. Hầu hết các IdP tự động thử lại sau khi cửa sổ giới hạn tốc độ được đặt lại. Nếu sự cố vẫn tiếp diễn, hãy kiểm tra khoảng thời gian đồng bộ cung cấp tài khoản của IdP của bạn.

### Người dùng bị hủy cung cấp nhưng không bị xóa khỏi giao diện {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE là một quá trình vô hiệu hóa mềm. Người dùng bị vô hiệu hóa vẫn xuất hiện trong danh sách người dùng của admin với trạng thái đã tắt. Đây là thiết kế có chủ đích để dữ liệu của họ được bảo toàn. Vai trò của họ hiển thị là `disabled:<original-role>`.

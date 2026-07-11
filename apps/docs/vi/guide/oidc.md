---
description: "Thiết lập Đăng nhập một lần với OpenID Connect. Hướng dẫn từng bước cho Keycloak, Authentik, Google và các nhà cung cấp OIDC khác."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 9a052c1bf9c8
---

# OIDC / Đăng nhập một lần {#oidc-single-sign-on}

SnapOtter hỗ trợ OpenID Connect (OIDC) cho đăng nhập một lần. Người dùng có thể đăng nhập bằng nhà cung cấp danh tính bên ngoài như Keycloak, Authentik hoặc Google thay cho (hoặc song song với) xác thực bằng tên đăng nhập/mật khẩu cục bộ.

::: tip Xem thêm
[SAML SSO](/vi/guide/saml) | [Cấp phát SCIM](/vi/guide/scim) | [Người dùng, Vai trò & Quyền](/vi/guide/users-roles)
:::

## Bắt đầu nhanh {#quick-start}

Thêm các biến môi trường này vào `docker-compose.yml` của bạn:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

Redirect URI cho nhà cung cấp của bạn luôn là:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Ví dụ, nếu `EXTERNAL_URL` là `https://photos.example.com`, hãy cấu hình redirect URI của nhà cung cấp thành `https://photos.example.com/api/auth/oidc/callback`.

## Tài liệu tham khảo cấu hình {#configuration-reference}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `OIDC_ENABLED` | `false` | Bật đăng nhập OIDC. Một nút "Sign in with SSO" xuất hiện trên trang đăng nhập. |
| `OIDC_ISSUER_URL` | | URL issuer của nhà cung cấp. Phải hỗ trợ OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | OAuth client ID đã đăng ký với nhà cung cấp của bạn. |
| `OIDC_CLIENT_SECRET` | | OAuth client secret. |
| `OIDC_SCOPES` | `openid profile email` | Danh sách các scope cần yêu cầu, ngăn cách bằng dấu cách. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Tự động tạo tài khoản người dùng cục bộ ở lần đăng nhập OIDC đầu tiên. |
| `OIDC_DEFAULT_ROLE` | `user` | Vai trò được gán cho người dùng OIDC được tạo tự động. Một trong `admin`, `editor`, hoặc `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Liên kết một danh tính OIDC với người dùng cục bộ hiện có nếu địa chỉ email trùng khớp. |
| `OIDC_PROVIDER_NAME` | | Tên hiển thị trên nút đăng nhập (ví dụ "Keycloak", "Google"). Nếu để trống, nút sẽ ghi "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Dung sai lệch đồng hồ tính bằng giây khi xác thực token. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Claim trong ID token dùng làm tên đăng nhập cho tài khoản mới. |
| `EXTERNAL_URL` | | URL công khai nơi có thể truy cập SnapOtter. Bắt buộc để OIDC dựng đúng redirect URI. |
| `COOKIE_SECRET` | tự động tạo | Secret để ký cookie phiên. Đặt giá trị này rõ ràng khi chạy nhiều replica. |

## Hướng dẫn cho nhà cung cấp {#provider-guides}

### Keycloak {#keycloak}

1. Tạo một realm mới (hoặc dùng realm có sẵn).
2. Vào **Clients** và tạo một client mới:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Trong tab **Settings** của client, đặt **Valid redirect URIs** thành callback URL của bạn (ví dụ `https://photos.example.com/api/auth/oidc/callback`).
4. Sao chép **Client secret** từ tab **Credentials**.
5. Đặt `OIDC_ISSUER_URL` thành `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Trong giao diện admin, vào **Applications > Providers** và tạo một **OAuth2/OpenID Provider** mới.
   - **Client type**: Confidential
   - **Redirect URIs**: Callback URL của bạn
   - **Signing key**: Chọn một khóa có sẵn hoặc tạo mới
2. Tạo một **Application** và liên kết nó với provider.
3. Sao chép **Client ID** và **Client Secret** từ cài đặt provider.
4. Đặt `OIDC_ISSUER_URL` thành `https://authentik.example.com/application/o/snapotter/` (dấu gạch chéo ở cuối quan trọng).

### Google {#google}

1. Vào [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một dự án (hoặc chọn dự án có sẵn).
3. Điều hướng đến **APIs & Services > OAuth consent screen** và cấu hình nó.
4. Vào **APIs & Services > Credentials** và tạo một **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Callback URL của bạn
5. Sao chép **Client ID** và **Client secret**.
6. Đặt `OIDC_ISSUER_URL` thành `https://accounts.google.com`.
7. Đặt `OIDC_USERNAME_CLAIM` thành `email` (Google không cung cấp `preferred_username`).

## Cấp phát người dùng {#user-provisioning}

### Tự động tạo {#auto-create}

Khi `OIDC_AUTO_CREATE_USERS` là `true` (mặc định), một tài khoản người dùng cục bộ được tạo lần đầu tiên khi ai đó đăng nhập qua OIDC. Tên đăng nhập được lấy từ claim được chỉ định bởi `OIDC_USERNAME_CLAIM`, và vai trò được đặt thành `OIDC_DEFAULT_ROLE`.

Nếu xảy ra trùng tên đăng nhập, một hậu tố số sẽ được thêm vào (ví dụ `jane` trở thành `jane_2`).

### Tự động liên kết {#auto-link}

Khi `OIDC_AUTO_LINK_USERS` là `true`, SnapOtter liên kết một danh tính OIDC với tài khoản cục bộ hiện có nếu địa chỉ email trùng khớp. Điều này hữu ích khi bạn đã tạo sẵn tài khoản người dùng và muốn họ bắt đầu dùng SSO mà không mất dữ liệu.

::: warning 
Chỉ bật tự động liên kết nếu bạn tin tưởng nhà cung cấp OIDC của mình xác minh địa chỉ email. Một email chưa được xác minh có thể cho phép ai đó chiếm quyền tài khoản của người dùng khác.
:::

### Tắt đăng nhập cục bộ {#disabling-local-login}

OIDC không tắt đăng nhập bằng tên đăng nhập/mật khẩu cục bộ. Cả hai phương thức vẫn khả dụng. Admin vẫn có thể đăng nhập bằng thông tin đăng nhập cục bộ nếu không thể truy cập nhà cung cấp OIDC.

## Chứng chỉ tự ký {#self-signed-certificates}

Nếu nhà cung cấp OIDC của bạn dùng chứng chỉ tự ký hoặc chứng chỉ CA riêng, hãy mount bundle CA vào container và trỏ `NODE_EXTRA_CA_CERTS` đến nó:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Đừng đặt `NODE_TLS_REJECT_UNAUTHORIZED=0`. Việc này tắt toàn bộ xác minh TLS và là một rủi ro bảo mật.
:::

## Khắc phục sự cố {#troubleshooting}

### Không khớp Redirect URI {#redirect-uri-mismatch}

Lỗi phổ biến nhất. Kiểm tra những khác biệt này giữa những gì nhà cung cấp của bạn mong đợi và những gì SnapOtter gửi:

- `http` so với `https` - scheme phải trùng khớp chính xác
- Dấu gạch chéo cuối - một số nhà cung cấp khá nghiêm về điều này
- Số cổng - hãy đưa cổng vào nếu nó không phải cổng chuẩn
- Đường dẫn - phải là `/api/auth/oidc/callback`

Kiểm tra kỹ `EXTERNAL_URL`. Nó phải khớp với URL mà người dùng nhập vào trình duyệt.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Nhà cung cấp OIDC đang dùng một chứng chỉ mà Node.js không tin cậy. Xem [Chứng chỉ tự ký](#self-signed-certificates) ở trên.

### Lỗi lệch đồng hồ {#clock-skew-errors}

Nếu đồng hồ máy chủ của bạn và đồng hồ của nhà cung cấp OIDC lệch nhau, việc xác thực token có thể thất bại. Tăng `OIDC_CLOCK_TOLERANCE` (mặc định là 30 giây). Cách khắc phục tốt hơn là chạy NTP trên cả hai máy.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter lấy tài liệu discovery của nhà cung cấp lúc khởi động và trong quá trình đăng nhập. Kiểm tra:

- Phân giải DNS từ bên trong container Docker (`docker exec snapotter nslookup auth.example.com`)
- Quy tắc tường lửa giữa container và nhà cung cấp
- Giá trị `OIDC_ISSUER_URL` - nó phải truy cập được từ máy chủ, chứ không chỉ từ trình duyệt của bạn

### Thiếu claim {#missing-claims}

Nếu tên đăng nhập hoặc email trống sau khi đăng nhập, nhà cung cấp của bạn có thể không trả về các claim mong đợi. Xác minh:

- Các scope được cấu hình trong `OIDC_SCOPES` có bao gồm `profile` và `email`
- Nhà cung cấp được cấu hình để đưa claim được chỉ định trong `OIDC_USERNAME_CLAIM` vào ID token
- Một số nhà cung cấp yêu cầu cấu hình mapper/scope rõ ràng để phát hành claim

---
description: "Thiết lập Đăng nhập một lần SAML 2.0 cho SnapOtter. Hướng dẫn từng bước cho Okta, Azure AD / Entra ID, Google Workspace và các nhà cung cấp danh tính SAML khác."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: dad0601eb1e9
---

# SAML SSO {#saml-sso}

SnapOtter hỗ trợ SAML 2.0 cho đăng nhập một lần. Người dùng có thể đăng nhập qua một nhà cung cấp danh tính bên ngoài (Okta, Azure AD / Entra ID, Google Workspace, hoặc bất kỳ IdP SAML 2.0 chuẩn nào) thay cho xác thực bằng tên đăng nhập/mật khẩu cục bộ.

::: tip Tính năng doanh nghiệp
SAML SSO yêu cầu giấy phép **team** hoặc **enterprise** với tính năng `saml_sso`. Nếu `SAML_ENABLED=true` được đặt mà không có giấy phép hợp lệ, các route SAML sẽ được bỏ qua âm thầm và một cảnh báo được ghi log.
:::

## Điều kiện tiên quyết {#prerequisites}

- Một instance SnapOtter đang chạy, truy cập được tại một URL công khai
- `EXTERNAL_URL` được đặt thành URL công khai đó (ví dụ `https://photos.example.com`)
- Một khóa giấy phép team hoặc enterprise với tính năng `saml_sso`
- Quyền admin trên nhà cung cấp danh tính SAML của bạn

## Bắt đầu nhanh {#quick-start}

Thêm các biến môi trường này vào `docker-compose.yml` của bạn:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Khởi động lại container. Một nút "Sign in with SAML" (hoặc nhãn được đặt bởi `SAML_PROVIDER_NAME`) xuất hiện trên trang đăng nhập.

## Tài liệu tham khảo cấu hình {#configuration-reference}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `SAML_ENABLED` | `false` | Bật đăng nhập SAML. |
| `SAML_IDP_SSO_URL` | | URL endpoint SSO của IdP. **Bắt buộc** khi SAML được bật. |
| `SAML_IDP_CERTIFICATE` | | Chứng chỉ ký X.509 của IdP ở định dạng PEM (chính văn bản chứng chỉ, không phải đường dẫn tệp). **Bắt buộc** khi SAML được bật. |
| `EXTERNAL_URL` | | URL công khai nơi có thể truy cập SnapOtter. **Bắt buộc** khi SAML được bật. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI gửi đến IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Tự động tạo tài khoản người dùng cục bộ ở lần đăng nhập SAML đầu tiên. |
| `SAML_AUTO_LINK_USERS` | `false` | Liên kết một danh tính SAML với người dùng cục bộ hiện có nếu địa chỉ email trùng khớp. |
| `SAML_DEFAULT_ROLE` | `user` | Vai trò được gán cho người dùng SAML được tạo tự động. Một trong `admin`, `editor`, hoặc `user`. |
| `SAML_PROVIDER_NAME` | | Nhãn hiển thị cho nút đăng nhập SAML trên frontend (ví dụ "Okta", "Azure AD"). Nếu để trống, nút sẽ ghi "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Thuộc tính assertion SAML dùng làm tên đăng nhập. Nếu để trống, sẽ dùng phần cục bộ của email, rồi đến NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Thuộc tính assertion SAML dùng làm địa chỉ email của người dùng. |

Máy chủ từ chối khởi động nếu `SAML_ENABLED=true` và bất kỳ biến nào trong ba biến bắt buộc (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) bị thiếu.

::: details Lưu ý bảo mật
Cả `wantAuthnResponseSigned` và `wantAssertionsSigned` đều được đặt cứng thành `true`. SnapOtter từ chối các phản hồi SAML không được ký hoặc được ký không đúng cách. Assertion từ một IdP tin cậy được coi là đã xác minh email.

Chỉ hỗ trợ đăng nhập khởi tạo từ SP. SnapOtter không hỗ trợ đăng nhập khởi tạo từ IdP (không được yêu cầu) hay Single Logout (SLO). Đăng xuất khỏi SnapOtter không đăng xuất người dùng khỏi IdP.
:::

## Metadata và URL của SP {#sp-metadata-and-urls}

IdP của bạn cần ba giá trị từ SnapOtter:

| Trường | Giá trị |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Ví dụ, nếu `EXTERNAL_URL` là `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Endpoint metadata: `https://photos.example.com/api/auth/saml/metadata` (trả về XML)

Một số IdP có thể import trực tiếp URL metadata của SP, tự động điền ACS URL và Entity ID.

## Thiết lập nhà cung cấp {#provider-setup}

### Okta {#okta}

1. Trong console admin của Okta, vào **Applications > Create App Integration**.
2. Chọn **SAML 2.0** và nhấn **Next**.
3. Đặt một tên (ví dụ "SnapOtter") và nhấn **Next**.
4. Cấu hình các thiết lập SAML:
   - **Single sign-on URL**: ACS URL của bạn (ví dụ `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Entity ID của bạn (ví dụ `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Trong **Attribute Statements**, thêm `email` ánh xạ tới `user.email`.
6. Nhấn **Next**, rồi **Finish**.
7. Vào tab **Sign On**, nhấn **View SAML setup instructions**, và sao chép:
   - **Identity Provider Single Sign-On URL** vào `SAML_IDP_SSO_URL`
   - **X.509 Certificate** vào `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Trong Azure portal, vào **Microsoft Entra ID > Enterprise applications > New application**.
2. Nhấn **Create your own application**, đặt tên là "SnapOtter", và chọn **Integrate any other application you don't find in the gallery**.
3. Vào **Single sign-on > SAML** và nhấn **Edit** ở phần **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Entity ID của bạn (ví dụ `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: ACS URL của bạn (ví dụ `https://photos.example.com/api/auth/saml/callback`)
4. Trong **SAML Certificates**, tải xuống **Certificate (Base64)**.
5. Trong **Set up SnapOtter**, sao chép **Login URL**.
6. Đặt `SAML_IDP_SSO_URL` thành Login URL và `SAML_IDP_CERTIFICATE` thành nội dung chứng chỉ đã tải xuống.
7. Gán người dùng hoặc nhóm vào ứng dụng trong **Users and groups**.

### Google Workspace {#google-workspace}

1. Trong console admin của Google, vào **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Đặt tên ứng dụng là "SnapOtter" và nhấn **Continue**.
3. Trên trang **Google Identity Provider details**, sao chép **SSO URL** và tải xuống **Certificate**. Nhấn **Continue**.
4. Cấu hình chi tiết Service Provider:
   - **ACS URL**: ACS URL của bạn (ví dụ `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Entity ID của bạn (ví dụ `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Nhấn **Continue**, rồi **Finish**.
6. Bật ứng dụng **ON** cho các đơn vị tổ chức của bạn.
7. Đặt `SAML_IDP_SSO_URL` thành SSO URL từ bước 3 và `SAML_IDP_CERTIFICATE` thành nội dung chứng chỉ đã tải xuống.

### IdP SAML 2.0 chung {#generic-saml-2-0-idp}

Đối với bất kỳ nhà cung cấp danh tính tuân thủ SAML 2.0 nào:

1. Tạo một ứng dụng/nhà cung cấp dịch vụ SAML mới trong IdP của bạn.
2. Đặt **ACS URL** thành `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Đặt **Entity ID** / **Audience** thành `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Cấu hình IdP để gửi email của người dùng trong một thuộc tính có tên `email` (hoặc đặt `SAML_EMAIL_ATTRIBUTE` để khớp với tên thuộc tính của IdP của bạn).
5. Sao chép **IdP SSO URL** và **chứng chỉ ký** vào `SAML_IDP_SSO_URL` và `SAML_IDP_CERTIFICATE`.

## Cấp phát người dùng {#user-provisioning}

### Tự động tạo {#auto-create}

Khi `SAML_AUTO_CREATE_USERS` là `true` (mặc định), một tài khoản người dùng cục bộ được tạo lần đầu tiên khi ai đó đăng nhập qua SAML. Vai trò được đặt thành `SAML_DEFAULT_ROLE`.

Tên đăng nhập được suy ra theo thứ tự này:

1. Giá trị của thuộc tính assertion được chỉ định bởi `SAML_USERNAME_ATTRIBUTE` (nếu được đặt và có mặt)
2. Phần cục bộ của địa chỉ email (mọi thứ trước `@`)
3. SAML NameID

Nếu xảy ra trùng tên đăng nhập, một hậu tố số sẽ được thêm vào (ví dụ `jane` trở thành `jane_2`).

### Tự động liên kết {#auto-link}

Khi `SAML_AUTO_LINK_USERS` là `true`, SnapOtter liên kết một danh tính SAML với tài khoản cục bộ hiện có nếu địa chỉ email trùng khớp. Điều này hữu ích khi bạn đã tạo sẵn tài khoản người dùng và muốn họ bắt đầu dùng SSO mà không mất dữ liệu.

::: warning 
Chỉ bật tự động liên kết nếu bạn tin tưởng IdP SAML của mình xác minh địa chỉ email. Một email chưa được xác minh từ một IdP cấu hình sai có thể cho phép ai đó chiếm quyền tài khoản của người dùng khác.
:::

### Ánh xạ thuộc tính {#attribute-mapping}

| Trường SnapOtter | Nguồn | Cấu hình |
|---|---|---|
| Email | Thuộc tính assertion | `SAML_EMAIL_ATTRIBUTE` (mặc định: `email`) |
| Tên đăng nhập | Thuộc tính assertion, email, hoặc NameID | `SAML_USERNAME_ATTRIBUTE` (xem thứ tự suy ra ở trên) |
| External ID | NameID | Luôn là SAML NameID, không thể cấu hình |

## Bắt buộc SSO {#sso-enforcement}

Nếu bạn muốn yêu cầu tất cả người dùng đăng nhập qua SAML (hoặc OIDC) và chặn đăng nhập bằng mật khẩu cục bộ, hãy bật bắt buộc SSO:

1. Đảm bảo tính năng doanh nghiệp `sso_enforcement` có giấy phép (có sẵn trên gói team và enterprise).
2. Trong **Admin Settings > Security**, bật **SSO Enforcement**.
3. Đặt một **break-glass username**: đây là tài khoản cục bộ duy nhất vẫn có thể đăng nhập bằng mật khẩu, cho truy cập khẩn cấp nếu không thể truy cập IdP.

Khi bắt buộc SSO đang hoạt động, bất kỳ nỗ lực đăng nhập cục bộ nào (ngoài trừ người dùng break-glass) sẽ trả về lỗi 403 với thông báo "Local password login is disabled. Please use SSO."

::: tip 
Luôn cấu hình một break-glass username trước khi bật bắt buộc SSO. Nếu không, bạn có thể bị khóa khỏi SnapOtter nếu IdP của bạn ngừng hoạt động.
:::

## Dùng SAML song song với OIDC {#using-saml-alongside-oidc}

SAML và OIDC có thể được bật đồng thời. Khi cả hai đang hoạt động, trang đăng nhập hiển thị các nút riêng cho từng nhà cung cấp (được gắn nhãn bởi `SAML_PROVIDER_NAME` và `OIDC_PROVIDER_NAME`). Người dùng có thể đăng nhập bằng bất kỳ phương thức nào.

Cả hai nhà cung cấp chia sẻ cùng các thiết lập tự động tạo, tự động liên kết và bắt buộc SSO một cách độc lập: mỗi nhà cung cấp có các biến `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS`, và `*_DEFAULT_ROLE` riêng.

## Khắc phục sự cố {#troubleshooting}

### Xác thực assertion thất bại {#assertion-validation-failed}

Chữ ký phản hồi SAML hoặc chữ ký assertion không thể được xác minh. Kiểm tra:

- Chứng chỉ trong `SAML_IDP_CERTIFICATE` khớp với chứng chỉ ký hiện tại trong IdP của bạn (chứng chỉ có xoay vòng, vì vậy hãy kiểm tra hạn dùng)
- Chứng chỉ ở định dạng PEM (bắt đầu bằng `-----BEGIN CERTIFICATE-----`)
- Chứng chỉ là toàn bộ văn bản, không phải đường dẫn tệp
- ACS URL và Entity ID được cấu hình trong IdP của bạn khớp chính xác với các giá trị của SnapOtter (scheme, host, cổng, đường dẫn)

### Thiếu thuộc tính {#missing-attributes}

Nếu tên đăng nhập hoặc email trống sau khi đăng nhập, IdP của bạn có thể không gửi các thuộc tính mong đợi. Kiểm tra:

- IdP của bạn được cấu hình để phát hành thuộc tính `email` (hoặc bất kỳ giá trị nào `SAML_EMAIL_ATTRIBUTE` được đặt thành)
- Nếu dùng `SAML_USERNAME_ATTRIBUTE`, xác minh rằng thuộc tính đó có trong assertion
- Một số IdP yêu cầu cấu hình ánh xạ thuộc tính rõ ràng trước khi phát hành claim

### Lệch đồng hồ {#clock-skew}

Các assertion SAML bao gồm điều kiện dấu thời gian (`NotBefore`, `NotOnOrAfter`). Nếu đồng hồ máy chủ của bạn và đồng hồ IdP lệch nhau, việc xác thực assertion sẽ thất bại. Chạy NTP trên cả hai máy để giữ đồng hồ đồng bộ.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Cảnh báo này xuất hiện trong log máy chủ khi `SAML_ENABLED=true` nhưng giấy phép không bao gồm tính năng `saml_sso`. Xác minh khóa giấy phép và gói của bạn. Tính năng `saml_sso` có sẵn trên gói team và enterprise.

### Đăng nhập chuyển hướng lại kèm lỗi {#login-redirects-back-with-error}

Nếu nhấn nút đăng nhập SAML chuyển hướng lại về trang đăng nhập kèm một lỗi, hãy kiểm tra log máy chủ để biết chi tiết. Nguyên nhân phổ biến:

- Không thể truy cập IdP SSO URL từ máy chủ
- IdP từ chối yêu cầu xác thực (kiểm tra log kiểm toán của IdP)
- IdP trả về một phản hồi không được ký (SnapOtter yêu cầu cả phản hồi và assertion đều được ký)

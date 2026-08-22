---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 6d35177d9d5a
i18n_hash_version: 2
---
# Khôi phục tài khoản {#account-recovery}

Nếu bạn bị khóa không vào được SnapOtter (thường gặp nhất là do một chính sách MFA mà bạn không
còn đáp ứng được), bạn có thể khôi phục từ bên trong container mà không cần một trình khách cơ sở
dữ liệu. Các lệnh khôi phục chạy ngoại tuyến và yêu cầu quyền truy cập shell vào container,
điều này vốn đã đồng nghĩa với việc kiểm soát toàn bộ phiên bản triển khai.

## Tôi đang gặp phải rào cản nào? {#which-wall-am-i-hitting}

Quá trình đăng nhập của SnapOtter áp dụng hai cổng MFA độc lập. Hãy chẩn đoán trước:

```bash
docker exec -it snapotter snapotter-admin status
```

Lệnh này in ra chính sách MFA hiện tại và những người dùng nào đã đăng ký TOTP.

- **"Bắt buộc đăng ký MFA trước khi đăng nhập" (và bạn chưa bao giờ thiết lập ứng dụng):**
  chính sách yêu cầu MFA nhưng bạn chưa đăng ký. Hãy nới lỏng chính sách.
- **Bạn được yêu cầu nhập một mã mà bạn không thể tạo ra** (mất điện thoại và cả
  mã khôi phục): tài khoản của bạn đã được đăng ký. Hãy xóa đăng ký đó.

## Nới lỏng chính sách MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Lệnh này đặt lại chính sách về `optional`. Nó có hiệu lực ở lần đăng nhập tiếp theo mà không cần
khởi động lại. Nó chỉ luôn đặt `optional`, nên không thể bật lại việc bắt buộc thực thi.

## Xóa đăng ký TOTP của một người dùng {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Nếu chính sách vẫn yêu cầu MFA đối với người dùng đó, họ sẽ gặp phải rào cản đăng ký
ở lần sau, vì vậy hãy chạy thêm `reset-mfa-policy`, đăng nhập và đăng ký lại từ phần Cài đặt.

## Các ảnh cũ hơn và phương án dự phòng {#older-images-and-fallbacks}

Trên một ảnh được dựng trước khi trình bao bọc `snapotter-admin` tồn tại, hãy gọi trực tiếp
tập lệnh:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

Như một phương án cuối cùng trên bất kỳ phiên bản nào, hãy đặt chính sách trong cơ sở dữ liệu. Trên
ảnh tất cả trong một, Postgres chạy bên trong container:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Trên thiết lập nhiều container, hãy trỏ `psql` đến `DATABASE_URL` của riêng bạn.

## Bị khóa khỏi SSO, chứ không phải MFA? {#locked-out-of-sso-not-mfa}

Nếu một lần đăng nhập SSO bắt buộc đang thất bại, hãy dùng tài khoản cục bộ dùng khi khẩn cấp thay thế:
đặt `ssoBreakGlassUsername` thành một quản trị viên cục bộ trong Cài đặt > Bảo mật trước khi bạn
bắt buộc thực thi SSO, rồi đăng nhập bằng mật khẩu của tài khoản đó.

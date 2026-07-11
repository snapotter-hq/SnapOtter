---
description: "Lược đồ cơ sở dữ liệu PostgreSQL, bảng, di trú và quy trình sao lưu cho SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 6c4e1015e3a3
---

# Cơ sở dữ liệu {#database}

SnapOtter sử dụng PostgreSQL 17 với [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) để lưu trữ dữ liệu bền vững. Lược đồ được định nghĩa trong `apps/api/src/db/schema.ts`.

Kết nối được cấu hình qua biến môi trường `DATABASE_URL` (mặc định `postgres://snapotter:snapotter@postgres:5432/snapotter`). Trong Docker Compose, container Postgres lưu dữ liệu của nó trong volume có tên `SnapOtter-pgdata`.

## Bảng {#tables}

### users {#users}

Lưu trữ các tài khoản người dùng. Được tạo tự động ở lần chạy đầu tiên từ `DEFAULT_USERNAME` và `DEFAULT_PASSWORD`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `username` | varchar | Duy nhất, bắt buộc |
| `passwordHash` | varchar | Băm scrypt |
| `role` | varchar | `admin`, `editor`, hoặc `user` |
| `mustChangePassword` | boolean | Cờ buộc đặt lại mật khẩu |
| `createdAt` | timestamp | Thời điểm tạo |
| `updatedAt` | timestamp | Thời điểm cập nhật gần nhất |

### sessions {#sessions}

Các phiên đăng nhập đang hoạt động. Mỗi hàng liên kết một token phiên với một người dùng.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar | Khóa chính (token phiên) |
| `userId` | uuid | Khóa ngoại tới `users.id` |
| `expiresAt` | timestamp | Thời điểm hết hạn |
| `createdAt` | timestamp | Thời điểm tạo |

### teams {#teams}

Các nhóm để tổ chức người dùng. Quản trị viên có thể gán người dùng vào các nhóm.

| Cột | Kiểu | Mô tả |
|--------|------|-------------|
| `id` | uuid | Khóa chính |
| `name` | varchar (duy nhất, tối đa 50 ký tự) | Tên nhóm |
| `createdAt` | timestamp | Thời điểm tạo |

### api_keys {#api-keys}

Các khóa API để truy cập lập trình. Khóa thô chỉ được hiển thị một lần khi tạo; chỉ giá trị băm được lưu trữ.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `userId` | uuid | Khóa ngoại tới `users.id` |
| `keyHash` | varchar | Băm scrypt của khóa |
| `name` | varchar | Nhãn do người dùng cung cấp |
| `createdAt` | timestamp | Thời điểm tạo |
| `lastUsedAt` | timestamp | Được cập nhật ở mỗi yêu cầu đã xác thực |

Các khóa có tiền tố `si_` theo sau bởi 96 ký tự hex (48 byte ngẫu nhiên).

### pipelines {#pipelines}

Các chuỗi công cụ đã lưu mà người dùng tạo trong giao diện.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `name` | varchar | Tên pipeline |
| `description` | varchar | Mô tả tùy chọn |
| `steps` | jsonb | Mảng các đối tượng `{ toolId, settings }` |
| `createdAt` | timestamp | Thời điểm tạo |

### user_files {#user-files}

Thư viện tệp bền vững với việc theo dõi chuỗi phiên bản. Mỗi bước xử lý lưu một kết quả sẽ tạo một hàng mới liên kết tới hàng cha của nó qua `parentId`, tạo thành một cây phiên bản.

| Cột | Kiểu | Mô tả |
|--------|------|-------------|
| `id` | uuid | Khóa chính |
| `userId` | uuid | FK tới users (CASCADE DELETE) |
| `originalName` | varchar | Tên tệp tải lên gốc |
| `storedName` | varchar | Tên tệp trên đĩa |
| `mimeType` | varchar | Kiểu MIME |
| `size` | integer | Kích thước tệp tính bằng byte |
| `width` | integer | Chiều rộng ảnh tính bằng px |
| `height` | integer | Chiều cao ảnh tính bằng px |
| `version` | integer | Số phiên bản (1 = bản gốc) |
| `parentId` | uuid hoặc null | FK tới user_files (phiên bản cha) |
| `toolChain` | jsonb | Các ID công cụ được áp dụng theo thứ tự để tạo ra phiên bản này |
| `createdAt` | timestamp | Thời điểm tạo |

### jobs {#jobs}

Theo dõi các tác vụ xử lý để báo cáo tiến độ và dọn dẹp.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `type` | varchar | Định danh công cụ hoặc pipeline |
| `status` | varchar | `queued`, `processing`, `completed`, hoặc `failed` |
| `progress` | real | Phân số 0.0-1.0 |
| `inputFiles` | jsonb | Mảng các đường dẫn tệp đầu vào |
| `outputPath` | varchar | Đường dẫn tới tệp kết quả |
| `settings` | jsonb | Các thiết lập công cụ đã sử dụng |
| `error` | varchar | Thông báo lỗi nếu thất bại |
| `createdAt` | timestamp | Thời điểm tạo |
| `completedAt` | timestamp | Thời điểm hoàn thành |

### settings {#settings}

Kho lưu trữ khóa-giá trị cho các thiết lập phạm vi toàn máy chủ mà quản trị viên có thể thay đổi từ giao diện.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `key` | varchar | Khóa chính |
| `value` | varchar | Giá trị thiết lập |
| `updatedAt` | timestamp | Thời điểm cập nhật gần nhất |

### roles {#roles}

Các vai trò tùy chỉnh với quyền chi tiết.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `name` | varchar | Tên vai trò duy nhất |
| `description` | varchar | Mô tả tùy chọn |
| `permissions` | jsonb | Mảng các chuỗi quyền |
| `createdAt` | timestamp | Thời điểm tạo |

### audit_log {#audit-log}

Nhật ký các hành động liên quan đến bảo mật.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `userId` | uuid | FK tới users |
| `action` | varchar | Loại hành động |
| `details` | jsonb | Dữ liệu riêng cho hành động |
| `createdAt` | timestamp | Thời điểm hành động |

## Di trú {#migrations}

Drizzle xử lý việc di trú lược đồ. Các tệp di trú nằm trong `apps/api/drizzle/`. Trong quá trình phát triển:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Trong môi trường sản xuất, các di trú đang chờ được áp dụng tự động khi khởi động.

## Sao lưu và khôi phục {#backup-and-restore}

Cơ sở dữ liệu quan hệ nằm trong volume `SnapOtter-pgdata` của container Postgres, không phải volume `/data` của ứng dụng.

**Tùy chọn 1: pg_dump (khuyến nghị)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Tùy chọn 2: Ảnh chụp nhanh volume**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Di trú từ 1.x (SQLite) {#migrating-from-1-x-sqlite}

Nâng cấp từ SnapOtter 1.x có hướng dẫn riêng: xem [Nâng cấp từ 1.x lên 2.0](./upgrading). Nói ngắn gọn, hãy tái sử dụng volume `/data` hiện có của bạn và 2.0 sẽ tự động phát hiện và nhập `/data/snapotter.db` ở lần khởi động đầu tiên (hoặc đặt `SQLITE_MIGRATE_PATH` để trỏ tới nó một cách tường minh). Hãy sao lưu toàn bộ volume `/data` trước, không chỉ `snapotter.db`: 1.x dùng chế độ SQLite WAL, nên một container đã dừng thường để lại phần lớn dữ liệu của nó trong `snapotter.db-wal` bên cạnh một `snapotter.db` gần như rỗng.

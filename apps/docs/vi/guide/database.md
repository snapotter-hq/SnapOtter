---
description: "Lược đồ cơ sở dữ liệu PostgreSQL, bảng, di trú và quy trình sao lưu cho SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 7bdde4aaee73
i18n_hash_version: 2
---

# Cơ sở dữ liệu {#database}

SnapOtter sử dụng PostgreSQL 17 với [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) để lưu trữ dữ liệu bền vững. Lược đồ được định nghĩa trong `apps/api/src/db/schema.ts`.

Kết nối được cấu hình qua biến môi trường `DATABASE_URL` (mặc định `postgres://snapotter:snapotter@postgres:5432/snapotter`). Trong Docker Compose, container Postgres lưu dữ liệu của nó trong volume có tên `SnapOtter-pgdata`. Các yêu cầu được phục vụ trên một vai trò chỉ có thể đọc và ghi các hàng, được trình bày trong phần [Vai trò đặc quyền tối thiểu](#least-privilege-roles) bên dưới.

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

Thư viện tệp bền vững. Theo mặc định, một chỉnh sửa đã lưu được chèn vào như một hàng gốc độc lập («lưu thành tệp mới»: `version` 1, `parentId` null, nên tệp gốc vẫn được liệt kê), hoặc như một phiên bản liên kết với tệp cha khi bạn ghi đè lên tệp gốc (`parentId` được đặt, `version` tăng lên, thay thế nó). Cột `toolChain` ghi lại các công cụ đã áp dụng.

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

### user_preferences {#user-preferences}

Trạng thái giao diện của từng người dùng, lấy tên thiết lập làm khóa. Lưu các công cụ đã ghim trên trang chủ, được ghi qua `PUT /api/v1/preferences`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `userId` | text | FK tới users, xóa theo tầng. Khóa chính cùng với `key` |
| `key` | text | Tên thiết lập. Khóa chính cùng với `userId` |
| `value` | jsonb | Nội dung thiết lập |
| `updatedAt` | timestamp | Lần ghi gần nhất |

## Di trú {#migrations}

Drizzle xử lý việc di trú lược đồ. Các tệp di trú nằm trong `apps/api/drizzle/`. Trong quá trình phát triển:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Trong môi trường sản xuất, các di trú đang chờ được áp dụng tự động khi khởi động.

## Vai trò đặc quyền tối thiểu {#least-privilege-roles}

Hai vai trò, hai nhiệm vụ. `DATABASE_URL` phục vụ các yêu cầu và nắm giữ `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên các bảng của ứng dụng, cùng với `USAGE` và `SELECT` trên các sequence của chúng. Đó là toàn bộ danh sách. Nó không thể tạo hay xóa bảng, cài đặt tiện ích mở rộng, `TRUNCATE`, đọc `pg_authid`, tạo cơ sở dữ liệu, thay đổi một vai trò, hay động tới lược đồ `drizzle` nơi lưu lịch sử di trú.

`DATABASE_MIGRATION_URL` mới là kết nối có đặc quyền. Nó chạy các di trú và cấp quyền cho vai trò thời gian chạy trong lúc khởi động, rồi đóng lại trước khi có bất kỳ yêu cầu nào được phục vụ.

Compose và ảnh all-in-one đã được cấu hình sẵn theo cách này, bao gồm cả các bản cài đặt hiện có. Khi khởi động, SnapOtter tạo vai trò thời gian chạy nếu nó chưa có, cấp quyền cho nó, chạy di trú, rồi quét cấp quyền lên cả những bảng đã tồn tại từ trước. Việc nâng cấp không cần chạy SQL thủ công.

Để trống `DATABASE_MIGRATION_URL` sẽ chạy ở chế độ một vai trò, với `DATABASE_URL` đảm nhiệm cả hai nhiệm vụ đúng như trước khi tách. Đây là một cấu hình được hỗ trợ, không phải một cấu hình lỗi thời. Đó là lựa chọn đúng trên Postgres được quản lý, nơi việc tạo vai trò thường không thuộc quyền của bạn.

### Postgres bên ngoài và được quản lý {#external-and-managed-postgres}

Trên RDS, Supabase, Cloud SQL, hay bất kỳ cụm nào bạn tự vận hành, việc tách vai trò là tùy chọn. Hãy tạo vai trò thời gian chạy một lần:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Sau đó cung cấp cho SnapOtter cả hai chuỗi kết nối, cùng trỏ tới một host, port và cơ sở dữ liệu:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Dừng ở đó. SnapOtter tự áp dụng các cấp quyền và áp dụng lại chúng sau mỗi lần di trú, nên một bảng được thêm bởi bản phát hành sau này vẫn được bao phủ mà không ai phải chạy SQL cho nó.

Vai trò trong `DATABASE_MIGRATION_URL` phải sở hữu các bảng của SnapOtter, vì chỉ chủ sở hữu của một bảng mới có thể cấp quyền trên bảng đó. Trên một bản cài đặt hiện có, điều đó có nghĩa là vai trò mà bạn vẫn dùng để chạy SnapOtter, chứ không phải một vai trò mới tạo riêng cho việc này. Nếu bạn trỏ nó tới một vai trò mới không sở hữu gì cả, quá trình khởi động sẽ thất bại với một lỗi nói đúng điều này. Nó cũng cần `CREATEROLE` để tạo và duy trì vai trò thời gian chạy, cùng với quyền tạo lược đồ `drizzle`.

Nếu bạn đặt cùng một vai trò trong cả hai URL thì việc tách bị tắt, và SnapOtter ghi rõ điều đó trong nhật ký thay vì giả vờ ngược lại. Nếu nhà cung cấp của bạn không có vai trò nào vừa sở hữu được các bảng vừa có `CREATEROLE`, hãy chạy ở chế độ một vai trò.

### Vì sao bit superuser được để nguyên {#why-the-superuser-bit-is-left-alone}

SnapOtter không bao giờ tự ý gỡ `SUPERUSER` khỏi một vai trò. Trên một bản cài đặt được tạo trước khi tách vai trò, `snapotter` là superuser duy nhất của cụm, và hạ quyền nó sẽ khiến cụm không còn superuser nào, chỉ có thể khôi phục qua chế độ một người dùng với máy chủ đã dừng. Thay vào đó, chính việc chuyển kết nối lâu dài sang vai trò bị hạn chế mới là thứ mang lại sự bảo vệ. Superuser chỉ có mặt trên đường truyền trong vài giây khởi động rồi biến mất.

Các bản cài đặt all-in-one mới không bao giờ gặp vấn đề đó. Chúng có ba vai trò: `postgres` (superuser khởi tạo, không xuất hiện trong bất kỳ chuỗi kết nối nào SnapOtter dùng), `snapotter` (`NOSUPERUSER`, sở hữu dữ liệu, chỉ kết nối lúc khởi động), và `snapotter_app` (chỉ thao tác trên hàng, phục vụ các yêu cầu).

Nếu vẫn muốn hạ quyền một `snapotter` cũ, hãy tạo một superuser thứ hai trước và đăng nhập bằng nó để xác nhận nó hoạt động. Sau đó chạy `ALTER ROLE snapotter NOSUPERUSER`.

## Sao lưu và khôi phục {#backup-and-restore}

Cơ sở dữ liệu quan hệ nằm trong ổ `SnapOtter-pgdata` của vùng chứa Postgres chứ không phải ổ `/data` của ứng dụng.

**Sao lưu hợp lý có xác thực (được khuyến nghị)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Cả hai lệnh đều kết nối với tư cách `snapotter`, tức chủ sở hữu, và nên tiếp tục như vậy. Vai trò thời gian chạy không nhìn thấy được lược đồ `drizzle`, nên một bản kết xuất lấy bằng vai trò đó sẽ không đầy đủ. `--no-owner` để các đối tượng được khôi phục thuộc quyền sở hữu của người chạy lệnh khôi phục, nên chạy nó với tư cách chủ sở hữu sẽ đặt quyền sở hữu đúng chỗ mà các cấp quyền mong đợi. Một lưu ý trên cụm mới: `pg_dump` mang theo các cấp quyền nhưng không mang theo các vai trò mà chúng nhắc tới, vì vậy hãy tạo `snapotter_app` trước khi khôi phục, nếu không `--exit-on-error` sẽ dừng ngay ở `GRANT` đầu tiên. Dù thế nào thì SnapOtter cũng sẽ áp dụng lại các cấp quyền ở lần khởi động kế tiếp.

Kết xuất cơ sở dữ liệu này không chứa các đối tượng thư viện đã lưu ở `/data/files` hoặc trạng thái BullMQ bền vững trong Redis. Sao lưu và khôi phục chúng bằng quy trình phối hợp trong [Bảo mật & tăng cường](/vi/guide/security#backup-and-recovery).

**Ảnh chụp nhanh khối lượng lạnh**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Không sao chép thư mục dữ liệu PostgreSQL trực tiếp bằng `tar`. Soạn tiền tố tên tập đĩa theo dự án, do đó hãy phân giải ID tập đĩa được gắn từ `docker inspect` hoặc nền tảng lưu trữ của bạn thay vì giả định nhãn bằng chữ `SnapOtter-pgdata`.

### Di trú từ 1.x (SQLite) {#migrating-from-1-x-sqlite}

Nâng cấp từ SnapOtter 1.x có hướng dẫn riêng: xem [Nâng cấp từ 1.x lên 2.0](./upgrading). Nói ngắn gọn, hãy tái sử dụng volume `/data` hiện có của bạn và 2.0 sẽ tự động phát hiện và nhập `/data/snapotter.db` ở lần khởi động đầu tiên (hoặc đặt `SQLITE_MIGRATE_PATH` để trỏ tới nó một cách tường minh). Hãy sao lưu toàn bộ volume `/data` trước, không chỉ `snapotter.db`: 1.x dùng chế độ SQLite WAL, nên một container đã dừng thường để lại phần lớn dữ liệu của nó trong `snapotter.db-wal` bên cạnh một `snapotter.db` gần như rỗng.

---
description: "Lược đồ cơ sở dữ liệu PostgreSQL, các bảng, migration và quy trình sao lưu của SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 4b1965276998
i18n_hash_version: 2
---

# Cơ sở dữ liệu {#database}

SnapOtter dùng PostgreSQL 17 với [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) để lưu trữ dữ liệu. Lược đồ được định nghĩa trong `apps/api/src/db/schema.ts`.

Kết nối được cấu hình qua biến môi trường `DATABASE_URL` (mặc định `postgres://snapotter:snapotter@postgres:5432/snapotter`). Trong Docker Compose, container Postgres lưu dữ liệu của nó trong named volume `SnapOtter-pgdata`. Các yêu cầu được phục vụ trên một vai trò chỉ có thể đọc và ghi các dòng, điều này được đề cập ở phần [Vai trò đặc quyền tối thiểu](#least-privilege-roles) bên dưới.

## Các bảng {#tables}

### users {#users}

Lưu các tài khoản người dùng. Được tạo tự động ở lần chạy đầu tiên từ `DEFAULT_USERNAME` và `DEFAULT_PASSWORD`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `username` | varchar | Duy nhất, bắt buộc |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor` hoặc `user` |
| `mustChangePassword` | boolean | Cờ buộc đặt lại mật khẩu |
| `createdAt` | timestamp | Thời điểm tạo |
| `updatedAt` | timestamp | Thời điểm cập nhật cuối |

### sessions {#sessions}

Các phiên đăng nhập đang hoạt động. Mỗi dòng gắn một token phiên với một người dùng.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar | Khóa chính (token phiên) |
| `userId` | uuid | Khóa ngoại tới `users.id` |
| `expiresAt` | timestamp | Thời điểm hết hạn |
| `createdAt` | timestamp | Thời điểm tạo |

### teams {#teams}

Các nhóm để tổ chức người dùng. Quản trị viên có thể gán người dùng vào nhóm.

| Cột | Kiểu | Mô tả |
|--------|------|-------------|
| `id` | uuid | Khóa chính |
| `name` | varchar (duy nhất, tối đa 50 ký tự) | Tên nhóm |
| `createdAt` | timestamp | Thời điểm tạo |

### api_keys {#api-keys}

Khóa API để truy cập theo chương trình. Khóa thô chỉ hiển thị một lần khi tạo; chỉ hash được lưu.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `userId` | uuid | Khóa ngoại tới `users.id` |
| `keyHash` | varchar | Hash scrypt của khóa |
| `name` | varchar | Nhãn do người dùng đặt |
| `createdAt` | timestamp | Thời điểm tạo |
| `lastUsedAt` | timestamp | Được cập nhật ở mỗi yêu cầu đã xác thực |

Khóa có tiền tố `si_` theo sau là 96 ký tự hex (48 byte ngẫu nhiên).

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

Thư viện tệp lâu dài. Một chỉnh sửa đã lưu mặc định được chèn như một dòng gốc độc lập ("lưu thành bản mới": `version` 1, `parentId` null, nên bản gốc vẫn được liệt kê), hoặc như một phiên bản liên kết với cha khi bạn ghi đè bản gốc (`parentId` được đặt, `version` được tăng, thay thế nó). Cột `toolChain` ghi lại các công cụ đã áp dụng.

| Cột | Kiểu | Mô tả |
|--------|------|-------------|
| `id` | uuid | Khóa chính |
| `userId` | uuid | FK tới users (CASCADE DELETE) |
| `originalName` | varchar | Tên tệp tải lên gốc |
| `storedName` | varchar | Tên tệp trên đĩa |
| `mimeType` | varchar | Kiểu MIME |
| `size` | integer | Dung lượng tệp tính bằng byte |
| `width` | integer | Chiều rộng hình ảnh tính bằng px |
| `height` | integer | Chiều cao hình ảnh tính bằng px |
| `version` | integer | Số phiên bản (1 = bản gốc) |
| `parentId` | uuid hoặc null | FK tới user_files (phiên bản cha) |
| `toolChain` | jsonb | Các tool ID được áp dụng theo thứ tự để tạo ra phiên bản này |
| `createdAt` | timestamp | Thời điểm tạo |

### jobs {#jobs}

Theo dõi các công việc xử lý để báo cáo tiến trình và dọn dẹp.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | Khóa chính |
| `type` | varchar | Định danh công cụ hoặc pipeline |
| `status` | varchar | `queued`, `processing`, `completed` hoặc `failed` |
| `progress` | real | Phân số 0.0-1.0 |
| `inputFiles` | jsonb | Mảng các đường dẫn tệp đầu vào |
| `outputPath` | varchar | Đường dẫn đến tệp kết quả |
| `settings` | jsonb | Cài đặt công cụ đã dùng |
| `error` | varchar | Thông báo lỗi nếu thất bại |
| `createdAt` | timestamp | Thời điểm tạo |
| `completedAt` | timestamp | Thời điểm hoàn tất |

### settings {#settings}

Kho khóa-giá trị cho các cài đặt toàn máy chủ mà quản trị viên có thể thay đổi từ giao diện.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `key` | varchar | Khóa chính |
| `value` | varchar | Giá trị cài đặt |
| `updatedAt` | timestamp | Thời điểm cập nhật cuối |

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
| `details` | jsonb | Dữ liệu riêng của hành động |
| `createdAt` | timestamp | Thời điểm hành động |

### user_preferences {#user-preferences}

Trạng thái giao diện theo từng người dùng, được khóa theo tên tùy chọn. Hỗ trợ các công cụ được ghim trên bảng điều khiển thông qua `PUT /api/v1/preferences`.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `userId` | text | FK tới users, xóa theo tầng khi xóa. Khóa chính cùng với `key` |
| `key` | text | Tên tùy chọn. Khóa chính cùng với `userId` |
| `value` | jsonb | Dữ liệu tùy chọn |
| `updatedAt` | timestamp | Lần ghi cuối |

## Migration {#migrations}

Drizzle xử lý các migration lược đồ. Các tệp migration nằm trong `apps/api/drizzle/`. Trong quá trình phát triển:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Trong production, các migration đang chờ được áp dụng tự động khi khởi động.

## Vai trò đặc quyền tối thiểu {#least-privilege-roles}

Hai vai trò, hai nhiệm vụ. `DATABASE_URL` phục vụ các yêu cầu và nắm `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên các bảng của ứng dụng cùng `USAGE` và `SELECT` trên các sequence của chúng. Đó là toàn bộ danh sách. Nó không thể tạo hoặc xóa bảng, cài extension, `TRUNCATE`, đọc `pg_authid`, tạo cơ sở dữ liệu, thay đổi vai trò, hay chạm vào lược đồ `drizzle` nơi lịch sử migration được lưu.

`DATABASE_MIGRATION_URL` là vai trò có đặc quyền. Nó chạy migration và cấp quyền cho vai trò runtime trong lúc khởi động, rồi đóng trước khi một yêu cầu nào được phục vụ.

Việc tách này được phát hành trong SnapOtter 2.3.0. Từ bản phát hành đó, các tệp Compose trong repo và image all-in-one được nối dây theo cách này, kể cả các bản cài hiện có: khi khởi động SnapOtter tạo vai trò runtime nếu nó chưa có, cấp quyền cho nó, chạy migration, rồi quét các quyền sang những bảng đã tồn tại từ trước. Nâng cấp không cần SQL thủ công.

Image 2.2.0 chỉ đọc chuỗi kết nối runtime và không bao giờ tạo vai trò thứ hai, nên nếu đưa cho nó cấu hình đã tách thì nó không bao giờ lên được: log của ứng dụng cho thấy xác thực mật khẩu thất bại với vai trò đó, và log Postgres nói rằng vai trò không tồn tại. Hãy nâng image lên 2.3.0 trở lên trước khi bạn chuyển một tệp Compose sang cấu hình tách.

Để trống `DATABASE_MIGRATION_URL` thì chạy với một vai trò duy nhất, với `DATABASE_URL` đảm nhiệm cả hai việc đúng như trước khi tách. Đó là một cấu hình được hỗ trợ, không phải cấu hình bị ngừng khuyến nghị. Đây là câu trả lời đúng trên Postgres được quản lý, nơi việc tạo vai trò thường không thuộc quyền của bạn.

### Postgres bên ngoài và được quản lý {#external-and-managed-postgres}

Trên RDS, Supabase, Cloud SQL, hoặc bất kỳ cụm nào bạn tự chạy, việc tách là tùy chọn. Tạo vai trò runtime một lần:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Sau đó đưa cho SnapOtter cả hai chuỗi kết nối, trỏ đến cùng một máy chủ, cổng và cơ sở dữ liệu:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Dừng ở đó. SnapOtter tự áp dụng các quyền và áp dụng lại sau mỗi migration, nên một bảng được thêm bởi bản phát hành tương lai sẽ được bao phủ mà không ai phải chạy SQL cho nó.

Vai trò trong `DATABASE_MIGRATION_URL` phải sở hữu các bảng của SnapOtter, vì chỉ chủ sở hữu của một bảng mới có thể cấp quyền trên nó. Với một bản cài hiện có, điều đó có nghĩa là vai trò mà bạn vẫn dùng để chạy SnapOtter, không phải một vai trò mới tạo cho mục đích này. Trỏ nó đến một vai trò mới không sở hữu gì và quá trình khởi động thất bại với một lỗi nói đúng điều này. Nó cũng cần `CREATEROLE` để tạo và duy trì vai trò runtime, và quyền tạo lược đồ `drizzle`.

Nêu cùng một vai trò trong cả hai URL và việc tách bị tắt, và SnapOtter nói điều đó trong log thay vì giả vờ khác đi. Nếu nhà cung cấp của bạn không cho vai trò nào vừa sở hữu các bảng vừa nắm `CREATEROLE`, hãy chạy với một vai trò duy nhất.

### Vì sao bit superuser được để yên {#why-the-superuser-bit-is-left-alone}

SnapOtter không bao giờ tự gỡ `SUPERUSER` khỏi một vai trò. Trên một bản cài được tạo trước khi tách, `snapotter` là superuser duy nhất của cụm, và hạ cấp nó sẽ để cụm không còn superuser nào, chỉ có thể khôi phục qua chế độ single-user khi máy chủ đã dừng. Việc chuyển kết nối sống lâu sang vai trò bị hạn chế mới là điều mang lại sự bảo vệ. Superuser chỉ xuất hiện trên đường truyền trong vài giây khởi động rồi biến mất.

Các bản cài all-in-one mới không bao giờ gặp vấn đề đó. Chúng có ba vai trò: `postgres` (superuser khởi tạo, không có trong bất kỳ chuỗi kết nối nào SnapOtter dùng), `snapotter` (`NOSUPERUSER`, sở hữu dữ liệu, chỉ kết nối lúc khởi động), và `snapotter_app` (chỉ các dòng, phục vụ yêu cầu).

Để vẫn hạ cấp một `snapotter` cũ hơn, hãy tạo một superuser thứ hai trước và đăng nhập bằng nó để xác nhận nó hoạt động. Sau đó `ALTER ROLE snapotter NOSUPERUSER`.

## Sao lưu và khôi phục {#backup-and-restore}

Cơ sở dữ liệu quan hệ nằm trong volume `SnapOtter-pgdata` của container Postgres, không phải volume `/data` của ứng dụng.

**Sao lưu logic có xác thực (khuyến nghị)**

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

Cả hai lệnh kết nối với tư cách `snapotter`, chủ sở hữu, và nên tiếp tục như vậy. Vai trò runtime không thấy được lược đồ `drizzle`, nên bản dump lấy bằng vai trò đó sẽ không đầy đủ. `--no-owner` để các đối tượng được khôi phục thuộc về người chạy lệnh khôi phục, nên chạy nó với tư cách chủ sở hữu sẽ đặt quyền sở hữu đúng nơi các quyền được cấp mong đợi. Một lưu ý trên cụm mới: `pg_dump` mang theo các quyền nhưng không mang các vai trò mà chúng nêu tên, nên hãy tạo `snapotter_app` trước khi khôi phục nếu không `--exit-on-error` dừng ở `GRANT` đầu tiên. Dù sao SnapOtter cũng áp dụng lại các quyền ở lần khởi động tiếp theo.

Bản dump cơ sở dữ liệu này không chứa các đối tượng thư viện đã lưu trong `/data/files` hay trạng thái BullMQ bền vững trong Redis. Hãy sao lưu và khôi phục chúng bằng quy trình phối hợp trong [Bảo mật và gia cố](/vi/guide/security#backup-and-recovery).

**Snapshot volume khi tắt**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Không sao chép thư mục dữ liệu PostgreSQL đang chạy bằng `tar`. Compose thêm tiền tố project vào tên volume, nên hãy xác định ID volume được mount từ `docker inspect` hoặc nền tảng lưu trữ của bạn thay vì giả định nhãn nguyên văn `SnapOtter-pgdata`.

### Migrate từ 1.x (SQLite) {#migrating-from-1-x-sqlite}

Nâng cấp từ SnapOtter 1.x có hướng dẫn riêng: xem [Nâng cấp từ 1.x lên 2.0](./upgrading). Tóm lại, hãy dùng lại volume `/data` hiện có của bạn và 2.0 tự phát hiện và nhập `/data/snapotter.db` ở lần khởi động đầu tiên (hoặc đặt `SQLITE_MIGRATE_PATH` để trỏ tới nó một cách tường minh). Hãy sao lưu toàn bộ volume `/data` trước, không chỉ `snapotter.db`: 1.x dùng chế độ WAL của SQLite, nên một container đã dừng thường để phần lớn dữ liệu của nó trong `snapotter.db-wal` bên cạnh một `snapotter.db` gần như rỗng.
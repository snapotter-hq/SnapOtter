---
description: "Tất cả các biến môi trường của SnapOtter kèm giá trị mặc định. Cấu hình xác thực, lưu trữ, mô hình AI, phân tích và hơn thế."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 276f409b7ae6
---

# Cấu hình {#configuration}

Mọi cấu hình được thực hiện qua các biến môi trường. Mỗi biến đều có một giá trị mặc định hợp lý, nên SnapOtter hoạt động ngay từ đầu mà không cần đặt biến nào.

## Các biến môi trường {#environment-variables}

### Máy chủ {#server}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `1349` | Cổng máy chủ lắng nghe. |
| `RATE_LIMIT_PER_MIN` | `1000` | Số yêu cầu tối đa mỗi phút cho mỗi IP. Đặt thành 0 để tắt giới hạn tốc độ. |
| `CORS_ORIGIN` | (trống) | Danh sách các origin được phép cho CORS, phân tách bằng dấu phẩy, hoặc để trống chỉ cho phép cùng origin. |
| `LOG_LEVEL` | `info` | Mức độ chi tiết của nhật ký. Một trong: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Tin tưởng các header `X-Forwarded-For` từ một reverse proxy. Đặt thành `false` nếu không đứng sau proxy. |

### Xác thực {#authentication}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `false` | Đặt thành `true` để yêu cầu đăng nhập. Image Docker mặc định là `true`. |
| `DEFAULT_USERNAME` | `admin` | Tên đăng nhập cho tài khoản admin ban đầu. Chỉ dùng ở lần chạy đầu tiên. |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu cho tài khoản admin ban đầu. Đổi mật khẩu này sau lần đăng nhập đầu. |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng đã đăng ký tối đa. Đặt thành 0 để không giới hạn. |
| `SESSION_DURATION_HOURS` | `168` | Thời gian sống của phiên đăng nhập tính bằng giờ (mặc định là 7 ngày). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Đặt thành bất kỳ giá trị không rỗng nào để bỏ qua lời nhắc buộc đổi mật khẩu ở lần đăng nhập đầu |

### Lưu trữ {#storage}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` hoặc `s3`. S3/MinIO yêu cầu một giấy phép có tính năng s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | Chuỗi kết nối PostgreSQL. |
| `REDIS_URL` | `redis://redis:6379` | Chuỗi kết nối Redis (dùng cho các hàng đợi công việc BullMQ). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Thư mục cho các tệp tạm thời trong quá trình xử lý. Được dọn dẹp tự động. |
| `FILES_STORAGE_PATH` | `./data/files` | Thư mục cho các tệp người dùng bền vững (ảnh đã tải lên, kết quả đã lưu). |

### Chế độ nhúng {#embedded-mode}

Chạy image mà không có `DATABASE_URL` và không có `REDIS_URL` thì nó khởi động PostgreSQL 17 và Redis của riêng nó bên trong container, gắn vào loopback, với tất cả dữ liệu trên volume `/data`. Điều này khôi phục trải nghiệm `docker run` một-lệnh cho khởi động nhanh, homelab, và nâng cấp từ 1.x. Đây là một đường tiện lợi, không phải một triển khai sản xuất: đối với sản xuất, hãy chạy ngăn xếp Compose 3 container với PostgreSQL và Redis riêng. Chế độ nhúng yêu cầu chạy container với quyền root và không tương thích với các runtime dùng UID tùy ý (OpenShift, Kubernetes `runAsNonRoot`); hãy dùng Compose ở đó.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `EMBEDDED` | `auto` | Tự động bật khi cả `DATABASE_URL` và `REDIS_URL` đều không được đặt. Đặt thành `0` để tắt nó (ứng dụng khi đó thất bại nhanh nếu không có `DATABASE_URL`/`REDIS_URL` bên ngoài nào được đặt, thay vì âm thầm khởi động một cơ sở dữ liệu trong container). |
| `REDIS_MAXMEMORY` | `512mb` | Giới hạn bộ nhớ cho Redis nhúng (chỉ chế độ nhúng). Hãy hạ nó xuống trên các máy chủ bị hạn chế bộ nhớ như Raspberry Pi. |

Nâng cấp từ 1.x: đặt `snapotter.db` cũ của bạn tại `/data/snapotter.db` trong volume và chế độ nhúng nhập nó vào PostgreSQL nhúng ở lần khởi động đầu tiên. Việc nhập chạy một lần; các lần khởi động sau bỏ qua nó.

Lưu ý về đo lường từ xa: chế độ nhúng thừa hưởng mặc định phân tích của image như mọi cấu hình khác. Image được phát hành đi kèm phân tích được bật; hãy build với `--build-arg SNAPOTTER_ANALYTICS=off`, hoặc dùng tùy chọn từ chối của admin trong ứng dụng, để tắt nó.

### Giới hạn xử lý {#processing-limits}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Kích thước tệp tối đa cho mỗi lần tải lên tính bằng megabyte. Đặt thành 0 để không giới hạn. |
| `MAX_BATCH_SIZE` | `100` | Số tệp tối đa trong một yêu cầu hàng loạt. Đặt thành 0 để không giới hạn. |
| `CONCURRENT_JOBS` | `0` (tự động) | Số công việc hàng loạt chạy song song. Đặt thành 0 để tự động phát hiện dựa trên số lõi CPU khả dụng. |
| `MAX_MEGAPIXELS` | `0` (không giới hạn) | Độ phân giải ảnh tối đa được phép tính bằng megapixel. Đặt thành 0 để không giới hạn. |
| `MAX_WORKER_THREADS` | `0` (tự động) | Số luồng worker tối đa cho xử lý ảnh. Đặt thành 0 để tự động phát hiện dựa trên số lõi CPU khả dụng. |
| `PROCESSING_TIMEOUT_S` | `0` (không giới hạn) | Thời gian xử lý tối đa cho mỗi yêu cầu tính bằng giây. Đặt thành 0 để không có thời gian chờ. |
| `MAX_PIPELINE_STEPS` | `20` | Số bước tối đa trong một pipeline. Đặt thành 0 để không giới hạn. |
| `MAX_CANVAS_PIXELS` | `0` (không giới hạn) | Kích thước khung vẽ tối đa tính bằng pixel cho các ảnh đầu ra. Đặt thành 0 để không giới hạn. |
| `MAX_SVG_SIZE_MB` | `0` (không giới hạn) | Kích thước tệp SVG tối đa tính bằng megabyte. Đặt thành 0 để không giới hạn. |
| `MAX_SPLIT_GRID` | `100` | Kích thước lưới tối đa cho công cụ chia ảnh. |
| `MAX_PDF_PAGES` | `0` (không giới hạn) | Số trang PDF tối đa cho việc chuyển đổi PDF-to-image. Đặt thành 0 để không giới hạn. |

### Dọn dẹp {#cleanup}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Các kết quả xử lý chưa lưu (các tệp tải lên thô và đầu ra công cụ) được giữ bao lâu trước khi bị xóa tự động. Các tệp bạn lưu rõ ràng vào thư viện Files không bị ảnh hưởng và tồn tại cho đến khi bạn xóa chúng. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Công việc dọn dẹp chạy thường xuyên đến mức nào. |

### Giao diện {#appearance}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `DEFAULT_THEME` | `light` | Chủ đề mặc định cho các phiên mới. `light` hoặc `dark`. |
| `DEFAULT_LOCALE` | `en` | Ngôn ngữ giao diện mặc định. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Bố cục công cụ mặc định. `sidebar` hoặc `fullscreen`. |

### Quyền Docker {#docker-permissions}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PUID` | `999` | Chạy tiến trình container với UID này. Đặt cho khớp với người dùng host của bạn cho các bind mount (`id -u`). |
| `PGID` | `999` | Chạy tiến trình container với GID này. Đặt cho khớp với nhóm host của bạn cho các bind mount (`id -g`). |

## Ví dụ Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Các volume {#volumes}

Ngăn xếp Docker Compose dùng bốn volume:

- `/data` (app) - Các mô hình AI, venv Python và tệp người dùng. Gắn cái này để giữ các tệp đã tải lên và các gói AI đã cài đặt qua các lần khởi động lại.
- `/tmp/workspace` (app) - Lưu trữ tạm thời cho các tệp đang được xử lý. Cái này có thể là tạm thời, nhưng gắn nó tránh làm đầy lớp có thể ghi của container.
- `SnapOtter-pgdata` (postgres) - Thư mục dữ liệu PostgreSQL. Cái này chứa tất cả dữ liệu quan hệ (người dùng, cài đặt, pipeline, công việc, nhật ký kiểm toán). Sao lưu qua `pg_dump` hoặc ảnh chụp nhanh volume.
- `SnapOtter-redisdata` (redis) - Tệp chỉ-ghi-thêm của Redis cho các hàng đợi công việc bền vững.

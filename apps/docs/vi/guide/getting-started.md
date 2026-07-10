---
description: "Cài đặt SnapOtter bằng Docker chỉ với một lệnh. Bao gồm thiết lập Docker Compose, build từ mã nguồn và tổng quan đầy đủ các tính năng."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 56e72fdfb2cb
---

# Bắt đầu {#getting-started}

::: tip Dùng thử trước khi cài đặt
Khám phá toàn bộ giao diện tại [demo.snapotter.com](https://demo.snapotter.com) - không cần đăng ký hay cài đặt.
:::

## Bắt đầu nhanh {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Container duy nhất này chạy mọi thứ nó cần: khi không đặt `DATABASE_URL`, nó khởi động PostgreSQL và Redis riêng trên giao diện loopback (chế độ nhúng) và giữ toàn bộ dữ liệu trong volume `SnapOtter-data`. Đây là cách nhanh nhất để dùng thử SnapOtter hoặc tự lưu trữ trên homelab. Với môi trường production, hãy chạy stack [Docker Compose](#docker-compose) bên dưới, giữ PostgreSQL và Redis trong các container riêng của chúng. Chế độ nhúng chạy dưới quyền root (mặc định) và tự tắt ngay khi bạn đặt `DATABASE_URL`.

Bạn sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.

::: tip Phân tích sản phẩm ẩn danh
SnapOtter bao gồm phân tích sản phẩm ẩn danh theo mặc định. Để tắt, hãy mở **Settings → System → Privacy** và tắt **Anonymous Product Analytics**. Nó dừng ngay lập tức cho toàn bộ instance.

Để biết chi tiết về những gì được thu thập, xem [Những gì SnapOtter thu thập](/vi/guide/telemetry).
:::

::: tip Tăng tốc NVIDIA CUDA
Thêm `--gpus all` để dùng xóa nền, phóng đại, OCR, cải thiện khuôn mặt và phục hồi được tăng tốc bằng NVIDIA CUDA:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Yêu cầu [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Tự động chuyển về CPU khi CUDA không khả dụng. Tăng tốc iGPU của Intel/AMD thông qua VA-API, Quick Sync hoặc OpenCL hiện không được hỗ trợ cho suy luận AI. Xem [Docker Tags](/vi/guide/docker-tags) để biết benchmark.
:::

::: details Cũng có trên GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Cả hai registry đều phát hành cùng một image ở mỗi lần release.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Xem [Cấu hình](/vi/guide/configuration) để biết tất cả các biến môi trường.

## Build từ mã nguồn {#build-from-source}

**Điều kiện tiên quyết:** Node.js 22+, pnpm 9+, Docker (cho Postgres + Redis), Python 3.10+ (cho tính năng AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Những gì bạn có thể làm {#what-you-can-do}

### Xử lý tệp (241 công cụ) {#file-processing-241-tools}

| Phương thức | Số lượng | Công cụ ví dụ |
|----------|-------|---------------|
| **Ảnh** | 105 | Thay đổi kích thước, Cắt, Nén, Chuyển đổi, Xóa nền, Phóng đại, OCR, Đóng dấu bản quyền, Ghép ảnh, Tô màu, Công cụ GIF, các preset định dạng |
| **Video** | 57 | Cắt xén, Cắt, Nén, Chuyển đổi, Gộp, Trích xuất âm thanh, Phụ đề tự động, Video sang GIF, Thay đổi kích thước, Ổn định, các preset định dạng |
| **Âm thanh** | 27 | Cắt xén, Gộp, Chuyển đổi, Chuẩn hóa, Giảm nhiễu, Phiên âm, Dịch cao độ, Làm mờ dần, Tạo nhạc chuông, các preset định dạng |
| **PDF / Tài liệu** | 42 | Gộp, Tách, Nén, OCR, Đóng dấu bản quyền, Ẩn thông tin, Word sang PDF, Excel sang PDF, Xoay, Bảo vệ, Sửa chữa |
| **Tệp** | 10 | CSV sang JSON, JSON sang XML, Gộp CSV, Tách CSV, Tạo ZIP, Giải nén ZIP, Tạo biểu đồ, YAML/JSON |

### Pipeline {#pipelines}

Ghép chuỗi các công cụ thành quy trình nhiều bước và áp dụng cho một ảnh hoặc cả một lô:

1. Mở **Pipelines** trong thanh bên.
2. Thêm các bước (bất kỳ công cụ nào, bất kỳ cài đặt nào).
3. Chạy trên một tệp đơn - hoặc cả một lô cùng lúc.
4. Lưu pipeline để tái sử dụng sau này.

Pipeline cho phép 20 bước theo mặc định. Đặt `MAX_PIPELINE_STEPS=0` để bỏ giới hạn.

### Thư viện tệp {#file-library}

Mọi tệp bạn xử lý đều có thể được lưu vào thư viện **Files** của bạn. SnapOtter theo dõi toàn bộ lịch sử phiên bản để bạn có thể truy vết từng bước xử lý từ tệp gốc được tải lên đến kết quả cuối cùng.

Việc lưu là tường minh: các kết quả bạn lưu vào thư viện được giữ cho đến khi bạn xóa, trong khi các kết quả bạn xử lý và không lưu sẽ tự động bị xóa sau 72 giờ (có thể cấu hình qua `FILE_MAX_AGE_HOURS`).

### REST API & API Key {#rest-api-api-keys}

Mọi công cụ đều có thể truy cập qua HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Tạo API key trong **Settings → API Keys**. Xem [tài liệu tham khảo REST API](/vi/api/rest) để biết tất cả các endpoint, hoặc truy cập [http://localhost:1349/api/docs](http://localhost:1349/api/docs) để dùng tài liệu tham khảo tương tác.

### Đa người dùng & Nhóm {#multi-user-teams}

Bật nhiều người dùng với kiểm soát truy cập theo vai trò:

- **Admin**: toàn quyền - quản lý người dùng, nhóm, cài đặt, tất cả tệp/pipeline/API key
- **User**: dùng công cụ, quản lý tệp/pipeline/API key của riêng mình

Tạo nhóm trong **Settings → Teams** để gom nhóm người dùng.

Đặt `AUTH_ENABLED=true` (hoặc `false` cho trường hợp đơn người dùng/tự dùng mà không cần đăng nhập).

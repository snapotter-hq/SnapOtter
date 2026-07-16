---
description: "Cài đặt SnapOtter với Docker trong một lệnh. Bao gồm thiết lập Docker Compose, build từ mã nguồn, và tổng quan đầy đủ về tính năng."
i18n_output_hash: 79eec34684bb
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Bắt đầu {#getting-started}

::: tip Dùng thử trước khi cài đặt
Khám phá toàn bộ giao diện tại [demo.snapotter.com](https://demo.snapotter.com), không cần đăng ký hay cài đặt.
:::

## Bắt đầu nhanh {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Container duy nhất này chạy mọi thứ nó cần: khi không đặt `DATABASE_URL`, nó khởi động PostgreSQL và Redis của riêng mình trên giao diện loopback (chế độ nhúng) và giữ toàn bộ dữ liệu trong volume `SnapOtter-data`. Đây là cách nhanh nhất để thử SnapOtter hoặc tự lưu trữ trên một homelab. Với production, hãy chạy stack [Docker Compose](#docker-compose) bên dưới, vốn giữ PostgreSQL và Redis trong các container riêng của chúng. Chế độ nhúng chạy dưới danh nghĩa root (mặc định) và tự động tắt ngay khi bạn đặt `DATABASE_URL`.

Cài đặt trên Raspberry Pi, laptop cũ, hay một VPS nhỏ? Xem [Thiết lập trên phần cứng hạn chế](/vi/guide/low-resource) để có hướng dẫn từng bước đã tinh chỉnh và biết nên kỳ vọng gì từ phần cứng hạn chế.

Bạn sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.

::: tip Phân tích sản phẩm ẩn danh
SnapOtter bao gồm phân tích sản phẩm ẩn danh theo mặc định. Để tắt nó, mở **Settings → System → Privacy** và tắt **Anonymous Product Analytics**. Nó dừng ngay lập tức cho toàn bộ instance.

Bạn cũng có thể đặt biến môi trường `SNAPOTTER_TELEMETRY=0` (`false` và `off` cũng hoạt động) để tắt toàn bộ telemetry cho instance mà không cần xây dựng lại.

Việc giám sát lỗi được cung cấp bởi [Sentry](https://sentry.io), đơn vị tài trợ cho SnapOtter thông qua chương trình mã nguồn mở của họ.

Để biết chi tiết về những gì được thu thập, xem [SnapOtter thu thập gì](/vi/guide/telemetry).
:::

::: tip Tăng tốc NVIDIA CUDA
Thêm `--gpus all` để loại bỏ nền, nâng cấp, nâng cấp và phục hồi khuôn mặt được tăng tốc CUDA của NVIDIA. OCR vẫn dựa trên CPU và hoạt động trong cùng một hình ảnh có hoặc không có quyền truy cập GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Yêu cầu [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Tự động chuyển về CPU khi CUDA không khả dụng. Việc tăng tốc iGPU của Intel/AMD thông qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI. Xem [Docker Tags](/vi/guide/docker-tags) để biết các phép đo hiệu năng.
:::

::: details Cũng có trên GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Cả hai registry đều phát hành cùng một image trong mỗi bản phát hành.
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

**Điều kiện tiên quyết:** Node.js 22+, pnpm 9+, Docker (cho Postgres + Redis), Python 3.10+ (cho các tính năng AI), Git.

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

### Xử lý tập tin (200+ công cụ) {#file-processing-200-tools}

| Phương thức | Số lượng | Công cụ ví dụ |
|----------|-------|---------------|
| **Hình ảnh** | 105 | Thay đổi kích thước, Cắt, Nén, Chuyển đổi, Xóa nền, Nâng cấp độ phân giải, OCR, Đóng dấu, Ghép ảnh, Tô màu, Công cụ GIF, preset định dạng |
| **Video** | 57 | Cắt, Cắt khung, Nén, Chuyển đổi, Gộp, Trích xuất âm thanh, Phụ đề tự động, Video sang GIF, Thay đổi kích thước, Ổn định, preset định dạng |
| **Âm thanh** | 27 | Cắt, Gộp, Chuyển đổi, Chuẩn hóa, Giảm nhiễu, Phiên âm, Dịch cao độ, Fade, Tạo nhạc chuông, preset định dạng |
| **PDF / Tài liệu** | 42 | Gộp, Tách, Nén, OCR, Đóng dấu, Che thông tin, Word sang PDF, Excel sang PDF, Xoay, Bảo vệ, Sửa chữa |
| **Tập tin** | 10 | CSV sang JSON, JSON sang XML, Gộp CSV, Tách CSV, Tạo ZIP, Giải nén ZIP, Tạo biểu đồ, YAML/JSON |

### Pipeline {#pipelines}

Ghép chuỗi các công cụ thành các quy trình nhiều bước và áp dụng chúng cho một hình ảnh hoặc cả một lô:

1. Mở **Pipelines** ở thanh bên.
2. Thêm các bước (công cụ bất kỳ, cài đặt bất kỳ).
3. Chạy trên một tập tin đơn, hoặc cả một lô cùng lúc.
4. Lưu pipeline để tái sử dụng sau này.

Pipeline cho phép 20 bước theo mặc định. Đặt `MAX_PIPELINE_STEPS=0` để giới hạn thành không giới hạn.

### Thư viện tập tin {#file-library}

Mọi tập tin bạn xử lý đều có thể được lưu vào thư viện **Files** của bạn. SnapOtter theo dõi toàn bộ lịch sử phiên bản để bạn có thể lần theo mọi bước xử lý từ tải lên gốc đến kết quả cuối cùng.

Việc lưu là tường minh: các kết quả bạn lưu vào thư viện được giữ lại cho đến khi bạn xóa chúng, trong khi các kết quả bạn xử lý và để chưa lưu sẽ tự động bị xóa sau 72 giờ (có thể cấu hình thông qua `FILE_MAX_AGE_HOURS`).

### REST API & API Key {#rest-api-api-keys}

Mọi công cụ đều có thể truy cập qua HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Tạo API key trong mục **Settings → API Keys**. Xem [tham chiếu REST API](/vi/api/rest) để biết tất cả các endpoint, hoặc truy cập [http://localhost:1349/api/docs](http://localhost:1349/api/docs) để có tham chiếu tương tác.

### Đa người dùng & Nhóm {#multi-user-teams}

Bật nhiều người dùng với kiểm soát truy cập dựa trên vai trò:

- **Admin**: toàn quyền, quản lý người dùng, nhóm, cài đặt, tất cả tập tin/pipeline/API key
- **User**: dùng công cụ, quản lý tập tin/pipeline/API key của riêng mình

Tạo các nhóm trong mục **Settings → Teams** để nhóm người dùng lại.

Đặt `AUTH_ENABLED=true` (hoặc `false` cho trường hợp một người dùng/tự sử dụng mà không cần đăng nhập).

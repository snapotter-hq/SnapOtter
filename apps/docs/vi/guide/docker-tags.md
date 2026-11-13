---
description: "Các tag image Docker của SnapOtter, benchmark GPU, cố định phiên bản và hỗ trợ đa nền tảng cho AMD64 và ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 034c354ab871
i18n_hash_version: 2
---

# Tag image Docker {#docker-image}

SnapOtter được phát hành dưới dạng một image Docker duy nhất. Chạy riêng lẻ, image sẽ khởi động PostgreSQL 17 và Redis nhúng sẵn trên giao diện loopback (chế độ nhúng); với môi trường production, hãy chạy cùng các container PostgreSQL 17 và Redis 8 riêng bằng Compose. Image ứng dụng hoạt động trên mọi nền tảng.

## Bắt đầu nhanh {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Khi không đặt `DATABASE_URL`, image chạy ở chế độ nhúng: PostgreSQL và Redis khởi động bên trong container trên loopback, toàn bộ dữ liệu nằm trong volume `SnapOtter-data`. Hãy đặt `DATABASE_URL` và `REDIS_URL` (như stack [Compose](#docker-compose) vẫn làm) để dùng các dịch vụ bên ngoài. Xem [Cấu hình](/vi/guide/configuration#embedded-mode).

## Tăng tốc NVIDIA CUDA {#nvidia-cuda-acceleration}

Image có hỗ trợ NVIDIA CUDA trên amd64. Nếu bạn có GPU NVIDIA và đã cài [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), hãy thêm `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Image tự động phát hiện CUDA khi chạy. Nếu không có `--gpus all`, hoặc khi CUDA không khả dụng, các công cụ AI sẽ chạy trên CPU. Cả hai trường hợp đều dùng cùng một image.

Hiện tại, SnapOtter không hỗ trợ tăng tốc suy luận AI bằng iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL. Việc ánh xạ `/dev/dri` vào container có thể làm lộ thiết bị render, nhưng runtime AI vẫn dùng CPU trừ khi có CUDA.

### Benchmark {#benchmarks}

Thử nghiệm trên NVIDIA RTX 4070 (12 GB VRAM) với ảnh chân dung JPEG 572x1024.

#### Hiệu năng khi đã khởi động {#warm-performance}

| Công cụ | CPU | GPU | Tăng tốc |
|------|-----|-----|---------|
| Xóa nền (u2net) | 2,415ms | 879ms | 2.7x |
| Xóa nền (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| Làm mờ khuôn mặt | 139ms | 122ms | 1.1x |

#### Khởi động lạnh (yêu cầu đầu tiên sau khi container khởi động) {#cold-start-first-request-after-container-start}

| Công cụ | CPU | GPU | Tăng tốc |
|------|-----|-----|---------|
| Xóa nền | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |

OCR không nằm trong phép so sánh CUDA. Cả tầng Tesseract tích hợp sẵn lẫn các tầng RapidOCR/ONNX tùy chọn đều dùng CPU, kể cả khi container có quyền truy cập GPU NVIDIA.

### Kiểm tra tình trạng CUDA {#cuda-health-check}

Sau yêu cầu AI đầu tiên, endpoint kiểm tra tình trạng dành cho quản trị viên sẽ báo cáo trạng thái GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Stack Compose đầy đủ gồm ứng dụng, PostgreSQL 17 và Redis 8. Xem [Triển khai](/vi/guide/deployment) để lấy `docker-compose.yml` hoàn chỉnh. Một ví dụ tối thiểu:

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

Để tăng tốc NVIDIA CUDA qua Docker Compose, hãy thêm phần deploy vào dịch vụ SnapOtter:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Cố định phiên bản {#version-pinning}

| Tag | Mô tả |
|-----|------------|
| `latest` | Bản phát hành mới nhất |
| `2.2.0` | Phiên bản chính xác |
| `2.2` | Bản vá mới nhất trong 2.2.x |
| `2` | Bản minor mới nhất trong 2.x |

## Nền tảng {#platforms}

| Kiến trúc | Hỗ trợ GPU | Ghi chú |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Tăng tốc CUDA đầy đủ cho các công cụ AI |
| linux/arm64 | Chỉ CPU | Raspberry Pi 4/5, Apple Silicon qua Docker Desktop |

## Chuyển từ các tag trước đây {#migration-from-previous-tags}

Nếu bạn từng dùng tag `:cuda`, hãy chuyển sang `:latest` và giữ `--gpus all`. Hỗ trợ GPU như cũ, chỉ còn một image thống nhất.

Dữ liệu và cài đặt của bạn được giữ nguyên trong các volume.

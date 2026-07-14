---
description: "Các thẻ image Docker của SnapOtter, benchmark GPU, ghim phiên bản và hỗ trợ đa nền tảng cho AMD64 và ARM64."
i18n_output_hash: ff6684849549
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Docker Image {#docker-image}

SnapOtter được phân phối dưới dạng một image Docker duy nhất. Chạy image này một mình thì nó sẽ khởi động một PostgreSQL 17 và Redis nhúng trên giao diện loopback (chế độ nhúng); với môi trường production, hãy chạy nó cùng với các container PostgreSQL 17 và Redis 8 riêng biệt qua Compose. Image ứng dụng hoạt động trên mọi nền tảng.

## Bắt đầu nhanh {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Khi không đặt `DATABASE_URL`, image chạy ở chế độ nhúng: PostgreSQL và Redis khởi động bên trong container trên loopback, với toàn bộ dữ liệu nằm dưới volume `SnapOtter-data`. Đặt `DATABASE_URL` và `REDIS_URL` (như stack [Compose](#docker-compose) làm) để dùng các dịch vụ bên ngoài thay thế. Xem [Cấu hình](/vi/guide/configuration#embedded-mode).

## Tăng tốc NVIDIA CUDA {#nvidia-cuda-acceleration}

Image bao gồm hỗ trợ NVIDIA CUDA trên amd64. Nếu bạn có GPU NVIDIA đã cài [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), hãy thêm `--gpus all`:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Image tự động phát hiện CUDA khi chạy. Nếu không có `--gpus all`, hoặc khi CUDA không khả dụng, các công cụ AI chạy trên CPU. Vẫn cùng một image trong cả hai trường hợp.

Tăng tốc iGPU của Intel/AMD thông qua VA-API, Quick Sync hoặc OpenCL hiện không được hỗ trợ cho suy luận AI của SnapOtter. Việc ánh xạ `/dev/dri` vào container có thể lộ thiết bị render, nhưng runtime AI vẫn sẽ dùng CPU trừ khi có CUDA.

### Benchmark {#benchmarks}

Được kiểm thử trên NVIDIA RTX 4070 (12 GB VRAM) với một ảnh chân dung JPEG 572x1024.

#### Hiệu năng khi đã khởi động {#warm-performance}

| Công cụ | CPU | GPU | Tăng tốc |
|------|-----|-----|---------|
| Xóa nền (u2net) | 2,415ms | 879ms | 2.7x |
| Xóa nền (isnet) | 2,457ms | 1,137ms | 2.2x |
| Phóng đại 2x | 350ms | 309ms | 1.1x |
| Phóng đại 4x | 910ms | 310ms | 2.9x |
| Làm mờ khuôn mặt | 139ms | 122ms | 1.1x |

#### Khởi động nguội (yêu cầu đầu tiên sau khi container khởi động) {#cold-start-first-request-after-container-start}

| Công cụ | CPU | GPU | Tăng tốc |
|------|-----|-----|---------|
| Xóa nền | 22,286ms | 4,792ms | 4.7x |
| Phóng đại 2x | 3,957ms | 2,318ms | 1.7x |

OCR không được đưa vào so sánh CUDA. Cả tầng Tesseract tích hợp và tầng RapidOCR/ONNX tùy chọn đều sử dụng CPU, kể cả khi vùng chứa có quyền truy cập NVIDIA GPU.

### Kiểm tra tình trạng CUDA {#cuda-health-check}

Sau yêu cầu AI đầu tiên, endpoint kiểm tra tình trạng của admin sẽ báo cáo trạng thái GPU CUDA:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

Stack Compose đầy đủ bao gồm ứng dụng, PostgreSQL 17 và Redis 8. Xem [Triển khai](/vi/guide/deployment) để có `docker-compose.yml` hoàn chỉnh. Một ví dụ tối giản:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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

## Ghim phiên bản {#version-pinning}

| Thẻ | Mô tả |
|-----|------------|
| `latest` | Bản phát hành mới nhất |
| `1.11.0` | Phiên bản chính xác |
| `1.11` | Bản vá mới nhất trong 1.11.x |
| `1` | Bản minor mới nhất trong 1.x |

## Nền tảng {#platforms}

| Kiến trúc | Hỗ trợ GPU | Ghi chú |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Tăng tốc CUDA đầy đủ cho các công cụ AI |
| linux/arm64 | Chỉ CPU | Raspberry Pi 4/5, Apple Silicon qua Docker Desktop |

## Chuyển đổi từ các thẻ trước đó {#migration-from-previous-tags}

Nếu bạn đang dùng thẻ `:cuda`, hãy chuyển sang `:latest` và giữ `--gpus all`. Cùng hỗ trợ GPU, image hợp nhất.

Dữ liệu và cài đặt của bạn được bảo toàn trong các volume.

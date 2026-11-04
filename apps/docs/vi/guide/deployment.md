---
description: "Triển khai SnapOtter lên môi trường production bằng Docker. Yêu cầu phần cứng, thiết lập GPU và cấu hình reverse proxy cho Nginx, Traefik và Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 9ee358838831
i18n_hash_version: 2
---

# Triển khai {#deployment}

SnapOtter được triển khai dưới dạng một stack Docker Compose gồm 3 container: image ứng dụng SnapOtter, PostgreSQL 17 và Redis 8. Image ứng dụng hỗ trợ **linux/amd64** (với NVIDIA CUDA để tăng tốc AI) và **linux/arm64** (CPU), nên chạy native trên máy chủ Intel/AMD, máy Mac Apple Silicon và các thiết bị ARM như Raspberry Pi 4/5. Hiện chưa hỗ trợ tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL cho suy luận AI.

Xem [Docker Image](./docker-tags) để biết cách thiết lập GPU, ví dụ Docker Compose và cách ghim phiên bản.

## Bắt đầu nhanh (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

Sau đó ứng dụng sẽ khả dụng tại `http://localhost:1349`.

Stack ở trên kết nối với tư cách chủ sở hữu cơ sở dữ liệu. Từ SnapOtter 2.3.0, bạn có thể phục vụ yêu cầu bằng một role chỉ đọc và ghi các hàng; xem [Role đặc quyền tối thiểu](./database#least-privilege-roles).

> **Gặp giới hạn tốc độ của Docker Hub?** Thay `snapotter/snapotter:latest` bằng `ghcr.io/snapotter-hq/snapotter:latest` để kéo image từ GitHub Container Registry. Cả hai registry đều nhận cùng một image ở mỗi bản phát hành.

## Bắt đầu nhanh (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Để tăng tốc NVIDIA CUDA cho các công cụ AI được hỗ trợ (xóa nền, phóng to, cải thiện khuôn mặt):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### Xác minh tăng tốc GPU {#verify-gpu-acceleration}

Kiểm tra việc phát hiện CUDA trong nhật ký:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Nếu các công cụ AI vẫn chạy trên CPU dù `--gpus all` và NVIDIA Container Toolkit đã được thiết lập đúng, hãy cài đặt lại gói bị ảnh hưởng (ví dụ Background Removal) từ **Settings → AI Features**. Trình cài đặt sẽ khôi phục bản ONNX Runtime dành cho GPU, thứ có thể bị che bởi bản chỉ dành cho CPU do một gói khác (chẳng hạn transcription) kéo vào trong môi trường AI dùng chung. Nếu cài đặt lại từ giao diện không khôi phục được GPU trên một image cũ hơn, hãy xem hướng dẫn sửa thủ công tại [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Yêu cầu phần cứng {#hardware-requirements}

Các con số này đến từ các bài đo trên nhiều hệ thống, từ một máy trạm amd64 hiện đại với NVIDIA RTX 4070 cho đến một chiếc Raspberry Pi, chạy toàn bộ danh mục công cụ trên từng máy và quét các giới hạn tài nguyên Docker để tìm ngưỡng tối thiểu thực sự.

Đang chạy ở mức thấp của các cấp này (một chiếc Pi, laptop cũ, VPS 2 GB)? [Thiết lập tài nguyên thấp](/vi/guide/low-resource) biến các con số này thành hướng dẫn cụ thể với các mức giới hạn đã tinh chỉnh.

### Tham khảo nhanh {#quick-reference}

| Cấp | Trường hợp sử dụng | CPU | RAM | GPU | Lưu trữ |
|------|----------|-----|-----|-----|---------|
| Tối thiểu | Công cụ không dùng AI (ảnh, tệp, PDF nhẹ) cùng Fast OCR và nhận diện khuôn mặt tích hợp sẵn; một người dùng; lô nhỏ | 2 nhân | 2 GB | Không | ~7 GB |
| Khuyến nghị | Cả năm nhóm, gồm video, PDF và các gói AI tiêu chuẩn trên CPU; xử lý theo lô; vài người dùng | 4 nhân | 4 GB (8 GB cho inpainting HQ) | Không | ~25 GB |
| Đầy đủ | Mọi thứ ở tốc độ cao, gồm AI trên GPU; lô lớn; nhiều người dùng | 6-8 nhân | 8 GB | NVIDIA 8 GB+ VRAM (12 GB là thoải mái) | ~35 GB |

**Kiến trúc: chỉ 64-bit** (`linux/amd64` hoặc `linux/arm64`). SnapOtter chạy native trên máy chủ Intel/AMD, máy Mac Apple Silicon và các bo mạch ARM 64-bit, gồm cả **Raspberry Pi 4 và 5** (4-8 GB). Nó **không** chạy trên ARM 32-bit (`armv7`/`armhf`), vì không có image nào được build cho kiến trúc đó, cũng không chạy trên các bo mạch cỡ 512 MB như Pi Zero, vốn thấp hơn ngưỡng bộ nhớ (xem bên dưới).

### Tối thiểu (công cụ ảnh, tệp và PDF nhẹ; không có AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 2 nhân |
| RAM | 2 GB |
| Ổ đĩa | ~5.5 GB (image) + volume dữ liệu |
| GPU | Không bắt buộc |

Toàn bộ 222 công cụ không dùng AI trong danh mục - ảnh (đổi kích thước, cắt, chuyển đổi, nén, điều chỉnh, thêm watermark), video (cắt, tắt tiếng, remux), âm thanh (chuyển đổi, chuẩn hóa, cắt), PDF (gộp, tách, nén, xoay, bảo vệ), chuyển đổi tệp và các preset chuyển đổi chuyên dụng - đều chạy được trên phần cứng khiêm tốn. Hầu hết thao tác hoàn tất trong chưa đầy một giây, kể cả với tệp lớn: một ảnh 2.7 MB được đổi kích thước trong ~0.05 giây và mã hóa lại sang WebP trong ~2 giây.

Ngưỡng bộ nhớ là có thật, theo kết quả quét giới hạn tài nguyên Docker: **512 MB không thể khởi động stack** (ngay cả một lần đổi kích thước ảnh cũng bị kill), **1 GB** xử lý được thao tác trên một tệp nhưng lô nhiều tệp sẽ hết bộ nhớ, và **2 GB / 2 nhân** là cấu hình nhỏ nhất xử lý thoải mái các lô không dùng AI. Fast OCR tích hợp sẵn và gói `face-detection` cũng nằm gọn trong 2 GB, trong khi các gói AI lớn hơn (Whisper, LaMa/DDColor, rembg, RealESRGAN, khôi phục ảnh và inpainting HQ SD1.5) cần 4 đến 8 GB RAM và bị từ chối ngay từ đầu khi bộ nhớ trống thấp hơn ngưỡng của từng gói.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Ngoại lệ duy nhất tốn nhiều CPU là mã hóa lại video.** Các thao tác sao chép luồng (cắt, tắt tiếng, remux container) diễn ra tức thì, nhưng chuyển mã sang codec khác bị giới hạn bởi CPU. Một clip 1080p / 45 giây được mã hóa lại sang VP9 (WebM) mất khoảng **~40 giây** trên CPU hiện đại nhanh, ~45 giây trên Apple Silicon, ~80 giây trên laptop 4 nhân đời cũ và **~130 giây** trên máy chủ 4 nhân đời cũ. Nếu khối lượng công việc thiên về video, hãy ưu tiên số nhân CPU và xung nhịp, hoặc nâng giới hạn `cpus:` của container: compose được cung cấp mặc định giới hạn ứng dụng ở 4 nhân (8 trên compose GPU).

### Khuyến nghị (công cụ AI trên CPU) {#recommended-ai-tools-on-cpu}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 4 nhân |
| RAM | 4 GB |
| Ổ đĩa | 3 GB (image) + khoảng 20 GB (toàn bộ gói AI tùy chọn) + không gian làm việc |
| GPU | Không bắt buộc (dự phòng bằng CPU) |

**Việc cài đặt và chạy các gói AI lớn hơn là lý do khuyến nghị lên 4 GB RAM.** Khi không cài gói tùy chọn nào, ứng dụng ở trạng thái nghỉ vào khoảng 360 MB. Các công cụ Python cũ dùng chung một sidecar, còn OCR chính xác dùng một dispatcher chạy lâu dài riêng, gắn với generation bất biến đang hoạt động. Trước khi kích hoạt, trình cài đặt chạy smoke test trên bản ứng viên. Sau đó nó chuyển nguyên tử sang dispatcher mới và xả dispatcher trước đó trước khi thu gom rác. Mọi artifact OCR chính xác chính thức phải vượt qua bộ kiểm thử trường hợp xấu nhất của bản phát hành trong một cgroup 4 GiB, trong khi mức khuyến nghị 4 GB cho máy chủ để lại khoảng dư cho ứng dụng Node.js, Postgres, Redis, các hàng đợi và công việc đồng thời.

Hầu hết công cụ AI dùng tốt trên CPU; một vài công cụ thực sự cần GPU. Đo trên CPU 4 nhân hiện đại:

| Công cụ AI | Thời gian trên CPU | Dùng được trên CPU? |
|---|---|---|
| Nhận diện khuôn mặt (blur-faces, smart-crop, red-eye), noise-removal | dưới 1 giây | Có |
| OCR, transcription, phụ đề | 1-3 giây | Có |
| Colorize, cải thiện khuôn mặt | ~10 giây | Có |
| Xóa / thay / làm mờ nền | ~29 giây | Có (bạn sẽ phải chờ) |
| Phóng to bằng AI (RealESRGAN) | ~33 giây với ảnh nhỏ; nhiều phút với ảnh lớn | Tạm được - rất nên dùng GPU |
| Khôi phục ảnh (toàn bộ quy trình) | vài phút | Không - cần GPU hoặc CPU nhiều nhân nhanh |

SnapOtter chủ ý không đưa các bản tải mô hình này vào image Docker. Các gói AI chỉ được kéo về khi quản trị viên bật công cụ liên quan, được lưu trong volume `/data/ai` bền vững và được chia sẻ cho mọi công cụ phụ thuộc vào cùng một bộ mô hình. Cách này giữ image container cuối cùng nhỏ gọn mà vẫn cho phép một bản cài AI đầy đủ đạt đến các mức dung lượng lớn hơn bên dưới.

Một số công cụ phụ thuộc vào nhiều hơn một gói dùng chung. Ví dụ, Passport Photo cần cả `background-removal` và `face-detection`; nếu `background-removal` đã được cài, việc bật Passport Photo chỉ tải gói `face-detection` còn thiếu. Cơ chế tái sử dụng này áp dụng cho mọi công cụ AI.

Dung lượng lưu trữ gói AI tùy chọn và ngưỡng bộ nhớ CPU (SnapOtter kiểm tra bộ nhớ khả dụng trước khi điều phối sang Python sidecar và từ chối ngay các lần chạy dưới ngưỡng bộ nhớ trống của gói):

| Gói | Dung lượng đĩa | Ngưỡng bộ nhớ CPU |
|---|---|---|
| Nhận diện khuôn mặt | 200-300 MB | 2 GB RAM máy chủ (~0.5 GB trống) |
| Transcription | ~600 MB | 4 GB RAM máy chủ (~2 GB trống) |
| Object eraser + Colorize | 1-2 GB | 4 GB RAM máy chủ (~2 GB trống) |
| OCR chính xác (`balanced`/`best`) | tải về ~208-234 MiB / sau cài ~409-488 MiB | 4 GiB bộ nhớ hiệu dụng được cấu hình (`fast` chạy được trên 2 GB) |
| Xóa nền | 4-5 GB | 4 GB RAM máy chủ (~2.5 GB trống) |
| Upscale + Face enhance + Noise removal | 5-6 GB | 4 GB RAM máy chủ (~2.5 GB trống) |
| Khôi phục ảnh | 4-5 GB | 4 GB RAM máy chủ (~3 GB trống) |
| Inpainting chất lượng cao (`inpaint-hq`) | 5-7 GB | 8 GB RAM máy chủ (~6 GB trống) |
| **Tất cả các gói** | **~25 GB sau khi cài** | **4 GB (8 GB với `inpaint-hq`)** |

Fast OCR được tích hợp sẵn trong image thông qua Tesseract, thêm khoảng 25 MiB và không yêu cầu gói OCR tùy chọn hay yêu cầu bộ nhớ 4 GiB của nó. Fast hỗ trợ `auto`, `en`, `de`, `es`, `fr`, `zh` và `ja`, nhưng không hỗ trợ tiếng Hàn (`ko`) hay tiếng Ả Rập (`ar`). Cả hai dùng `balanced` hoặc `best` nên yêu cầu gói chính xác. Gói chính xác có trong các container Linux amd64 và arm64 chính thức và chạy ONNX Runtime trên CPU. Máy chủ NVIDIA dùng cùng runtime OCR trên CPU đó, nên OCR không phụ thuộc vào phiên bản CUDA hay kiến trúc GPU. Runtime chính xác yêu cầu tối thiểu 4 GiB bộ nhớ hiệu dụng: giới hạn cgroup của container được cấu hình, nếu không thì là bộ nhớ máy chủ. SnapOtter từ chối các hệ thống dưới mức tối thiểu tương thích đã ký đó trước khi tải gói. Việc cài gói chính xác cũng bị từ chối trên các bản lưu trữ bare-metal/dựng sẵn mà libc và Python ABI không thể được đảm bảo. Trên các máy chủ không được hỗ trợ này, OCR tiếng Hàn và tiếng Ả Rập trả về lỗi không tương thích rõ ràng và không bao giờ âm thầm quay về Fast. Một yêu cầu Fast tường minh cho tiếng Hàn trả về `FEATURE_INCOMPATIBLE` với lý do `fast-korean-unsupported` trước khi tác vụ được đưa vào hàng đợi.

Các bản sao dùng chung `DATA_DIR` phải có cùng kiến trúc CPU; hãy ghim các triển khai nhiều bản sao bằng node affinity. Các bản sao amd64/arm64 hỗn hợp cần volume dữ liệu riêng và các triển khai SnapOtter độc lập.

Runtime chính xác giữ một generation hoạt động và xóa bộ nhớ đệm tải về sau khi kích hoạt. Với bản phát hành này, lần cài đầu tiên tạm thời cần khoảng 620-720 MiB cho kho lưu trữ cộng với vùng staging, và một lần nâng cấp có thể đạt đỉnh gần 1.2 GiB trong khi generation cũ vẫn đang hoạt động. Trình cài đặt tính chính xác dung lượng cần thiết từ chỉ mục đã ký và các generation hiện tại trước khi tải hoặc giải nén, và báo lỗi sớm nếu volume dữ liệu quá nhỏ.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Đầy đủ (công cụ AI trên NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 6-8 nhân (chuẩn bị video và xử lý đồng thời chạy trên CPU ngay cả khi AI chạy trên GPU) |
| RAM | 8 GB |
| GPU | NVIDIA với 8+ GB VRAM (khuyến nghị 12 GB) |
| Ổ đĩa | ~35 GB tổng cộng |

GPU NVIDIA (CUDA) tăng tốc đáng kể các mô hình AI nặng. Đo trên RTX 4070 so với một CPU hiện đại:

| Công cụ AI | Mức tăng tốc với GPU | Ghi chú |
|---|---|---|
| Phóng to bằng AI (RealESRGAN 2×) | **~47×** | Lợi ích lớn nhất - dưới một giây so với ~33 giây (nhiều phút với ảnh lớn) |
| Cải thiện khuôn mặt (CodeFormer) | **~12×** | ~0.9 giây so với ~11 giây |
| Transcription (Whisper) | ~4.5× | |
| Xóa / thay / làm mờ nền | ~4× | ~7 giây trên GPU so với ~29 giây trên CPU |
| Colorize | ~1.8× | |
| OCR, nhận diện khuôn mặt, red-eye, noise-removal | ~1× | Đã nhanh trên CPU - GPU không giúp ích |
| Khôi phục ảnh | không | Bị giới hạn bởi CPU ngay cả trên GPU (0% sử dụng GPU); CPU nhanh quan trọng hơn GPU ở đây |

Các công cụ đáng dùng GPU là **upscale, cải thiện khuôn mặt, transcription và xóa nền**. Nhận diện khuôn mặt, OCR và red-eye bị giới hạn bởi CPU và đã nhanh sẵn, nên GPU không bổ sung gì.

Mức dùng VRAM đỉnh đạt 7.5 GB khi upscale kèm cải thiện khuôn mặt. GPU NVIDIA 6 GB hoạt động với hầu hết công cụ AI khi dùng riêng lẻ nhưng sẽ thất bại ở upscale. VRAM 8-12 GB xử lý được mọi thứ.

Hiện chưa hỗ trợ tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL cho suy luận AI. Việc ánh xạ `/dev/dri` vào container không bật tăng tốc GPU cho AI; SnapOtter sẽ chạy các công cụ AI trên CPU trừ khi có NVIDIA CUDA.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Người dùng đồng thời {#concurrent-users}

Các yêu cầu đổi kích thước ảnh song song với container ứng dụng mặc định giới hạn 4 nhân:

| Số yêu cầu đồng thời | Thời gian phản hồi trung bình | Lỗi |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Thời gian phản hồi tăng dưới tuyến tính và không có lỗi khi nhóm worker bão hòa. Nâng giới hạn `cpus:` của container ứng dụng (hoặc dùng máy chủ có nhiều nhân hơn) sẽ nâng trần này. Lưu ý rằng các tác vụ nặng (chuyển mã video, AI trên CPU) giữ một worker trong suốt thời gian chạy, nên hãy định cỡ CPU theo số tác vụ nặng đồng thời dự kiến, không chỉ theo số yêu cầu.

### Định dạng ảnh được hỗ trợ {#supported-image-formats}

SnapOtter hỗ trợ **55+ định dạng đầu vào** và **14 định dạng đầu ra**, gồm tệp RAW từ hơn 20 hãng máy ảnh, các định dạng chuyên nghiệp (PSD, EPS, OpenEXR, HDR), các codec hiện đại (JPEG XL, AVIF, HEIC, QOI) và các định dạng khoa học/game (FITS, DDS).

Xem [danh sách định dạng đầy đủ](/vi/guide/supported-formats) để biết chi tiết về từng định dạng được hỗ trợ, bộ giải mã được dùng và các tùy chọn chất lượng khả dụng.

### Hạn chế đã biết {#known-limitations}

- **Content-aware resize** bị crash với ảnh lớn (>5 MP) do hạn chế của binary caire. Hoạt động bình thường với ảnh nhỏ hơn.
- **Giải mã HEIF** mất 13-23 giây. HEIC (biến thể của Apple) nhanh hơn nhiều, ở mức 0.3-0.9 giây.
- **Upscale** bị hết thời gian chờ trên CPU với mọi ảnh lớn hơn ảnh nhỏ. Cần GPU để dùng thực tế.
- Cải thiện khuôn mặt bằng **CodeFormer** chậm hơn đáng kể so với GFPGAN (53 giây so với 2 giây trên GPU). GFPGAN được khuyến nghị cho hầu hết trường hợp.

## Volume {#volumes}

| Mount / Volume | Mục đích | Bắt buộc? |
|---|---|---|
| `/data` (app) | Mô hình AI, Python venv, tệp người dùng | **Có** - mất tệp nếu thiếu |
| `/tmp/workspace` (app) | Tệp xử lý tạm thời (tự động dọn) | Khuyến nghị |
| `SnapOtter-pgdata` (postgres) | Thư mục dữ liệu PostgreSQL (người dùng, cài đặt, pipeline, tác vụ) | **Có** - mất dữ liệu nếu thiếu |
| `SnapOtter-redisdata` (redis) | Tệp append-only của Redis cho hàng đợi tác vụ bền vững | Khuyến nghị |

### Bind mount so với named volume {#bind-mounts-vs-named-volumes}

**Named volume** (khuyến nghị) - Docker tự quản lý quyền:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** - Bạn tự quản lý quyền. Đặt `PUID`/`PGID` khớp với người dùng trên máy chủ của bạn:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Quyền lưu trữ {#storage-permissions}

SnapOtter ghi vào hai vị trí khi chạy: `/data` (tệp người dùng, nhật ký, mô hình AI và Python venv) và `/tmp/workspace` (vùng đệm xử lý tạm thời). Cả hai phải ghi được bởi người dùng mà container chạy dưới danh nghĩa đó. Nếu không, container sẽ **báo lỗi ngay khi khởi động** với thông báo nêu tên thư mục, UID/GID đang chạy và cách khắc phục, thay vì khởi động ở trạng thái "healthy" rồi thất bại ở lần tải lên đầu tiên với một lỗi khó hiểu. Thư mục nhật ký (`LOG_DIR`, `/data/logs` trong image) được kiểm tra theo cách tương tự, ở mọi chế độ lưu trữ, vì nhật ký luôn nằm cục bộ ngay cả khi tệp nằm trên S3.

Cách xử lý quyền phụ thuộc vào cách container được khởi chạy:

**Mặc định (khởi động bằng root, hạ xuống `snapotter`)** - entrypoint khởi động bằng root, sửa quyền sở hữu của các volume được mount, rồi hạ xuống người dùng không đặc quyền `snapotter` qua `gosu`. Named volume hoạt động mà không cần cấu hình. Với bind mount, hãy đặt `PUID`/`PGID` theo người dùng trên máy chủ của bạn (ở trên) để các tệp nó ghi thuộc quyền sở hữu của bạn.

**Kubernetes / OpenShift (không phải root qua `runAsUser`)** - được khởi chạy trực tiếp bằng người dùng không phải root, container không thể tự chown các volume, nên bộ điều phối phải làm cho chúng ghi được. Đặt `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Các thư mục ghi được của image thuộc nhóm GID 0 và có quyền ghi cho nhóm, vì vậy một pod chạy với **UID tùy ý** cùng nhóm phụ root (mặc định của OpenShift) có thể ghi mà không cần `chown`.

**TrueNAS Scale (và các thiết lập "UID lạ" khác)** - TrueNAS chạy ứng dụng bằng người dùng không phải root (thường là `568:568`) và mount các dataset của máy chủ thuộc về một người dùng khác, nên cả entrypoint lẫn `fsGroup` đều không tự làm cho chúng ghi được. Hãy chọn một trong các cách sau:

- **Chạy ứng dụng bằng root** (khuyến nghị) - để trống người dùng của ứng dụng hoặc đặt thành `0`, và để entrypoint mặc định sửa quyền rồi hạ xuống `snapotter`.
- **Chạy với UID `999`** - đặt người dùng/nhóm của ứng dụng thành `999:999` (người dùng `snapotter` có sẵn của SnapOtter) để khớp với quyền sở hữu của image.
- **`chown` dataset của máy chủ** sang UID mà container chạy, từ shell của TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Lỗi khi khởi động nêu chính xác UID cần dùng, nên cách nhanh nhất là khởi động ứng dụng một lần, đọc thông báo, rồi `chown` (hoặc điều chỉnh người dùng) cho phù hợp.

## Biến môi trường {#environment-variables}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `true` | Bật/tắt yêu cầu đăng nhập |
| `DEFAULT_USERNAME` | `admin` | Tên người dùng quản trị viên ban đầu |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu quản trị viên ban đầu (bắt buộc đổi ở lần đăng nhập đầu tiên) |
| `MAX_UPLOAD_SIZE_MB` | `0` (không giới hạn) | Giới hạn tải lên theo từng tệp, tính bằng MB. Image mặc định là `0`; bản build từ mã nguồn bắt đầu ở 100 |
| `MAX_BATCH_SIZE` | `0` (không giới hạn) | Số tệp tối đa cho mỗi yêu cầu theo lô. Image mặc định là `0`; bản build từ mã nguồn bắt đầu ở 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Số yêu cầu API mỗi phút cho mỗi IP (đặt 0 để tắt) |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng tối đa |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Những peer nào được phép đặt IP của client qua `X-Forwarded-For`. Mặc định chỉ các mạng riêng |
| `PUID` | `999` | Chạy với UID này (cho quyền bind mount) |
| `PGID` | `999` | Chạy với GID này (cho quyền bind mount) |
| `LOG_LEVEL` | `info` | Mức độ chi tiết của nhật ký: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (tự động) | Số tác vụ xử lý AI song song tối đa |
| `SESSION_DURATION_HOURS` | `168` | Thời hạn phiên đăng nhập (7 ngày) |
| `CORS_ORIGIN` | (trống) | Danh sách origin được phép, phân tách bằng dấu phẩy, hoặc để trống để chỉ cho cùng origin |

### Proxy đi ra và CA riêng {#outbound-proxy-and-private-ca}

Container chính thức bật hỗ trợ proxy theo biến môi trường của Node. Nếu SnapOtter phải truy cập kho runtime OCR hoặc các dịch vụ HTTPS khác qua proxy của doanh nghiệp, hãy đặt `HTTPS_PROXY` (và `HTTP_PROXY` khi cần). Đặt `NO_PROXY` thành danh sách các host phân tách bằng dấu phẩy cần được truy cập trực tiếp, chẳng hạn Postgres, Redis và object storage nội bộ.

Nếu proxy hoặc một dịch vụ nội bộ được ký bởi một tổ chức phát hành chứng chỉ riêng, hãy mount chứng chỉ CA ở chế độ chỉ đọc và trỏ `NODE_EXTRA_CA_CERTS` tới nó. Tệp phải tồn tại khi tiến trình Node khởi động:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Hãy giữ thông tin xác thực của proxy bên ngoài tệp Compose (ví dụ trong một tệp `.env` được bảo vệ hoặc một secret). Không tắt xác minh TLS: chỉ mục OCR đã ký xác thực siêu dữ liệu bản phát hành, còn việc xác thực TLS thông thường vẫn bảo vệ đường truyền và mọi yêu cầu đi ra khác.

## Kiểm tra sức khỏe {#health-check}

Container có sẵn health check tích hợp:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` mặc định là `loopback,linklocal,uniquelocal`, nên SnapOtter chỉ tin `X-Forwarded-For` từ một peer nằm trên mạng riêng. Reverse proxy trên cùng máy chủ, trên một mạng Docker hoặc trên LAN của bạn được tin cậy ngay từ đầu, nghĩa là giới hạn tốc độ, bộ giới hạn brute-force đăng nhập, nhật ký kiểm toán và danh sách IP cho phép của bản enterprise đều thấy IP thật của client mà không cần cấu hình.

Chỉ đặt `TRUST_PROXY=true` khi proxy phía trước truy cập SnapOtter từ một địa chỉ **công khai**, chẳng hạn một bộ cân bằng tải trên đám mây ở mạng khác. Trên một instance mở trực tiếp ra ngoài, giá trị đó khiến `request.ip` bị kẻ tấn công kiểm soát, vì người gọi xoay vòng header sẽ nhận một bucket giới hạn tốc độ mới cho mỗi yêu cầu.

Có hai điều cần biết trước khi bạn đi đo IP của client. Docker Desktop trên macOS và Windows phục vụ một cổng đã publish qua một proxy userland ghi đè mọi địa chỉ nguồn thành gateway của VM `192.168.65.1`, nên không giá trị `TRUST_PROXY` nào khôi phục được client thật ở đó; hãy triển khai trên Linux cho mọi thứ hướng ra internet. Và trên mọi nền tảng, việc truy cập một cổng đã publish qua `localhost` được ghi nhận là gateway của bridge chứ không phải client của bạn, nên một bài thử trên localhost không cho bạn biết gì về cách một client thật được định danh. Bảng đầy đủ các giá trị `TRUST_PROXY` và lưu ý về Docker Desktop nằm trong [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Có hai điều quan trọng với mọi proxy bên dưới: cho phép nội dung yêu cầu lớn (tải lên) và không đệm phản hồi. Proxy đệm phản hồi sẽ làm hỏng tiến trình SSE và, dễ thấy hơn, khiến việc tải xuống tệp lớn "bắt đầu nhưng không bao giờ xong", vì proxy giữ toàn bộ tệp trước khi chuyển tiếp. SnapOtter gửi `X-Accel-Buffering: no` trên các lượt tải xuống để nginx phát luồng ngay cả khi việc đệm vẫn bật ở nơi khác, nhưng các proxy khác nginx cần tắt đệm phản hồi một cách tường minh (được minh họa trong từng cấu hình bên dưới). Nếu một lượt tải xuống bị đứng giữa chừng, proxy đệm ở phía trước là thứ đầu tiên cần kiểm tra.

Một lưu ý về HSTS: bản thân API gửi `Strict-Transport-Security` trên mọi phản hồi, nên proxy chuyển tiếp các header phản hồi (mọi cấu hình bên dưới đều làm vậy) không cần thiết lập HSTS riêng. Chỉ khi proxy của bạn được cấu hình để loại bỏ hoặc ghi đè các header phản hồi từ upstream thì bạn mới cần giữ nguyên header đó hoặc thêm lại ở edge.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Triển khai dưới subpath {#subpath}

Để phục vụ tại `https://example.com/snapotter`, hãy đặt `BASE_PATH=/snapotter` trong môi trường
container SnapOtter và khởi động lại nó. Các tệp Compose CPU và GPU chính thức
cũng chấp nhận `BASE_PATH` từ shell của bạn hoặc tệp `.env` của Compose. Cùng một
image hoạt động ở mọi đường dẫn; không cần build lại frontend.

`BASE_PATH` chấp nhận các đoạn phân tách bằng dấu gạch chéo chứa chữ cái, chữ số, `_` hoặc
`-`, gồm cả đường dẫn lồng nhau như `/apps/snapotter`. Dấu gạch chéo ở cuối là
tùy chọn. Để trống (mặc định), hoặc đặt `/`, cho triển khai ở gốc.

Trong khối server HTTPS Nginx hiện có của bạn, hãy dùng:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Ví dụ này giữ nguyên tiền tố. Các proxy loại bỏ `/snapotter` trước khi
chuyển tiếp cũng được hỗ trợ. Các health check nội bộ có thể tiếp tục dùng
`/api/v1/health`. Với OIDC hoặc SAML, hãy đặt thêm
`EXTERNAL_URL=https://example.com/snapotter` và cập nhật các URL callback của
nhà cung cấp danh tính để bao gồm `/snapotter/api/auth/oidc/callback` hoặc
`/snapotter/api/auth/saml/callback` tương ứng.

Các script API tiếp tục hoạt động mà không cần thay đổi: các URL trong phản hồi API, chẳng hạn
`downloadUrl` của một công cụ, bắt đầu bằng `/api/` bất kể `BASE_PATH` là gì. Hãy nối chúng vào URL gốc của
instance (`https://example.com/snapotter` + `/api/v1/download/...`)
thay vì phân giải chúng theo gốc của tên miền.

Hãy mở giao diện qua URL có tiền tố (`https://example.com/snapotter`). Trình
duyệt truy cập mà không có tiền tố sẽ được tự động chuyển hướng tới đó; chỉ các yêu cầu
API mới được kỳ vọng đến ứng dụng mà không có tiền tố. Nếu nhật ký ghi
`Requests arrive under /snapotter/ but BASE_PATH is empty`, thì proxy của bạn đang
chuyển tiếp một tiền tố mà `BASE_PATH` không khai báo: hãy đặt `BASE_PATH` thành tiền tố đó,
hoặc loại bỏ tiền tố ở proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Thêm một Proxy Host mới
2. Đặt Domain Name thành tên miền của bạn
3. Đặt Scheme thành `http`, Forward Hostname thành `SnapOtter` (hoặc IP container của bạn), Forward Port thành `1349`
4. Bật hỗ trợ WebSocket
5. Trong Advanced, thêm: `client_max_body_size 500M;` và `proxy_buffering off;`

Header `Strict-Transport-Security` của API đi qua NPM nguyên vẹn; nút bật HSTS trên tab SSL là tùy chọn bổ sung.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik chuyển tiếp các header phản hồi từ upstream mà không thay đổi, nên header `Strict-Transport-Security` của API đến được trình duyệt mà không cần middleware `headers`. Nếu bạn đã chạy một middleware ghi đè header phản hồi, hãy đảm bảo nó giữ nguyên header đó.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` tắt việc đệm phản hồi, điều bắt buộc để các sự kiện tiến trình SSE (xử lý theo lô, công cụ AI, cài đặt tính năng) và các lượt tải xuống tệp lớn được truyền luồng thay vì bị đứng. Các timeout kéo dài cho phép việc tải lên tệp lớn hoàn tất mà Caddy không đóng kết nối sớm. Caddy cũng chuyển tiếp header `Strict-Transport-Security` của API mà không chỉnh sửa, nên không cần chỉ thị `header` nào cho HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Lưu ý: Cloudflare có giới hạn tải lên 100 MB ở các gói miễn phí. Hãy đặt `MAX_UPLOAD_SIZE_MB=100` cho khớp.

Tunnel chuyển tiếp các header phản hồi của API, gồm cả `Strict-Transport-Security`, nên không cần cấu hình HSTS trên dashboard (thiết lập HSTS ở edge của Cloudflare là tùy chọn bổ sung).

## Khắc phục sự cố {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" ngay sau lần khởi động đầu tiên thất bại {#eai-again-after-failed-first-start}

Nếu lệnh `docker compose up -d` đầu tiên thất bại giữa chừng (nguyên nhân thường gặp là cổng đã được dùng), một lần thử lại `up -d` thông thường có thể khởi động container ứng dụng mà không gắn nó vào mạng compose. Ứng dụng khi đó crash liên tục với lỗi:

```
Postgres not reachable: EAI_AGAIN
```

trong khi `docker ps` cho thấy postgres khỏe mạnh. Lỗi này là thật nhưng chỉ sai container: không có mạng, DNS cho hostname `postgres` hoàn toàn không phân giải được, và chính sách restart lặp lại cùng một lỗi mãi mãi.

Hãy sửa nguyên nhân làm hỏng lần khởi động đầu (thường là giải phóng cổng), rồi buộc container ứng dụng được tạo lại để nó gắn lại vào mạng:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: truy cập được từ các thiết bị khác, nhưng không từ chính PC {#windows-wsl2-loopback}

Với Docker chạy bên trong WSL2 (thiết lập phổ biến trên Windows), stack có thể truy cập được từ mọi máy khác trong mạng của bạn trong khi `http://localhost:1349` bị hết thời gian chờ trên chính máy chủ Windows, ngay cả khi bật chế độ mạng mirrored của WSL. Cổng không bao giờ xuất hiện trong `netstat` của Windows, và các container không có gì sai.

Hãy mở ứng dụng từ thiết bị khác, hoặc từ bên trong distro bằng địa chỉ riêng của nó (`hostname -I` trong shell WSL). Nếu việc chuyển tiếp localhost tình cờ hoạt động trên phiên bản WSL của bạn, hãy coi đó là điểm cộng chứ đừng phụ thuộc vào nó.

## CI/CD {#ci-cd}

Kho GitHub có ba workflow:

- **ci.yml** - Chạy tự động trên mỗi lần push và PR. Lint, typecheck, kiểm thử, build và xác thực image Docker (không push).
- **release.yml** - Được kích hoạt thủ công qua `workflow_dispatch`. Chạy semantic-release để tạo tag phiên bản và bản phát hành GitHub, sau đó build image Docker đa kiến trúc (amd64 + arm64) và push lên Docker Hub (`snapotter/snapotter`) và GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Build trang tài liệu này và triển khai lên Cloudflare Pages khi push lên `main`.

Để tạo một bản phát hành, vào **Actions > Release > Run workflow** trong giao diện GitHub, hoặc chạy:

```bash
gh workflow run release.yml
```

Semantic-release xác định phiên bản từ lịch sử commit. Tag Docker `latest` luôn trỏ tới bản phát hành mới nhất.

## Phân tích ẩn danh {#analytics}

SnapOtter có phân tích sản phẩm ẩn danh (mẫu sử dụng công cụ, báo cáo lỗi) để giúp bắt lỗi và cải thiện tính năng. Tính năng này được bật theo mặc định. Tệp, tên tệp và dữ liệu cá nhân của bạn không bao giờ là một phần của nó. SnapOtter vẫn hoạt động bình thường khi tắt phân tích.

### Tắt phân tích {#disabling-analytics}

Việc tắt khi chạy là một công tắc một cú nhấp chuột dành cho quản trị viên. Mở Settings > System > Privacy và tắt Anonymous Product Analytics. Nó dừng ngay lập tức cho toàn bộ instance, không cần build lại.

Với một image không bao giờ có thể phát phân tích, hãy đặt hard-off ở thời điểm build bằng cách clone kho mã nguồn và build lại:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Hoặc thêm build arg vào `docker-compose.yml` hiện có của bạn:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

---
description: "Triển khai SnapOtter lên production bằng Docker. Yêu cầu phần cứng, thiết lập GPU và cấu hình reverse proxy cho Nginx, Traefik và Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 909e2520d74e
i18n_hash_version: 2
---

# Triển khai {#deployment}

SnapOtter được triển khai dưới dạng stack Docker Compose gồm 3 container: image ứng dụng SnapOtter, PostgreSQL 17 và Redis 8. Image ứng dụng hỗ trợ **linux/amd64** (có NVIDIA CUDA để tăng tốc AI) và **linux/arm64** (CPU), nên nó chạy native trên máy chủ Intel/AMD, máy Mac Apple Silicon và các thiết bị ARM như Raspberry Pi 4/5. Hiện tại không hỗ trợ tăng tốc suy luận AI bằng iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL.

Xem [Image Docker](./docker-tags) để biết cách thiết lập GPU, các ví dụ Docker Compose và cố định phiên bản.

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

Sau đó ứng dụng khả dụng tại `http://localhost:1349`.

Stack ở trên kết nối với tư cách chủ sở hữu cơ sở dữ liệu. Từ SnapOtter 2.3.0, bạn có thể phục vụ yêu cầu bằng một role chỉ đọc và ghi các dòng; xem [Role đặc quyền tối thiểu](./database#least-privilege-roles).

> **Gặp giới hạn tốc độ của Docker Hub?** Thay `snapotter/snapotter:latest` bằng `ghcr.io/snapotter-hq/snapotter:latest` để kéo từ GitHub Container Registry. Cả hai registry đều nhận cùng một image ở mỗi bản phát hành.

## Bắt đầu nhanh (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Để tăng tốc NVIDIA CUDA cho các công cụ AI được hỗ trợ (xóa nền, upscale, nâng cấp khuôn mặt):

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

Kiểm tra việc phát hiện CUDA trong log:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Nếu các công cụ AI vẫn chạy trên CPU dù `--gpus all` và NVIDIA Container Toolkit đã được thiết lập đúng, hãy cài lại bundle bị ảnh hưởng (ví dụ Background Removal) từ **Settings → AI Features**. Trình cài đặt khôi phục bản build GPU của ONNX Runtime, vốn có thể bị che bởi bản build chỉ dùng CPU do một bundle khác (chẳng hạn transcription) kéo vào trong môi trường AI dùng chung. Nếu cài lại từ giao diện không khôi phục được GPU trên image cũ hơn, xem cách sửa thủ công trong [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Yêu cầu phần cứng {#hardware-requirements}

Các con số này đến từ benchmark trên nhiều hệ thống, từ một máy trạm amd64 hiện đại với NVIDIA RTX 4070 xuống tới Raspberry Pi, chạy toàn bộ danh mục công cụ trên từng máy và quét các giới hạn tài nguyên Docker để tìm ngưỡng tối thiểu thực sự.

Bạn chạy ở đầu nhỏ của các mức này (một chiếc Pi, laptop cũ, VPS 2 GB)? [Thiết lập cho tài nguyên thấp](/vi/guide/low-resource) biến các con số này thành một hướng dẫn cụ thể với các giới hạn đã tinh chỉnh.

### Tham chiếu nhanh {#quick-reference}

| Mức | Trường hợp dùng | CPU | RAM | GPU | Lưu trữ |
|------|----------|-----|-----|-----|---------|
| Tối thiểu | Công cụ không dùng AI (ảnh, tệp, PDF nhẹ) cùng Fast OCR và nhận diện khuôn mặt tích hợp sẵn; một người dùng; lô nhỏ | 2 nhân | 2 GB | Không | ~7 GB |
| Khuyến nghị | Cả năm phương thức gồm video, PDF và các bundle AI tiêu chuẩn trên CPU; xử lý lô; vài người dùng | 4 nhân | 4 GB (8 GB cho HQ inpainting) | Không | ~25 GB |
| Đầy đủ | Mọi thứ ở tốc độ cao gồm AI trên GPU; lô lớn; nhiều người dùng | 6-8 nhân | 8 GB | NVIDIA 8 GB+ VRAM (12 GB là thoải mái) | ~35 GB |

**Kiến trúc: chỉ 64-bit** (`linux/amd64` hoặc `linux/arm64`). SnapOtter chạy native trên máy chủ Intel/AMD, máy Mac Apple Silicon và các bo mạch ARM 64-bit bao gồm **Raspberry Pi 4 và 5** (4-8 GB). Nó **không** chạy trên ARM 32-bit (`armv7`/`armhf`) vì không có image nào được build cho kiến trúc đó, cũng không chạy trên các bo mạch cỡ 512 MB như Pi Zero, vốn thấp hơn mức bộ nhớ tối thiểu (xem bên dưới).

### Tối thiểu (công cụ ảnh, tệp và PDF nhẹ; không dùng AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 2 nhân |
| RAM | 2 GB |
| Đĩa | ~5.5 GB (image) + volume dữ liệu |
| GPU | Không bắt buộc |

Toàn bộ 222 công cụ không dùng AI trong danh mục - ảnh (resize, crop, convert, compress, adjust, watermark), video (trim, mute, remux), âm thanh (convert, normalize, trim), PDF (merge, split, compress, rotate, protect), chuyển đổi tệp và các preset chuyển đổi chuyên dụng - chạy được trên phần cứng khiêm tốn. Phần lớn thao tác hoàn tất trong chưa đầy một giây, kể cả với tệp lớn: một ảnh 2.7 MB được resize trong ~0.05 giây và mã hóa lại sang WebP trong ~2 giây.

Mức bộ nhớ tối thiểu là thật, rút ra từ một đợt quét giới hạn tài nguyên Docker: **512 MB không thể khởi động stack** (ngay cả một lần resize ảnh cũng bị kill), **1 GB** xử lý được các thao tác trên một tệp nhưng lô nhiều tệp sẽ hết bộ nhớ, và **2 GB / 2 nhân** là cấu hình nhỏ nhất xử lý thoải mái các lô không dùng AI. Fast OCR tích hợp sẵn và bundle `face-detection` cũng nằm gọn trong 2 GB, trong khi các bundle AI lớn hơn (Whisper, LaMa/DDColor, rembg, RealESRGAN, phục hồi ảnh và SD1.5 HQ inpainting) cần 4 đến 8 GB RAM và bị từ chối ngay từ đầu khi bộ nhớ trống thấp hơn mức tối thiểu của từng bundle.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Ngoại lệ duy nhất tốn nhiều CPU là mã hóa lại video.** Các thao tác stream-copy (trim, mute, remux container) diễn ra tức thì, nhưng transcode sang codec khác bị giới hạn bởi CPU. Một clip 1080p / 45 giây được mã hóa lại sang VP9 (WebM) mất khoảng **~40 giây** trên CPU hiện đại nhanh, ~45 giây trên Apple Silicon, ~80 giây trên máy di động 4 nhân đời cũ, và **~130 giây** trên máy chủ 4 nhân đời cũ. Nếu khối lượng công việc của bạn nặng về video, hãy ưu tiên số nhân CPU và xung nhịp, hoặc tăng giới hạn `cpus:` của container; tệp compose đi kèm giới hạn ứng dụng ở 4 nhân theo mặc định (8 nhân với compose GPU).

### Khuyến nghị (công cụ AI trên CPU) {#recommended-ai-tools-on-cpu}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 4 nhân |
| RAM | 4 GB |
| Đĩa | 3 GB (image) + khoảng 20 GB (toàn bộ gói AI tùy chọn) + không gian làm việc |
| GPU | Không bắt buộc (dự phòng bằng CPU) |

**Việc cài đặt và chạy các bundle AI lớn hơn là điều đẩy mức khuyến nghị lên 4 GB RAM.** Khi chưa cài gói tùy chọn nào, ứng dụng ở trạng thái rảnh với khoảng 360 MB. Các công cụ Python kế thừa dùng chung một sidecar, trong khi OCR chính xác dùng một dispatcher sống lâu chuyên dụng, được ghim vào thế hệ bất biến đang hoạt động. Trước khi kích hoạt, trình cài đặt chạy smoke test trên bản ứng viên. Sau đó nó chuyển nguyên tử sang dispatcher mới và xả dispatcher cũ trước khi thu gom rác. Mọi artifact OCR chính xác chính thức phải vượt qua bộ kiểm thử trường hợp xấu nhất của bản phát hành bên trong cgroup 4 GiB, trong khi mức khuyến nghị 4 GB cho máy chủ để lại khoảng dư cho ứng dụng Node.js, Postgres, Redis, hàng đợi và công việc đồng thời.

Hầu hết công cụ AI dùng tốt trên CPU; một vài công cụ thực sự cần GPU. Đo trên CPU 4 nhân hiện đại:

| Công cụ AI | Thời gian CPU | Dùng được trên CPU? |
|---|---|---|
| Nhận diện khuôn mặt (blur-faces, smart-crop, red-eye), noise-removal | dưới 1 giây | Có |
| OCR, transcription, phụ đề | 1-3 giây | Có |
| Colorize, nâng cấp khuôn mặt | ~10 giây | Có |
| Xóa / thay / làm mờ nền | ~29 giây | Có (bạn sẽ phải chờ) |
| Upscale AI (RealESRGAN) | ~33 giây với ảnh nhỏ; vài phút với ảnh lớn | Ở mức biên: rất nên dùng GPU |
| Phục hồi ảnh (toàn bộ pipeline) | vài phút | Không: cần GPU hoặc CPU nhiều nhân nhanh |

SnapOtter chủ ý không đóng gói sẵn các model này vào image Docker. Các bundle AI chỉ được kéo về khi quản trị viên bật công cụ liên quan, được lưu trong volume `/data/ai` bền vững và được chia sẻ cho mọi công cụ phụ thuộc cùng một stack model. Điều này giữ cho image container cuối cùng nhỏ gọn mà vẫn cho phép một bản cài AI đầy đủ đạt tới các con số lưu trữ lớn hơn bên dưới.

Một số công cụ phụ thuộc nhiều hơn một bundle dùng chung. Ví dụ, Passport Photo cần cả `background-removal` và `face-detection`; nếu `background-removal` đã được cài, việc bật Passport Photo chỉ tải bundle `face-detection` còn thiếu. Việc tái sử dụng tương tự áp dụng cho mọi công cụ AI.

Dung lượng lưu trữ gói AI tùy chọn và mức bộ nhớ CPU tối thiểu (SnapOtter kiểm tra bộ nhớ khả dụng trước khi chuyển tác vụ sang sidecar Python và từ chối ngay các lần chạy dưới mức bộ nhớ trống tối thiểu của bundle):

| Bundle | Dung lượng đĩa | Bộ nhớ CPU tối thiểu |
|---|---|---|
| Nhận diện khuôn mặt | 200-300 MB | 2 GB RAM máy chủ (~0.5 GB trống) |
| Transcription | ~600 MB | 4 GB RAM máy chủ (~2 GB trống) |
| Object eraser + Colorize | 1-2 GB | 4 GB RAM máy chủ (~2 GB trống) |
| OCR chính xác (`balanced`/`best`) | tải ~208-234 MiB / cài ~409-488 MiB | 4 GiB bộ nhớ hiệu dụng được cấu hình (`fast` chạy trên 2 GB) |
| Xóa nền | 4-5 GB | 4 GB RAM máy chủ (~2.5 GB trống) |
| Upscale + nâng cấp khuôn mặt + khử nhiễu | 5-6 GB | 4 GB RAM máy chủ (~2.5 GB trống) |
| Phục hồi ảnh | 4-5 GB | 4 GB RAM máy chủ (~3 GB trống) |
| High-Quality Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB RAM máy chủ (~6 GB trống) |
| **Tất cả bundle** | **~25 GB sau khi cài** | **4 GB (8 GB với `inpaint-hq`)** |

Fast OCR được tích hợp sẵn trong image thông qua Tesseract, thêm khoảng 25 MiB và không yêu cầu gói OCR tùy chọn hay yêu cầu bộ nhớ 4 GiB của nó. Fast hỗ trợ `auto`, `en`, `de`, `es`, `fr`, `zh` và `ja`, nhưng không hỗ trợ tiếng Hàn (`ko`) hay tiếng Ả Rập (`ar`). Cả hai dùng `balanced` hoặc `best` và do đó cần gói chính xác. Gói chính xác có trong các container Linux amd64 và arm64 chính thức và chạy ONNX Runtime trên CPU. Máy chủ NVIDIA dùng cùng runtime OCR CPU đó, nên OCR không phụ thuộc vào phiên bản CUDA hay kiến trúc GPU. Runtime chính xác yêu cầu tối thiểu 4 GiB bộ nhớ hiệu dụng: giới hạn cgroup của container được cấu hình, nếu không thì là bộ nhớ máy chủ. SnapOtter từ chối các hệ thống dưới mức tối thiểu tương thích đã ký đó trước khi tải gói. Việc cài gói chính xác cũng bị từ chối trên các archive bare-metal/dựng sẵn mà libc và Python ABI không thể được đảm bảo. Trên các máy chủ không được hỗ trợ đó, OCR tiếng Hàn và tiếng Ả Rập trả về lỗi không tương thích rõ ràng và không bao giờ âm thầm chuyển về Fast.

Các replica dùng chung cùng một `DATA_DIR` phải dùng cùng kiến trúc CPU; hãy cố định triển khai nhiều replica bằng node affinity. Các replica amd64/arm64 hỗn hợp cần volume dữ liệu riêng và các bản triển khai SnapOtter độc lập.

Runtime chính xác giữ một thế hệ đang hoạt động và xóa bộ đệm tải về sau khi kích hoạt. Với bản phát hành này, lần cài đầu tiên tạm thời cần khoảng 620-720 MiB cho archive cộng staging, và một lần nâng cấp có thể đạt đỉnh gần 1.2 GiB khi thế hệ cũ vẫn đang hoạt động. Trình cài đặt tính chính xác yêu cầu từ chỉ mục đã ký và các thế hệ hiện tại trước khi tải hoặc giải nén, và lỗi sớm nếu volume dữ liệu quá nhỏ.

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
| CPU | 6-8 nhân (chuẩn bị video + xử lý đồng thời chạy trên CPU ngay cả khi AI chạy trên GPU) |
| RAM | 8 GB |
| GPU | NVIDIA với 8+ GB VRAM (khuyến nghị 12 GB) |
| Đĩa | ~35 GB tổng cộng |

GPU NVIDIA (CUDA) tăng tốc đáng kể các model AI nặng. Đo trên RTX 4070 so với CPU hiện đại:

| Công cụ AI | Tăng tốc với GPU | Ghi chú |
|---|---|---|
| Upscale AI (RealESRGAN 2×) | **~47×** | Lợi ích lớn nhất: dưới một giây so với ~33 giây (vài phút với ảnh lớn) |
| Nâng cấp khuôn mặt (CodeFormer) | **~12×** | ~0.9 giây so với ~11 giây |
| Transcription (Whisper) | ~4.5× | |
| Xóa / thay / làm mờ nền | ~4× | ~7 giây trên GPU so với ~29 giây trên CPU |
| Colorize | ~1.8× | |
| OCR, nhận diện khuôn mặt, red-eye, noise-removal | ~1× | Đã nhanh trên CPU: GPU không giúp ích |
| Phục hồi ảnh | không | Bị giới hạn bởi CPU ngay cả trên GPU (0% mức dùng GPU); CPU nhanh quan trọng hơn GPU ở đây |

Các công cụ đáng dùng GPU là **upscale, nâng cấp khuôn mặt, transcription và xóa nền**. Nhận diện khuôn mặt, OCR và red-eye bị giới hạn bởi CPU và đã nhanh, nên GPU không bổ sung gì.

Mức dùng VRAM đỉnh đạt 7.5 GB khi upscale kèm nâng cấp khuôn mặt. GPU NVIDIA 6 GB chạy được hầu hết công cụ AI riêng lẻ nhưng sẽ lỗi khi upscale. 8-12 GB VRAM xử lý được mọi thứ.

Hiện tại không hỗ trợ tăng tốc suy luận AI bằng iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL. Việc ánh xạ `/dev/dri` vào container không bật tăng tốc GPU cho AI; SnapOtter sẽ chạy công cụ AI trên CPU trừ khi có NVIDIA CUDA.

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

Các yêu cầu resize ảnh song song tới container ứng dụng mặc định giới hạn 4 nhân:

| Yêu cầu đồng thời | Thời gian phản hồi trung bình | Lỗi |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Thời gian phản hồi tăng dưới tuyến tính và không có lỗi khi worker pool bão hòa. Tăng giới hạn `cpus:` của container ứng dụng (hoặc dùng máy chủ có nhiều nhân hơn) sẽ nâng trần này lên. Lưu ý rằng các job nặng (transcode video, AI trên CPU) giữ một worker trong suốt thời gian chạy, nên hãy xác định CPU theo số job nặng đồng thời mà bạn dự kiến, không chỉ theo số yêu cầu.

### Các định dạng ảnh được hỗ trợ {#supported-image-formats}

SnapOtter hỗ trợ **55+ định dạng đầu vào** và **14 định dạng đầu ra**, bao gồm tệp RAW từ hơn 20 hãng máy ảnh, các định dạng chuyên nghiệp (PSD, EPS, OpenEXR, HDR), các codec hiện đại (JPEG XL, AVIF, HEIC, QOI) và các định dạng khoa học/game (FITS, DDS).

Xem [danh sách định dạng đầy đủ](/vi/guide/supported-formats) để biết chi tiết về từng định dạng được hỗ trợ, bộ giải mã được dùng và các tùy chọn chất lượng khả dụng.

### Hạn chế đã biết {#known-limitations}

- **Content-aware resize** bị crash với ảnh lớn (>5 MP) do hạn chế của binary caire. Hoạt động tốt với ảnh nhỏ hơn.
- **Giải mã HEIF** mất 13-23 giây. HEIC (biến thể của Apple) nhanh hơn nhiều, 0.3-0.9 giây.
- **Upscale** bị timeout trên CPU với bất cứ thứ gì lớn hơn ảnh nhỏ. Cần GPU để dùng thực tế.
- Nâng cấp khuôn mặt bằng **CodeFormer** chậm hơn đáng kể so với GFPGAN (53 giây so với 2 giây trên GPU). GFPGAN được khuyến nghị cho hầu hết trường hợp.

## Volume {#volumes}

| Mount / Volume | Mục đích | Bắt buộc? |
|---|---|---|
| `/data` (app) | Model AI, Python venv, tệp người dùng | **Có** - mất tệp nếu thiếu |
| `/tmp/workspace` (app) | Tệp xử lý tạm thời (tự động dọn) | Khuyến nghị |
| `SnapOtter-pgdata` (postgres) | Thư mục dữ liệu PostgreSQL (người dùng, cài đặt, pipeline, job) | **Có** - mất dữ liệu nếu thiếu |
| `SnapOtter-redisdata` (redis) | Tệp append-only của Redis cho hàng đợi job bền vững | Khuyến nghị |

### Bind mount so với volume có tên {#bind-mounts-vs-named-volumes}

**Volume có tên** (khuyến nghị): Docker tự quản lý quyền truy cập:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount**: bạn tự quản lý quyền truy cập. Đặt `PUID`/`PGID` khớp với người dùng trên máy chủ của bạn:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Quyền lưu trữ {#storage-permissions}

SnapOtter ghi vào hai vị trí khi chạy: `/data` (tệp người dùng, log, model AI và Python venv) và `/tmp/workspace` (vùng nháp xử lý tạm thời). Cả hai phải ghi được bởi người dùng mà container chạy dưới danh nghĩa đó. Nếu một trong hai không ghi được, container **lỗi ngay khi khởi động** với thông báo nêu rõ thư mục, UID/GID đang chạy và cách khắc phục, thay vì khởi động ở trạng thái "healthy" rồi lỗi ở lần tải lên đầu tiên với một thông báo khó hiểu. Thư mục log (`LOG_DIR`, `/data/logs` trong image) được kiểm tra tương tự, ở mọi chế độ lưu trữ, vì log luôn nằm cục bộ ngay cả khi tệp nằm trên S3.

Cách xử lý quyền truy cập phụ thuộc vào cách container được khởi chạy:

**Mặc định (bắt đầu với quyền root, hạ xuống `snapotter`)**: entrypoint bắt đầu với quyền root, sửa quyền sở hữu của các volume đã mount, rồi hạ xuống người dùng `snapotter` không đặc quyền qua `gosu`. Volume có tên hoạt động mà không cần cấu hình. Với bind mount, hãy đặt `PUID`/`PGID` thành người dùng máy chủ của bạn (ở trên) để các tệp nó ghi thuộc về bạn.

**Kubernetes / OpenShift (không phải root qua `runAsUser`)**: được khởi chạy trực tiếp dưới người dùng không phải root, container không thể tự chown các volume, nên bộ điều phối phải làm cho chúng ghi được. Đặt `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Các thư mục ghi được của image thuộc nhóm GID 0 và nhóm có quyền ghi, nên một pod chạy với **UID tùy ý** cộng nhóm bổ sung root (mặc định của OpenShift) có thể ghi mà không cần `chown`.

**TrueNAS Scale (và các thiết lập "UID ngoại lai" khác)**: TrueNAS chạy ứng dụng dưới người dùng không phải root (thường là `568:568`) và mount các dataset của máy chủ thuộc về một người dùng khác, nên cả entrypoint lẫn `fsGroup` đều không tự làm cho chúng ghi được. Chọn một trong các cách:

- **Chạy ứng dụng với quyền root** (khuyến nghị): để trống người dùng của ứng dụng hoặc đặt thành `0`, và để entrypoint mặc định sửa quyền rồi hạ xuống `snapotter`.
- **Chạy với UID `999`**: đặt người dùng/nhóm của ứng dụng thành `999:999` (người dùng `snapotter` tích hợp sẵn của SnapOtter) để khớp với quyền sở hữu của image.
- **`chown` dataset của máy chủ** sang UID mà container chạy dưới danh nghĩa đó, từ shell của TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Lỗi khi khởi động nêu rõ UID chính xác cần dùng, nên cách nhanh nhất là khởi động ứng dụng một lần, đọc thông báo, rồi `chown` (hoặc điều chỉnh người dùng) cho phù hợp.

## Biến môi trường {#environment-variables}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `true` | Bật/tắt yêu cầu đăng nhập |
| `DEFAULT_USERNAME` | `admin` | Tên người dùng quản trị ban đầu |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu quản trị ban đầu (buộc đổi ở lần đăng nhập đầu tiên) |
| `MAX_UPLOAD_SIZE_MB` | `0` (không giới hạn) | Giới hạn tải lên theo tệp, tính bằng MB. Image đi kèm `0`; bản build từ mã nguồn bắt đầu ở 100 |
| `MAX_BATCH_SIZE` | `0` (không giới hạn) | Số tệp tối đa cho mỗi yêu cầu theo lô. Image đi kèm `0`; bản build từ mã nguồn bắt đầu ở 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Yêu cầu API mỗi phút trên mỗi IP (đặt 0 để tắt) |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng tối đa |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Những peer nào được phép đặt IP của client qua `X-Forwarded-For`. Mặc định chỉ mạng riêng |
| `PUID` | `999` | Chạy với UID này (cho quyền bind mount) |
| `PGID` | `999` | Chạy với GID này (cho quyền bind mount) |
| `LOG_LEVEL` | `info` | Mức độ chi tiết của log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (tự động) | Số job xử lý AI song song tối đa |
| `SESSION_DURATION_HOURS` | `168` | Thời hạn phiên đăng nhập (7 ngày) |
| `CORS_ORIGIN` | (trống) | Các origin được phép, phân tách bằng dấu phẩy, hoặc để trống cho cùng origin |

### Proxy đi ra và CA riêng {#outbound-proxy-and-private-ca}

Container chính thức bật hỗ trợ proxy qua biến môi trường của Node. Nếu SnapOtter phải truy cập kho runtime OCR hoặc các dịch vụ HTTPS khác qua proxy doanh nghiệp, hãy đặt `HTTPS_PROXY` (và `HTTP_PROXY` khi cần). Đặt `NO_PROXY` thành danh sách các host phân tách bằng dấu phẩy cần được truy cập trực tiếp, chẳng hạn Postgres, Redis và lưu trữ đối tượng nội bộ.

Nếu proxy hoặc một dịch vụ nội bộ được ký bởi tổ chức phát hành chứng chỉ riêng, hãy mount chứng chỉ CA ở chế độ chỉ đọc và trỏ `NODE_EXTRA_CA_CERTS` tới nó. Tệp phải tồn tại khi tiến trình Node khởi động:

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

Giữ thông tin xác thực proxy bên ngoài tệp Compose (ví dụ trong một tệp `.env` được bảo vệ hoặc secret). Không tắt xác minh TLS: chỉ mục OCR đã ký xác thực metadata bản phát hành, trong khi việc xác thực TLS thông thường vẫn bảo vệ đường truyền và mọi yêu cầu đi ra khác.

## Health Check {#health-check}

Container có sẵn health check tích hợp:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` mặc định là `loopback,linklocal,uniquelocal`, nên SnapOtter chỉ tin `X-Forwarded-For` từ một peer trong mạng riêng. Reverse proxy trên cùng máy chủ, trên một mạng Docker hoặc trong LAN của bạn được tin cậy ngay từ đầu, nghĩa là giới hạn tốc độ, bộ giới hạn brute-force đăng nhập, nhật ký kiểm toán và danh sách cho phép IP của bản enterprise đều thấy IP thật của client mà không cần cấu hình.

Chỉ đặt `TRUST_PROXY=true` khi proxy phía trước truy cập SnapOtter từ một địa chỉ **công khai**, chẳng hạn một cân bằng tải đám mây ở mạng khác. Trên một instance bị lộ trực tiếp, giá trị đó khiến `request.ip` do kẻ tấn công kiểm soát, vì người gọi xoay vòng header sẽ nhận một bucket giới hạn tốc độ mới cho mỗi yêu cầu.

Có hai điều cần biết trước khi bạn đo IP của client. Docker Desktop trên macOS và Windows phục vụ cổng đã publish qua một proxy userland ghi đè mọi địa chỉ nguồn thành gateway của VM `192.168.65.1`, nên không giá trị `TRUST_PROXY` nào khôi phục được client thật ở đó; hãy triển khai trên Linux cho bất cứ thứ gì hướng ra internet. Và trên mọi nền tảng, truy cập một cổng đã publish qua `localhost` được ghi nhận là gateway của bridge chứ không phải client của bạn, nên một bài kiểm tra localhost không cho bạn biết gì về cách một client thật được gán nguồn. Bảng đầy đủ các giá trị `TRUST_PROXY` và lưu ý về Docker Desktop nằm trong [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Có hai điều quan trọng với mọi proxy bên dưới: cho phép thân yêu cầu lớn (tải lên), và không đệm phản hồi. Proxy đệm phản hồi làm hỏng tiến trình SSE và, dễ thấy hơn, khiến việc tải xuống tệp lớn "bắt đầu nhưng không bao giờ xong", vì proxy giữ toàn bộ tệp trước khi chuyển tiếp. SnapOtter gửi `X-Accel-Buffering: no` khi tải xuống để nginx truyền luồng dù việc đệm vẫn bật ở nơi khác, nhưng các proxy khác ngoài nginx cần tắt việc đệm phản hồi một cách tường minh (được thể hiện trong từng cấu hình bên dưới). Nếu một lượt tải xuống bị đứng giữa chừng, proxy đệm phía trước là thứ đầu tiên cần kiểm tra.

Một lưu ý về HSTS: bản thân API gửi `Strict-Transport-Security` trên mọi phản hồi, nên proxy chuyển tiếp header phản hồi (mọi cấu hình bên dưới đều vậy) không cần thiết lập HSTS riêng. Chỉ khi proxy của bạn được cấu hình để loại bỏ hoặc ghi đè header phản hồi từ upstream thì bạn mới cần giữ nguyên header hoặc thêm lại nó ở edge.

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

Để phục vụ `https://example.com/snapotter`, hãy đặt `BASE_PATH=/snapotter` trong
môi trường container SnapOtter và khởi động lại nó. Các tệp Compose CPU và GPU
chính thức cũng nhận `BASE_PATH` từ shell của bạn hoặc tệp `.env` của Compose. Cùng một
image hoạt động ở mọi đường dẫn; không cần build lại frontend.

`BASE_PATH` chấp nhận các đoạn phân tách bằng dấu gạch chéo chứa chữ cái, chữ số, `_` hoặc
`-`, bao gồm các đường dẫn lồng nhau như `/apps/snapotter`. Dấu gạch chéo ở cuối là
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

Các script API tiếp tục hoạt động không đổi: các URL trong phản hồi API, chẳng hạn
`downloadUrl` của một công cụ, bắt đầu bằng `/api/` bất kể `BASE_PATH` là gì. Hãy nối chúng vào
URL gốc của instance (`https://example.com/snapotter` + `/api/v1/download/...`)
thay vì phân giải chúng theo gốc của tên miền.

Mở giao diện qua URL có tiền tố (`https://example.com/snapotter`). Một
trình duyệt đến mà không có tiền tố sẽ tự động được chuyển hướng tới đó; chỉ các yêu cầu
API mới được kỳ vọng đến ứng dụng không có tiền tố. Nếu log báo
`Requests arrive under /snapotter/ but BASE_PATH is empty`, proxy của bạn đang
chuyển tiếp một tiền tố mà `BASE_PATH` không khai báo: hãy đặt `BASE_PATH` thành tiền tố đó,
hoặc loại bỏ tiền tố tại proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Thêm một Proxy Host mới
2. Đặt Domain Name thành tên miền của bạn
3. Đặt Scheme thành `http`, Forward Hostname thành `SnapOtter` (hoặc IP container của bạn), Forward Port thành `1349`
4. Bật hỗ trợ WebSocket
5. Trong Advanced, thêm: `client_max_body_size 500M;` và `proxy_buffering off;`

Header `Strict-Transport-Security` của API đi qua NPM nguyên vẹn; công tắc HSTS trên tab SSL là tùy chọn bổ sung.

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

Traefik chuyển tiếp header phản hồi từ upstream không đổi, nên header `Strict-Transport-Security` của API đến được trình duyệt mà không cần middleware `headers`. Nếu bạn đã chạy một middleware ghi lại header phản hồi, hãy đảm bảo nó giữ nguyên header đó.

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

`flush_interval -1` tắt việc đệm phản hồi, điều này cần thiết để các sự kiện tiến trình SSE (xử lý theo lô, công cụ AI, cài đặt tính năng) và tải xuống tệp lớn được truyền luồng thay vì bị đứng. Các timeout kéo dài cho phép tải lên tệp lớn hoàn tất mà Caddy không đóng kết nối sớm. Caddy cũng chuyển header `Strict-Transport-Security` của API đi qua nguyên vẹn, nên không cần chỉ thị `header` nào cho HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Lưu ý: Cloudflare có giới hạn tải lên 100 MB ở gói miễn phí. Hãy đặt `MAX_UPLOAD_SIZE_MB=100` cho khớp.

Tunnel chuyển tiếp các header phản hồi của API, bao gồm `Strict-Transport-Security`, nên không cần cấu hình HSTS trên dashboard (cài đặt HSTS ở edge của chính Cloudflare là tùy chọn bổ sung).

## Khắc phục sự cố {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" ngay sau lần khởi động đầu tiên bị lỗi {#eai-again-after-failed-first-start}

Nếu `docker compose up -d` đầu tiên lỗi giữa chừng (nguyên nhân thường gặp là cổng đã bị chiếm), một lần thử lại `up -d` thông thường có thể khởi động container ứng dụng mà không gắn nó vào mạng compose. Khi đó ứng dụng crash-loop với:

```
Postgres not reachable: EAI_AGAIN
```

trong khi `docker ps` cho thấy postgres khỏe mạnh. Lỗi là thật nhưng chỉ sai container: khi không có mạng, DNS cho hostname `postgres` hoàn toàn không phân giải được, và chính sách khởi động lại lặp lại cùng một lỗi mãi mãi.

Hãy khắc phục nguyên nhân làm hỏng lần khởi động đầu (thường là: giải phóng cổng), rồi buộc container ứng dụng được tạo lại để nó gắn lại vào mạng:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: truy cập được từ thiết bị khác, nhưng không từ chính PC {#windows-wsl2-loopback}

Khi Docker chạy bên trong WSL2 (thiết lập Windows thông thường), stack có thể truy cập được từ mọi máy khác trong mạng của bạn trong khi `http://localhost:1349` bị timeout trên chính máy chủ Windows, ngay cả khi đã bật chế độ mạng mirrored của WSL. Cổng không bao giờ xuất hiện trong `netstat` của Windows, và các container không có gì sai.

Hãy mở ứng dụng từ thiết bị khác, hoặc từ bên trong distro bằng địa chỉ riêng của nó (`hostname -I` trong shell WSL). Nếu việc chuyển tiếp localhost tình cờ hoạt động trên phiên bản WSL của bạn, hãy coi đó là một lợi ích thêm chứ đừng phụ thuộc vào nó.

## CI/CD {#ci-cd}

Kho GitHub có ba workflow:

- **ci.yml** - Chạy tự động ở mỗi lần push và PR. Lint, typecheck, kiểm thử, build và xác thực image Docker (không push).
- **release.yml** - Được kích hoạt thủ công qua `workflow_dispatch`. Chạy semantic-release để tạo tag phiên bản và GitHub release, sau đó build image Docker đa kiến trúc (amd64 + arm64) và push lên Docker Hub (`snapotter/snapotter`) và GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Build trang tài liệu này và triển khai lên Cloudflare Pages khi push lên `main`.

Để tạo một bản phát hành, vào **Actions > Release > Run workflow** trong giao diện GitHub, hoặc chạy:

```bash
gh workflow run release.yml
```

Semantic-release xác định phiên bản từ lịch sử commit. Tag Docker `latest` luôn trỏ tới bản phát hành gần nhất.

## Phân tích {#analytics}

SnapOtter có phân tích sử dụng sản phẩm ẩn danh (mẫu sử dụng công cụ, báo cáo lỗi) để giúp bắt lỗi và cải thiện tính năng. Tính năng này bật theo mặc định. Tệp, tên tệp và dữ liệu cá nhân của bạn không bao giờ là một phần của nó. SnapOtter hoạt động bình thường khi phân tích bị tắt.

### Tắt phân tích {#disabling-analytics}

Việc chọn không tham gia khi runtime là một công tắc quản trị một cú nhấp. Mở Settings > System > Privacy và tắt Anonymous Product Analytics. Nó dừng ngay lập tức cho toàn bộ instance, không cần build lại.

Với một image không bao giờ có thể phát phân tích, hãy đặt tắt cứng lúc build bằng cách clone kho mã và build lại:

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

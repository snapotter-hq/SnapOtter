---
description: "Triển khai SnapOtter lên môi trường production với Docker. Yêu cầu phần cứng, cài đặt GPU, và cấu hình reverse proxy cho Nginx, Traefik, và Cloudflare."
i18n_source_hash: 2a722f86da75
i18n_provenance: human
i18n_output_hash: 661a8ffded8e
i18n_hash_version: 2
---

# Triển khai {#deployment}

SnapOtter triển khai dưới dạng một stack Docker Compose gồm 3 container: image ứng dụng SnapOtter, PostgreSQL 17, và Redis 8. Image ứng dụng hỗ trợ **linux/amd64** (với NVIDIA CUDA để tăng tốc AI) và **linux/arm64** (CPU), nên nó chạy native trên các máy chủ Intel/AMD, máy Mac Apple Silicon, và các thiết bị ARM như Raspberry Pi 4/5. Việc tăng tốc iGPU của Intel/AMD thông qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI.

Xem [Docker Image](./docker-tags) để biết cách cài đặt GPU, các ví dụ Docker Compose, và cách ghim phiên bản.


<!-- korean-ocr-contract:start -->
::: info Khả năng tương thích OCR tiếng Hàn
OCR Nhanh hỗ trợ `auto`, `en`, `de`, `es`, `fr`, `zh` và `ja`, nhưng không hỗ trợ tiếng Hàn (`ko`). Tiếng Hàn cần gói OCR Chính xác và `balanced` hoặc `best`. Gói chạy trên container Linux amd64 và arm64 chính thức, kể cả máy chủ NVIDIA nơi OCR vẫn chạy bằng CPU. Hệ thống không được hỗ trợ sẽ trả về lỗi tương thích rõ ràng và không âm thầm chuyển về `fast`. Tiếng Hàn với `fast` hoặc bí danh cũ `tesseract` bị từ chối trước khi xếp hàng với `FEATURE_INCOMPATIBLE` và `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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

Sau đó ứng dụng sẽ có sẵn tại `http://localhost:1349`.

> **Bị giới hạn tần suất từ Docker Hub?** Thay `snapotter/snapotter:latest` bằng `ghcr.io/snapotter-hq/snapotter:latest` để kéo từ GitHub Container Registry. Cả hai registry đều nhận cùng một image trong mỗi bản phát hành.

## Bắt đầu nhanh (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Để tăng tốc NVIDIA CUDA trên các công cụ AI được hỗ trợ (xóa nền, nâng cấp, nâng cao khuôn mặt):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Thay đổi điều này cho việc triển khai không cục bộ
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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

### Xác minh khả năng tăng tốc GPU {#verify-gpu-acceleration}

Kiểm tra phát hiện CUDA trong nhật ký:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Nếu các công cụ AI chạy trên CPU ngay cả khi `--gpus all` và Bộ công cụ bộ chứa NVIDIA được thiết lập chính xác, hãy cài đặt lại gói bị ảnh hưởng (ví dụ: Xóa nền) từ **Cài đặt → Tính năng AI**. Trình cài đặt khôi phục bản dựng GPU của ONNX Runtime, bản dựng chỉ dành cho CPU được kéo vào bởi một gói khác (chẳng hạn như phiên mã) có thể bị che khuất trong môi trường AI được chia sẻ. Nếu việc cài đặt lại từ giao diện người dùng không khôi phục GPU trên hình ảnh cũ hơn, hãy xem cách sửa chữa thủ công trong [vấn đề #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Yêu cầu phần cứng {#hardware-requirements}

Các con số này đến từ các phép đo hiệu năng trên nhiều hệ thống khác nhau, từ một máy trạm amd64 hiện đại với NVIDIA RTX 4070 xuống đến một Raspberry Pi, chạy toàn bộ danh mục công cụ trên mỗi máy và quét qua các giới hạn tài nguyên Docker để tìm ngưỡng thực tế.

Chạy ở mức thấp nhất của các cấp này (một chiếc Pi, laptop cũ, VPS 2 GB)? [Thiết lập trên phần cứng hạn chế](/vi/guide/low-resource) biến những con số này thành hướng dẫn từng bước cụ thể với các giới hạn đã tinh chỉnh.

### Tham chiếu nhanh {#quick-reference}

| Cấp | Trường hợp sử dụng | CPU | RAM | GPU | Lưu trữ |
|------|----------|-----|-----|-----|---------|
| Tối thiểu | Công cụ hình ảnh, tập tin, và PDF nhẹ; một người dùng; lô nhỏ | 2 nhân | 2 GB | Không | ~7 GB |
| Khuyến nghị | Cả năm phương thức gồm video, PDF, và AI trên CPU; xử lý lô; một vài người dùng | 4 nhân | 4 GB | Không | ~25 GB |
| Đầy đủ | Mọi thứ với tốc độ cao gồm AI trên GPU; lô lớn; nhiều người dùng | 6-8 nhân | 8 GB | NVIDIA 8 GB+ VRAM (12 GB thoải mái) | ~35 GB |

**Kiến trúc: chỉ 64-bit** (`linux/amd64` hoặc `linux/arm64`). SnapOtter chạy native trên các máy chủ Intel/AMD, máy Mac Apple Silicon, và các bo mạch ARM 64-bit bao gồm **Raspberry Pi 4 và 5** (4-8 GB). Nó **không** chạy trên ARM 32-bit (`armv7`/`armhf`), không có image nào được xây dựng cho nó, và cũng không chạy trên các bo mạch loại 512 MB như Pi Zero, vốn nằm dưới ngưỡng bộ nhớ (xem bên dưới).

### Tối thiểu (công cụ hình ảnh, tập tin, và PDF nhẹ; không có AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 2 nhân |
| RAM | 2 GB |
| Ổ đĩa | ~5.5 GB (image) + volume dữ liệu |
| GPU | Không bắt buộc |

Tất cả 222 công cụ không dùng AI trong danh mục, hình ảnh (thay đổi kích thước, cắt, chuyển đổi, nén, điều chỉnh, đóng dấu), video (cắt, tắt tiếng, remux), âm thanh (chuyển đổi, chuẩn hóa, cắt), PDF (gộp, tách, nén, xoay, bảo vệ), chuyển đổi tập tin, và các preset chuyển đổi chuyên dụng, đều chạy trên phần cứng khiêm tốn. Hầu hết các thao tác hoàn thành trong chưa đầy một giây ngay cả với tập tin lớn: một hình ảnh 2.7 MB được thay đổi kích thước trong ~0.05 giây và mã hóa lại sang WebP trong ~2 giây.

Ngưỡng bộ nhớ là có thật, từ một lượt quét giới hạn tài nguyên Docker: **512 MB không thể khởi động stack** (ngay cả một lần thay đổi kích thước hình ảnh cũng bị dừng), **1 GB** xử lý được các thao tác một tập tin nhưng một lô nhiều tập tin sẽ hết bộ nhớ, và **2 GB / 2 nhân** là cấu hình nhỏ nhất xử lý các lô một cách thoải mái.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Ngoại lệ nặng về CPU duy nhất là việc mã hóa lại video.** Các thao tác sao chép luồng (cắt, tắt tiếng, remux container) diễn ra tức thời, nhưng chuyển mã sang một codec khác thì phụ thuộc vào CPU. Một clip 1080p / 45 giây được mã hóa lại sang VP9 (WebM) mất khoảng **~40 giây** trên một CPU hiện đại nhanh, ~45 giây trên Apple Silicon, ~80 giây trên một CPU di động 4 nhân cũ hơn, và **~130 giây** trên một máy chủ 4 nhân cũ hơn. Nếu khối lượng công việc của bạn thiên về video, hãy ưu tiên số nhân CPU và tốc độ xung nhịp, hoặc nâng giới hạn `cpus:` của container, bản compose đi kèm mặc định giới hạn ứng dụng ở 4 nhân (8 nhân trên bản compose có GPU).

### Khuyến nghị (công cụ AI trên CPU) {#recommended-ai-tools-on-cpu}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 4 nhân |
| RAM | 4 GB |
| Disk | 3 GB (hình ảnh) + khoảng 20 GB (tất cả các gói AI tùy chọn) + không gian làm việc |
| GPU | Không bắt buộc (dự phòng CPU) |

**Cài đặt và chạy các gói AI lớn hơn là điều đẩy khuyến nghị lên 4 GB RAM.** Khi không cài đặt gói tùy chọn nào, ứng dụng sẽ không hoạt động khoảng 360 MB. Các công cụ Python cũ dùng chung sidecar, trong khi OCR chính xác sử dụng dispatcher chuyên dụng có thời gian tồn tại lâu dài được ghim vào thế hệ bất biến đang hoạt động. Trước khi kích hoạt, trình cài đặt chạy smoke test trên ứng viên. Sau đó, nó tự động chuyển sang dispatcher mới và tiêu hao dispatcher trước đó trước garbage collection. Mọi tạo phẩm OCR chính xác chính thức phải chuyển release suite trong trường hợp xấu nhất của nó bên trong 4 GiB cgroup, trong khi đề xuất máy chủ 4 GB để lại khoảng trống cho ứng dụng Node.js, Postgres, Redis, hàng đợi và công việc đồng thời.

Hầu hết các công cụ AI hoàn toàn dùng được trên CPU; một vài công cụ thực sự cần GPU. Được đo trên một CPU 4 nhân hiện đại:

| Công cụ AI | Thời gian CPU | Dùng được trên CPU? |
|---|---|---|
| Phát hiện khuôn mặt (làm mờ khuôn mặt, cắt thông minh, mắt đỏ), khử nhiễu | dưới 1 giây | Có |
| OCR, phiên âm, phụ đề | 1-3 giây | Có |
| Tô màu, cải thiện khuôn mặt | ~10 giây | Có |
| Xóa / thay thế / làm mờ nền | ~29 giây | Có (bạn sẽ phải chờ) |
| Nâng cấp độ phân giải AI (RealESRGAN) | ~33 giây với ảnh nhỏ; vài phút với ảnh lớn | Ở mức tối thiểu, rất khuyến nghị dùng GPU |
| Phục hồi ảnh (toàn bộ pipeline) | vài phút | Không, cần GPU hoặc một CPU nhiều nhân nhanh |

SnapOtter cố ý không nhúng sẵn các bản tải mô hình này vào image Docker. Các bundle AI chỉ được kéo về khi một quản trị viên bật công cụ liên quan, được lưu trong volume `/data/ai` bền vững, và được chia sẻ bởi mọi công cụ phụ thuộc vào cùng một ngăn xếp mô hình. Điều này giữ cho image container cuối cùng nhỏ gọn trong khi vẫn cho phép một bản cài đặt AI đầy đủ đạt tới các con số lưu trữ lớn hơn bên dưới.

Một số công cụ phụ thuộc vào nhiều hơn một bundle được chia sẻ. Ví dụ, Ảnh Hộ chiếu cần cả `background-removal` và `face-detection`; nếu `background-removal` đã được cài đặt, việc bật Ảnh Hộ chiếu chỉ tải về bundle `face-detection` còn thiếu. Việc tái sử dụng tương tự áp dụng cho tất cả các công cụ AI.

Ước tính dung lượng gói AI tùy chọn:

| Bundle | Dung lượng ổ đĩa |
|---|---|
| Xóa nền | 4-5 GB |
| Nâng cấp độ phân giải + Cải thiện khuôn mặt + Khử nhiễu | 5-6 GB |
| Phát hiện khuôn mặt | 200-300 MB |
| Tẩy đối tượng + Tô màu | 1-2 GB |
| OCR chính xác (`balanced`/`best`) | ~208-234 Tải xuống MiB / ~409-488 MiB đã cài đặt |
| Phục hồi ảnh | 4-5 GB |
| Phiên âm | ~600 MB |
| **Tất cả các gói** | **Đã cài đặt ~20 GB** |

OCR nhanh được tích hợp vào hình ảnh thông qua Tesseract, bổ sung khoảng 25 MiB và không yêu cầu gói OCR tùy chọn hoặc yêu cầu bộ nhớ 4 GiB của nó. Gói chính xác có sẵn trong chính thức Linux  amd64 Và arm64 container và chạy ONNX Runtime TRÊN CPU. Các máy chủ NVIDIA sử dụng cùng thời gian chạy CPU OCR, vì vậy OCR không phụ thuộc vào phiên bản CUDA hoặc kiến ​​trúc GPU. Thời gian chạy chính xác yêu cầu ít nhất 4 GiB bộ nhớ hiệu dụng: giới hạn cgroup của vùng chứa được định cấu hình, nếu không thì bộ nhớ máy chủ. SnapOtter từ chối các hệ thống dưới mức tương thích tối thiểu đã được ký trước khi tải xuống gói. Việc cài đặt gói chính xác cũng bị từ chối trên bare-metal/các kho lưu trữ dựng sẵn mà libc và Python ABI không được đảm bảo.

Các bản sao dùng chung `DATA_DIR` phải sử dụng cùng một kiến trúc CPU; hãy ghim các triển khai nhiều bản sao vào các nút tương thích bằng node affinity. Các bản sao hỗn hợp amd64/arm64 cần có các volume dữ liệu riêng biệt và các bản triển khai SnapOtter độc lập.

Thời gian chạy chính xác giúp duy trì một thế hệ hoạt động và xóa bộ đệm tải xuống sau khi kích hoạt. Đối với bản phát hành này, lần cài đặt đầu tiên tạm thời cần khoảng 620-720 MiB cho kho lưu trữ cộng với dàn dựng và bản nâng cấp có thể đạt đỉnh gần 1,2 GiB trong khi thế hệ cũ vẫn hoạt động. Trình cài đặt tính toán yêu cầu chính xác từ chỉ mục đã ký và các thế hệ hiện tại trước khi tải xuống hoặc giải nén và sẽ sớm bị lỗi nếu khối lượng dữ liệu quá nhỏ.

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
| CPU | 6-8 nhân (chuẩn bị video + đồng thời chạy trên CPU ngay cả với AI trên GPU) |
| RAM | 8 GB |
| GPU | NVIDIA với 8+ GB VRAM (khuyến nghị 12 GB) |
| Ổ đĩa | tổng ~35 GB |

Một GPU NVIDIA (CUDA) tăng tốc đáng kể các mô hình AI nặng. Được đo trên RTX 4070 so với một CPU hiện đại:

| Công cụ AI | Tăng tốc với GPU | Ghi chú |
|---|---|---|
| Nâng cấp độ phân giải AI (RealESRGAN 2×) | **~47×** | Lợi ích lớn nhất, dưới một giây so với ~33 giây (vài phút với ảnh lớn) |
| Cải thiện khuôn mặt (CodeFormer) | **~12×** | ~0.9 giây so với ~11 giây |
| Phiên âm (Whisper) | ~4.5× | |
| Xóa / thay thế / làm mờ nền | ~4× | ~7 giây trên GPU so với ~29 giây trên CPU |
| Tô màu | ~1.8× | |
| OCR, phát hiện khuôn mặt, mắt đỏ, khử nhiễu | ~1× | Đã nhanh trên CPU, GPU không giúp ích |
| Phục hồi ảnh | không | Phụ thuộc CPU ngay cả trên GPU (0% mức sử dụng GPU); một CPU nhanh quan trọng hơn GPU ở đây |

Các công cụ đáng dùng GPU là **nâng cấp độ phân giải, cải thiện khuôn mặt, phiên âm, và xóa nền**. Phát hiện khuôn mặt, OCR, và mắt đỏ phụ thuộc CPU và đã nhanh, nên GPU không thêm gì.

Mức sử dụng VRAM đỉnh đạt 7.5 GB trong quá trình nâng cấp độ phân giải kèm cải thiện khuôn mặt. Một GPU NVIDIA 6 GB dùng được cho hầu hết các công cụ AI riêng lẻ nhưng sẽ thất bại khi nâng cấp độ phân giải. VRAM 8-12 GB xử lý được mọi thứ.

Việc tăng tốc iGPU của Intel/AMD thông qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI. Ánh xạ `/dev/dri` vào container không kích hoạt tăng tốc AI trên GPU; SnapOtter sẽ chạy các công cụ AI trên CPU trừ khi có sẵn NVIDIA CUDA.

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

Các yêu cầu thay đổi kích thước hình ảnh song song đối với container ứng dụng bị giới hạn 4 nhân mặc định:

| Yêu cầu đồng thời | Thời gian phản hồi trung bình | Lỗi |
|---|---|---|
| 1 | 0.4 giây | 0 |
| 5 | 1.2 giây | 0 |
| 10 | 2.1 giây | 0 |

Thời gian phản hồi suy giảm dưới tuyến tính mà không có lỗi khi nhóm worker bão hòa. Nâng giới hạn `cpus:` của container ứng dụng (hoặc dùng một host có nhiều nhân hơn) nâng trần lên. Lưu ý rằng các tác vụ nặng (chuyển mã video, AI trên CPU) giữ một worker suốt toàn bộ thời lượng, nên hãy cân đối CPU theo số lượng tác vụ nặng đồng thời dự kiến, không chỉ theo số lượng yêu cầu.

### Định dạng hình ảnh được hỗ trợ {#supported-image-formats}

SnapOtter hỗ trợ **55+ định dạng đầu vào** và **14 định dạng đầu ra**, bao gồm các tập tin RAW từ hơn 20 thương hiệu máy ảnh, các định dạng chuyên nghiệp (PSD, EPS, OpenEXR, HDR), các codec hiện đại (JPEG XL, AVIF, HEIC, QOI), và các định dạng khoa học/game (FITS, DDS).

Xem [danh sách định dạng đầy đủ](/vi/guide/supported-formats) để biết chi tiết về mọi định dạng được hỗ trợ, bộ giải mã được dùng, và các tùy chọn kiểm soát chất lượng có sẵn.

### Hạn chế đã biết {#known-limitations}

- **Thay đổi kích thước nhận biết nội dung** bị lỗi trên các ảnh lớn (>5 MP) do một hạn chế trong binary caire. Hoạt động tốt với ảnh nhỏ hơn.
- **Giải mã HEIF** mất 13-23 giây. HEIC (biến thể của Apple) nhanh hơn nhiều ở mức 0.3-0.9 giây.
- **Nâng cấp độ phân giải** hết thời gian chờ trên CPU với bất cứ thứ gì vượt quá ảnh nhỏ. Cần GPU để dùng thực tế.
- **Cải thiện khuôn mặt CodeFormer** chậm hơn đáng kể so với GFPGAN (53 giây so với 2 giây trên GPU). GFPGAN được khuyến nghị cho hầu hết các trường hợp sử dụng.

## Volume {#volumes}

| Mount / Volume | Mục đích | Bắt buộc? |
|---|---|---|
| `/data` (app) | Mô hình AI, venv Python, tập tin người dùng | **Có**, mất tập tin nếu thiếu |
| `/tmp/workspace` (app) | Tập tin xử lý tạm thời (tự động dọn dẹp) | Khuyến nghị |
| `SnapOtter-pgdata` (postgres) | Thư mục dữ liệu PostgreSQL (người dùng, cài đặt, pipeline, tác vụ) | **Có**, mất dữ liệu nếu thiếu |
| `SnapOtter-redisdata` (redis) | Tập tin append-only của Redis cho hàng đợi tác vụ bền vững | Khuyến nghị |

### Bind mount so với named volume {#bind-mounts-vs-named-volumes}

**Named volume** (khuyến nghị), Docker tự động quản lý quyền:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount**, bạn quản lý quyền. Đặt `PUID`/`PGID` khớp với người dùng host của bạn:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Quyền lưu trữ {#storage-permissions}

SnapOtter ghi vào hai vị trí khi chạy: `/data` (tập tin người dùng, log, mô hình AI và venv Python) và `/tmp/workspace` (không gian tạm cho xử lý). Cả hai đều phải cho phép ghi bởi người dùng mà container chạy dưới danh nghĩa. Nếu một trong hai không cho phép, container **thất bại sớm khi khởi động** với một thông báo nêu tên thư mục, UID/GID đang chạy, và cách khắc phục, thay vì khởi động ở trạng thái "healthy" rồi thất bại ở lần tải lên đầu tiên với một lỗi khó hiểu.

Cách quyền được xử lý phụ thuộc vào cách container được khởi chạy:

**Mặc định (khởi động dưới danh nghĩa root, hạ xuống `snapotter`)**, entrypoint khởi động dưới danh nghĩa root, sửa quyền sở hữu của các volume đã mount, rồi hạ xuống người dùng không đặc quyền `snapotter` thông qua `gosu`. Named volume hoạt động mà không cần cấu hình. Với bind mount, đặt `PUID`/`PGID` thành người dùng host của bạn (ở trên) để các tập tin nó ghi thuộc sở hữu của bạn.

**Kubernetes / OpenShift (không phải root thông qua `runAsUser`)**, được khởi chạy trực tiếp dưới danh nghĩa người dùng không phải root, container không thể tự chown các volume, nên orchestrator phải làm cho chúng có thể ghi được. Đặt `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Các thư mục có thể ghi của image thuộc quyền sở hữu nhóm GID 0 và cho phép nhóm ghi, nên một pod chạy với một **UID tùy ý** cộng với nhóm bổ sung root (mặc định của OpenShift) có thể ghi mà không cần `chown`.

**TrueNAS Scale (và các thiết lập "UID lạ" khác)**, TrueNAS chạy các ứng dụng dưới danh nghĩa một người dùng không phải root (thường là `568:568`) và mount các dataset host thuộc sở hữu của một người dùng khác, nên cả entrypoint lẫn `fsGroup` đều không tự làm cho chúng có thể ghi được. Hãy chọn một trong các cách:

- **Chạy ứng dụng dưới danh nghĩa root** (khuyến nghị), để trống người dùng của ứng dụng hoặc đặt thành `0`, và để entrypoint mặc định sửa quyền và hạ xuống `snapotter`.
- **Chạy dưới danh nghĩa UID `999`**, đặt người dùng/nhóm của ứng dụng thành `999:999` (người dùng `snapotter` tích hợp sẵn của SnapOtter) để nó khớp với quyền sở hữu của image.
- **`chown` dataset host** thành UID mà container chạy dưới danh nghĩa đó, từ shell TrueNAS:

  ```bash
  # Dùng UID từ lỗi khi khởi động (hoặc chạy `id` bên trong container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Lỗi khi khởi động nêu tên chính xác UID cần dùng, nên con đường nhanh nhất là khởi động ứng dụng một lần, đọc thông báo, rồi `chown` (hoặc điều chỉnh người dùng) cho phù hợp.

## Biến môi trường {#environment-variables}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `true` | Bật/tắt yêu cầu đăng nhập |
| `DEFAULT_USERNAME` | `admin` | Tên người dùng quản trị ban đầu |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu quản trị ban đầu (buộc đổi ở lần đăng nhập đầu tiên) |
| `MAX_UPLOAD_SIZE_MB` | `0` (không giới hạn) | Giới hạn tải lên trên mỗi tập tin tính bằng MB. Image xuất xưởng với `0`; bản dựng từ mã nguồn bắt đầu ở 100 |
| `MAX_BATCH_SIZE` | `0` (không giới hạn) | Số tập tin tối đa mỗi yêu cầu lô. Image xuất xưởng với `0`; bản dựng từ mã nguồn bắt đầu ở 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Số yêu cầu API mỗi phút trên mỗi IP (đặt 0 để tắt) |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng tối đa |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Những peer nào được phép đặt IP của client qua `X-Forwarded-For`. Mặc định chỉ các mạng riêng |
| `PUID` | `999` | Chạy dưới danh nghĩa UID này (cho quyền bind mount) |
| `PGID` | `999` | Chạy dưới danh nghĩa GID này (cho quyền bind mount) |
| `LOG_LEVEL` | `info` | Mức độ chi tiết của log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (tự động) | Số tác vụ xử lý AI song song tối đa |
| `SESSION_DURATION_HOURS` | `168` | Thời gian sống của phiên đăng nhập (7 ngày) |
| `CORS_ORIGIN` | (rỗng) | Danh sách origin được phép, phân tách bằng dấu phẩy, hoặc để rỗng cho same-origin |

### Proxy gửi đi và CA riêng tư {#outbound-proxy-and-private-ca}

Vùng chứa chính thức cho phép hỗ trợ proxy môi trường của Node. Nếu SnapOtter phải truy cập kho lưu trữ thời gian chạy OCR hoặc các dịch vụ HTTPS khác thông qua proxy công ty, hãy đặt `HTTPS_PROXY` (và `HTTP_PROXY` khi cần). Đặt `NO_PROXY` thành danh sách máy chủ được phân tách bằng dấu phẩy phải truy cập trực tiếp, chẳng hạn như Postgres, Redis và bộ lưu trữ đối tượng nội bộ.

Nếu proxy hoặc dịch vụ nội bộ được cơ quan cấp chứng chỉ riêng ký, hãy gắn chứng chỉ CA ở chế độ chỉ đọc và trỏ `NODE_EXTRA_CA_CERTS` vào chứng chỉ đó. Tệp phải tồn tại khi quá trình Node bắt đầu:

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

Giữ thông tin xác thực proxy bên ngoài tệp Compose (ví dụ: trong tệp `.env` được bảo vệ hoặc bí mật). Không tắt xác minh TLS: chỉ mục OCR đã ký xác thực siêu dữ liệu phát hành, trong khi xác thực TLS thông thường vẫn bảo vệ việc truyền tải và mọi yêu cầu gửi đi khác.

## Kiểm tra sức khỏe {#health-check}

Container bao gồm một health check tích hợp sẵn:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

`TRUST_PROXY` mặc định là `loopback,linklocal,uniquelocal`, nên SnapOtter chỉ tin `X-Forwarded-For` khi nó đến từ một peer thuộc mạng riêng. Một reverse proxy trên cùng máy chủ, trên mạng Docker hoặc trong mạng LAN của bạn được tin cậy ngay từ đầu, nghĩa là việc giới hạn tần suất, bộ hạn chế dò mật khẩu khi đăng nhập, nhật ký kiểm toán và danh sách IP được phép của bản enterprise đều thấy IP thật của client mà không cần cấu hình gì.

Chỉ đặt `TRUST_PROXY=true` khi proxy phía trước tiếp cận SnapOtter từ một địa chỉ **công khai**, chẳng hạn một bộ cân bằng tải trên đám mây nằm ở mạng khác. Trên một thực thể phơi ra trực tiếp, giá trị đó khiến `request.ip` nằm trong tay kẻ tấn công, vì người gọi liên tục đổi header sẽ có một bộ đếm giới hạn tần suất mới ở mỗi yêu cầu.

Có hai điều cần biết trước khi bạn bắt tay đo IP của client. Docker Desktop trên macOS và Windows phục vụ cổng đã công bố thông qua một proxy ở không gian người dùng, nó viết lại mọi địa chỉ nguồn thành cổng vào của máy ảo `192.168.65.1`, nên ở đó không giá trị `TRUST_PROXY` nào lấy lại được client thật; hãy triển khai trên Linux với mọi thứ hướng ra internet. Và trên bất kỳ nền tảng nào, việc truy cập cổng đã công bố qua `localhost` được ghi nhận là cổng vào của cầu nối chứ không phải client của bạn, nên một phép thử qua localhost chẳng nói lên điều gì về cách một client thật được quy gán. Bảng đầy đủ các giá trị `TRUST_PROXY` và lưu ý về Docker Desktop nằm trong [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Hai điều quan trọng đối với mọi proxy bên dưới: cho phép nội dung yêu cầu lớn (tải lên) và không đệm phản hồi. Proxy đệm phản hồi sẽ phá vỡ tiến trình SSE và rõ ràng hơn là khiến quá trình tải xuống tệp lớn "bắt đầu nhưng không bao giờ kết thúc", vì proxy giữ toàn bộ tệp trước khi chuyển nó đi. SnapOtter gửi `X-Accel-Buffering: no` khi tải xuống để nginx truyền phát chúng ngay cả khi bộ đệm được để ở nơi khác, nhưng các proxy khác ngoài nginx cần tắt bộ đệm phản hồi một cách rõ ràng (hiển thị trong từng cấu hình bên dưới). Nếu quá trình tải xuống bị đình trệ giữa chừng, proxy đệm ở phía trước là điều đầu tiên cần kiểm tra.

### Nginx {#nginx}

```nginx
server {
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

        # Truyền phát phản hồi thay vì lưu vào bộ đệm: cần thiết cho tiến trình SSE (cài đặt hàng loạt, AI, tính năng) và để tải xuống tệp lớn.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Thêm một Proxy Host mới
2. Đặt Domain Name thành tên miền của bạn
3. Đặt Scheme thành `http`, Forward Hostname thành `SnapOtter` (hoặc IP container của bạn), Forward Port thành `1349`
4. Bật hỗ trợ WebSocket
5. Trong mục Advanced, thêm: `client_max_body_size 500M;` và `proxy_buffering off;`

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

`flush_interval -1` vô hiệu hóa bộ đệm phản hồi, cần thiết cho các sự kiện tiến trình SSE (xử lý hàng loạt, công cụ AI, cài đặt tính năng) và để tải xuống tệp lớn để truyền phát thay vì bị đình trệ. Thời gian chờ kéo dài cho phép hoàn tất quá trình tải lên tệp lớn mà không cần Caddy đóng kết nối sớm.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Lưu ý: Cloudflare có giới hạn tải lên 100 MB trên các gói miễn phí. Đặt `MAX_UPLOAD_SIZE_MB=100` cho khớp.

## CI/CD {#ci-cd}

Kho GitHub có ba workflow:

- **ci.yml**, chạy tự động trên mỗi lần push và PR. Lint, kiểm tra kiểu, test, build, và xác thực image Docker (mà không push).
- **release.yml**, được kích hoạt thủ công thông qua `workflow_dispatch`. Chạy semantic-release để tạo một thẻ phiên bản và bản phát hành GitHub, rồi xây dựng một image Docker đa kiến trúc (amd64 + arm64) và push lên Docker Hub (`snapotter/snapotter`) và GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**, xây dựng trang tài liệu này và triển khai nó lên Cloudflare Pages khi push vào `main`.

Để tạo một bản phát hành, vào **Actions > Release > Run workflow** trong giao diện GitHub, hoặc chạy:

```bash
gh workflow run release.yml
```

Semantic-release xác định phiên bản từ lịch sử commit. Thẻ Docker `latest` luôn trỏ đến bản phát hành mới nhất.

## Phân tích {#analytics}

SnapOtter bao gồm phân tích sản phẩm ẩn danh (mẫu hình sử dụng công cụ, báo cáo lỗi) để giúp bắt lỗi và cải thiện tính năng. Nó được bật theo mặc định. Các tập tin, tên tập tin, và dữ liệu cá nhân của bạn không bao giờ là một phần của điều này. SnapOtter hoạt động bình thường khi tắt phân tích.

### Tắt phân tích {#disabling-analytics}

Tùy chọn từ chối khi chạy là một công tắc quản trị một cú nhấp. Mở Settings > System > Privacy và tắt Anonymous Product Analytics. Nó dừng ngay lập tức cho toàn bộ instance, không cần xây dựng lại.

Để có một image không bao giờ có thể phát ra phân tích, hãy đặt tùy chọn tắt cứng tại thời điểm build bằng cách clone kho và xây dựng lại:

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

---
description: "Triển khai SnapOtter lên môi trường sản xuất bằng Docker. Yêu cầu phần cứng, thiết lập GPU, và cấu hình reverse proxy cho Nginx, Traefik, và Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 7fcc2f2eb375
---

# Triển khai {#deployment}

SnapOtter triển khai dưới dạng một stack Docker Compose gồm 3 container: image ứng dụng SnapOtter, PostgreSQL 17, và Redis 8. Image ứng dụng hỗ trợ **linux/amd64** (với NVIDIA CUDA để tăng tốc AI) và **linux/arm64** (CPU), nên nó chạy nguyên bản trên máy chủ Intel/AMD, máy Mac Apple Silicon, và các thiết bị ARM như Raspberry Pi 4/5. Tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI.

Xem [Docker Image](./docker-tags) để biết cách thiết lập GPU, các ví dụ Docker Compose, và ghim phiên bản.

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
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

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
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **Bị giới hạn tốc độ của Docker Hub?** Hãy thay `snapotter/snapotter:latest` bằng `ghcr.io/snapotter-hq/snapotter:latest` để kéo từ GitHub Container Registry. Cả hai registry đều nhận cùng một image ở mỗi bản phát hành.

## Bắt đầu nhanh (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Để tăng tốc NVIDIA CUDA cho các công cụ AI (xóa nền, phóng đại, cải thiện khuôn mặt, OCR):

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

Kiểm tra việc phát hiện CUDA trong nhật ký:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Yêu cầu phần cứng {#hardware-requirements}

Các con số này đến từ các benchmark trên một loạt hệ thống, từ một máy trạm amd64 hiện đại với NVIDIA RTX 4070 xuống đến một Raspberry Pi, chạy toàn bộ danh mục công cụ trên mỗi máy và quét qua các giới hạn tài nguyên Docker để tìm ngưỡng sàn thực tế.

### Tham chiếu nhanh {#quick-reference}

| Bậc | Trường hợp sử dụng | CPU | RAM | GPU | Lưu trữ |
|------|----------|-----|-----|-----|---------|
| Tối thiểu | Công cụ ảnh, tệp và PDF nhẹ; một người dùng; lô nhỏ | 2 nhân | 2 GB | Không | ~7 GB |
| Khuyến nghị | Cả năm phương thức gồm video, PDF, và AI trên CPU; lô; một vài người dùng | 4 nhân | 4 GB | Không | ~25 GB |
| Đầy đủ | Mọi thứ với tốc độ cao gồm AI trên GPU; lô lớn; nhiều người dùng | 6-8 nhân | 8 GB | NVIDIA 8 GB+ VRAM (12 GB thoải mái) | ~35 GB |

**Kiến trúc: chỉ 64-bit** (`linux/amd64` hoặc `linux/arm64`). SnapOtter chạy nguyên bản trên máy chủ Intel/AMD, máy Mac Apple Silicon, và các bo mạch ARM 64-bit bao gồm **Raspberry Pi 4 và 5** (4-8 GB). Nó **không** chạy trên ARM 32-bit (`armv7`/`armhf`), không có image nào được dựng cho nó, cũng không chạy trên các bo mạch cỡ 512 MB như Pi Zero, vốn thấp hơn ngưỡng bộ nhớ sàn (xem bên dưới).

### Tối thiểu (công cụ ảnh, tệp và PDF nhẹ; không AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 2 nhân |
| RAM | 2 GB |
| Đĩa | ~5.5 GB (image) + volume dữ liệu |
| GPU | Không bắt buộc |

Tất cả 222 công cụ không phải AI trong danh mục - ảnh (thay đổi kích thước, cắt, chuyển đổi, nén, điều chỉnh, đóng dấu), video (cắt, tắt tiếng, remux), âm thanh (chuyển đổi, chuẩn hóa, cắt), PDF (gộp, tách, nén, xoay, bảo vệ), chuyển đổi tệp, và các preset chuyển đổi chuyên dụng - chạy trên phần cứng khiêm tốn. Hầu hết các thao tác hoàn thành trong dưới một giây ngay cả với tệp lớn: một ảnh 2.7 MB được thay đổi kích thước trong ~0.05 giây và mã hóa lại sang WebP trong ~2 giây.

Ngưỡng bộ nhớ sàn là có thật, từ một đợt quét giới hạn tài nguyên Docker: **512 MB không thể khởi động stack** (ngay cả một lần thay đổi kích thước ảnh đơn lẻ cũng bị hủy), **1 GB** xử lý được các thao tác một tệp nhưng một lô nhiều tệp sẽ hết bộ nhớ, và **2 GB / 2 nhân** là cấu hình nhỏ nhất xử lý các lô một cách thoải mái.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Ngoại lệ nặng về CPU duy nhất là mã hóa lại video.** Các thao tác sao chép luồng (cắt, tắt tiếng, remux container) là tức thời, nhưng chuyển mã sang một codec khác thì bị giới hạn bởi CPU. Một clip 1080p / 45 giây được mã hóa lại sang VP9 (WebM) mất khoảng **~40 giây** trên một CPU hiện đại nhanh, ~45 giây trên Apple Silicon, ~80 giây trên một CPU di động 4 nhân đời cũ, và **~130 giây** trên một máy chủ 4 nhân đời cũ. Nếu khối lượng công việc của bạn nặng về video, hãy ưu tiên số nhân CPU và tốc độ xung nhịp, hoặc nâng giới hạn `cpus:` của container - compose xuất xưởng mặc định giới hạn ứng dụng ở 4 nhân (8 trên compose GPU).

### Khuyến nghị (công cụ AI trên CPU) {#recommended-ai-tools-on-cpu}

| Tài nguyên | Yêu cầu |
|---|---|
| CPU | 4 nhân |
| RAM | 4 GB |
| Đĩa | 3 GB (image) + 24 GB (mô hình AI) + không gian làm việc |
| GPU | Không bắt buộc (dự phòng CPU) |

**Việc cài đặt các bundle AI là điều đẩy RAM lên 4 GB.** Khi không cài AI, ứng dụng chạy nhàn rỗi quanh mức 360 MB; với cả bảy bundle được cài đặt, nó giữ ~2.6 GB thường trú, vì sidecar AI Python nạp trước các mô hình của nó (xóa nền, phóng đại, OCR, phiên âm, phát hiện khuôn mặt, phục hồi) khi khởi động. Các bản cài đặt không AI vẫn nhẹ; các bản cài đặt AI cần ≥4 GB.

Hầu hết các công cụ AI hoàn toàn dùng được trên CPU; một vài công cụ thực sự cần một GPU. Đo trên một CPU 4 nhân hiện đại:

| Công cụ AI | Thời gian CPU | Dùng được trên CPU? |
|---|---|---|
| Phát hiện khuôn mặt (làm mờ khuôn mặt, cắt thông minh, chống mắt đỏ), khử nhiễu | dưới 1 giây | Có |
| OCR, phiên âm, phụ đề | 1-3 giây | Có |
| Tô màu, cải thiện khuôn mặt | ~10 giây | Có |
| Xóa nền / thay thế / làm mờ | ~29 giây | Có (bạn sẽ phải chờ) |
| Phóng đại AI (RealESRGAN) | ~33 giây với ảnh nhỏ; nhiều phút với ảnh lớn | Cận biên - rất khuyến nghị GPU |
| Phục hồi ảnh (toàn bộ pipeline) | vài phút | Không - cần một GPU hoặc một CPU nhiều nhân nhanh |

Kích thước tải xuống mô hình AI:

| Bundle | Kích thước đĩa |
|---|---|
| Xóa nền | 4-5 GB |
| Phóng đại + Cải thiện khuôn mặt + Khử nhiễu | 5-6 GB |
| Phát hiện khuôn mặt | 200-300 MB |
| Tẩy vật thể + Tô màu | 1-2 GB |
| OCR | 5-6 GB |
| Phục hồi ảnh | 4-5 GB |
| **Tất cả các bundle** | **~24 GB** |

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
| CPU | 6-8 nhân (chuẩn bị video + đồng thời vẫn chạy trên CPU ngay cả với AI trên GPU) |
| RAM | 8 GB |
| GPU | NVIDIA với 8+ GB VRAM (khuyến nghị 12 GB) |
| Đĩa | tổng ~35 GB |

Một GPU NVIDIA (CUDA) tăng tốc đáng kể cho các mô hình AI nặng. Đo trên một RTX 4070 so với một CPU hiện đại:

| Công cụ AI | Tăng tốc với GPU | Ghi chú |
|---|---|---|
| Phóng đại AI (RealESRGAN 2×) | **~47×** | Thắng lợi lớn nhất - dưới một giây so với ~33 giây (nhiều phút với ảnh lớn) |
| Cải thiện khuôn mặt (CodeFormer) | **~12×** | ~0.9 giây so với ~11 giây |
| Phiên âm (Whisper) | ~4.5× | |
| Xóa nền / thay thế / làm mờ | ~4× | ~7 giây trên GPU so với ~29 giây trên CPU |
| Tô màu | ~1.8× | |
| OCR, phát hiện khuôn mặt, chống mắt đỏ, khử nhiễu | ~1× | Đã nhanh trên CPU - một GPU không giúp gì |
| Phục hồi ảnh | không | Bị giới hạn bởi CPU ngay cả trên GPU (0% mức sử dụng GPU); một CPU nhanh quan trọng hơn một GPU ở đây |

Các công cụ đáng dùng GPU là **phóng đại, cải thiện khuôn mặt, phiên âm, và xóa nền**. Phát hiện khuôn mặt, OCR, và chống mắt đỏ bị giới hạn bởi CPU và vốn đã nhanh, nên một GPU chẳng thêm được gì.

Mức sử dụng VRAM đỉnh đạt 7.5 GB trong quá trình phóng đại có kèm cải thiện khuôn mặt. Một GPU NVIDIA 6 GB dùng được cho hầu hết các công cụ AI riêng lẻ nhưng sẽ thất bại ở phóng đại. VRAM 8-12 GB xử lý được mọi thứ.

Tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI. Ánh xạ `/dev/dri` vào container không kích hoạt tăng tốc GPU cho AI; SnapOtter sẽ chạy các công cụ AI trên CPU trừ khi có NVIDIA CUDA.

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

Các yêu cầu thay đổi kích thước ảnh song song trên container ứng dụng mặc định giới hạn ở 4 nhân:

| Yêu cầu đồng thời | Thời gian phản hồi trung bình | Lỗi |
|---|---|---|
| 1 | 0.4 giây | 0 |
| 5 | 1.2 giây | 0 |
| 10 | 2.1 giây | 0 |

Thời gian phản hồi suy giảm dưới tuyến tính mà không có lỗi khi worker pool bão hòa. Nâng giới hạn `cpus:` của container ứng dụng (hoặc dùng một máy chủ có nhiều nhân hơn) sẽ nâng trần lên. Lưu ý rằng các tác vụ nặng (chuyển mã video, AI trên CPU) giữ một worker trong toàn bộ thời lượng của chúng, nên hãy định cỡ CPU theo số lượng tác vụ nặng đồng thời dự kiến của bạn, chứ không chỉ theo số lượng yêu cầu.

### Định dạng ảnh được hỗ trợ {#supported-image-formats}

SnapOtter hỗ trợ **55+ định dạng đầu vào** và **14 định dạng đầu ra**, bao gồm tệp RAW từ 20+ thương hiệu máy ảnh, các định dạng chuyên nghiệp (PSD, EPS, OpenEXR, HDR), các codec hiện đại (JPEG XL, AVIF, HEIC, QOI), và các định dạng khoa học/chơi game (FITS, DDS).

Xem [danh sách định dạng đầy đủ](/vi/guide/supported-formats) để biết chi tiết về mọi định dạng được hỗ trợ, bộ giải mã được dùng, và các điều khiển chất lượng có sẵn.

### Hạn chế đã biết {#known-limitations}

- **Thay đổi kích thước nhận biết nội dung** bị sập trên các ảnh lớn (>5 MP) do một hạn chế trong binary caire. Hoạt động tốt với các ảnh nhỏ hơn.
- **Giải mã HEIF** mất 13-23 giây. HEIC (biến thể của Apple) nhanh hơn nhiều ở 0.3-0.9 giây.
- **OCR tiếng Nhật** thất bại trên CPU do một lỗi MKLDNN của PaddlePaddle. Hoạt động trên GPU.
- **Phóng đại** hết thời gian chờ trên CPU với bất cứ thứ gì vượt quá ảnh nhỏ. GPU là bắt buộc để dùng thực tế.
- Cải thiện khuôn mặt bằng **CodeFormer** chậm hơn đáng kể so với GFPGAN (53 giây so với 2 giây trên GPU). GFPGAN được khuyến nghị cho hầu hết các trường hợp sử dụng.

## Volume {#volumes}

| Mount / Volume | Mục đích | Bắt buộc? |
|---|---|---|
| `/data` (app) | Mô hình AI, venv Python, tệp người dùng | **Có** - mất tệp nếu không có nó |
| `/tmp/workspace` (app) | Tệp xử lý tạm thời (tự động dọn dẹp) | Khuyến nghị |
| `SnapOtter-pgdata` (postgres) | Thư mục dữ liệu PostgreSQL (người dùng, thiết lập, pipeline, tác vụ) | **Có** - mất dữ liệu nếu không có nó |
| `SnapOtter-redisdata` (redis) | Tệp chỉ ghi thêm của Redis cho các hàng đợi tác vụ bền vững | Khuyến nghị |

### Bind mount so với volume có tên {#bind-mounts-vs-named-volumes}

**Volume có tên** (khuyến nghị) - Docker quản lý quyền một cách tự động:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount** - Bạn quản lý quyền. Đặt `PUID`/`PGID` để khớp với người dùng host của bạn:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Quyền lưu trữ {#storage-permissions}

SnapOtter ghi vào hai vị trí khi chạy: `/data` (tệp người dùng, nhật ký, mô hình AI và venv Python) và `/tmp/workspace` (không gian nháp xử lý tạm thời). Cả hai đều phải ghi được bởi người dùng mà container chạy dưới danh nghĩa. Nếu một trong hai không ghi được, container **thất bại nhanh khi khởi động** với một thông báo nêu tên thư mục, UID/GID đang chạy, và cách khắc phục, thay vì khởi động ở trạng thái "khỏe mạnh" rồi thất bại ở lần tải lên đầu tiên với một lỗi khó hiểu.

Cách xử lý quyền phụ thuộc vào cách container được khởi chạy:

**Mặc định (khởi động bằng root, hạ xuống `snapotter`)** - entrypoint khởi động bằng root, sửa quyền sở hữu của các volume được mount, rồi hạ xuống người dùng không đặc quyền `snapotter` qua `gosu`. Volume có tên hoạt động mà không cần cấu hình. Với bind mount, hãy đặt `PUID`/`PGID` thành người dùng host của bạn (ở trên) để các tệp nó ghi thuộc sở hữu của bạn.

**Kubernetes / OpenShift (không phải root qua `runAsUser`)** - được khởi chạy trực tiếp dưới danh nghĩa một người dùng không phải root, container không thể tự chown các volume, nên bộ điều phối phải làm cho chúng ghi được. Đặt `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Các thư mục ghi được của image thuộc nhóm sở hữu bởi GID 0 và cho phép nhóm ghi, nên một pod chạy với một **UID tùy ý** cộng với nhóm bổ sung root (mặc định của OpenShift) có thể ghi mà không cần `chown`.

**TrueNAS Scale (và các thiết lập "UID lạ" khác)** - TrueNAS chạy các ứng dụng dưới danh nghĩa một người dùng không phải root (thường là `568:568`) và mount các dataset host thuộc sở hữu của một người dùng khác, nên cả entrypoint lẫn `fsGroup` đều không tự làm cho chúng ghi được. Hãy chọn một cách:

- **Chạy ứng dụng bằng root** (khuyến nghị) - để trống người dùng của ứng dụng hoặc đặt nó thành `0`, và để entrypoint mặc định sửa quyền và hạ xuống `snapotter`.
- **Chạy bằng UID `999`** - đặt người dùng/nhóm của ứng dụng thành `999:999` (người dùng `snapotter` tích hợp sẵn của SnapOtter) để nó khớp với quyền sở hữu của image.
- **`chown` dataset host** thành UID mà container chạy dưới danh nghĩa, từ shell của TrueNAS:

  ```bash
  # Dùng UID từ lỗi khởi động (hoặc chạy `id` bên trong container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Lỗi khởi động nêu chính xác UID cần dùng, nên con đường nhanh nhất là khởi động ứng dụng một lần, đọc thông báo, rồi `chown` (hoặc điều chỉnh người dùng) cho phù hợp.

## Biến môi trường {#environment-variables}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `true` | Bật/tắt yêu cầu đăng nhập |
| `DEFAULT_USERNAME` | `admin` | Tên người dùng quản trị ban đầu |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu quản trị ban đầu (buộc đổi ở lần đăng nhập đầu tiên) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Giới hạn tải lên mỗi tệp |
| `MAX_BATCH_SIZE` | `100` | Số tệp tối đa mỗi yêu cầu lô |
| `RATE_LIMIT_PER_MIN` | `1000` | Số yêu cầu API mỗi phút mỗi IP (đặt 0 để tắt) |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng tối đa |
| `TRUST_PROXY` | `true` | Tin cậy các header X-Forwarded-For từ reverse proxy |
| `PUID` | `999` | Chạy dưới UID này (cho quyền bind mount) |
| `PGID` | `999` | Chạy dưới GID này (cho quyền bind mount) |
| `LOG_LEVEL` | `info` | Mức chi tiết nhật ký: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (tự động) | Số tác vụ xử lý AI song song tối đa |
| `SESSION_DURATION_HOURS` | `168` | Thời gian sống của phiên đăng nhập (7 ngày) |
| `CORS_ORIGIN` | (rỗng) | Các nguồn gốc được phép phân tách bằng dấu phẩy, hoặc để trống cho cùng nguồn gốc |

## Kiểm tra sức khỏe {#health-check}

Container bao gồm một kiểm tra sức khỏe tích hợp sẵn:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter đặt `TRUST_PROXY=true` theo mặc định để việc giới hạn tốc độ và ghi nhật ký sử dụng IP client thực từ các header `X-Forwarded-For`.

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

        # SSE support (batch progress, feature install progress)
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
5. Dưới mục Advanced, thêm: `client_max_body_size 500M;` và `proxy_buffering off;`

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

`flush_interval -1` tắt việc đệm phản hồi, điều bắt buộc cho các sự kiện tiến độ SSE (xử lý lô, công cụ AI, cài đặt tính năng). Các thời gian chờ kéo dài cho phép việc tải lên tệp lớn hoàn tất mà không bị Caddy đóng kết nối sớm.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Lưu ý: Cloudflare có giới hạn tải lên 100 MB trên các gói miễn phí. Hãy đặt `MAX_UPLOAD_SIZE_MB=100` cho khớp.

## CI/CD {#ci-cd}

Kho GitHub có ba workflow:

- **ci.yml** - Chạy tự động ở mỗi lần push và PR. Lint, kiểm tra kiểu, kiểm thử, dựng, và xác thực image Docker (mà không push).
- **release.yml** - Được kích hoạt thủ công qua `workflow_dispatch`. Chạy semantic-release để tạo một tag phiên bản và bản phát hành GitHub, rồi dựng một image Docker đa kiến trúc (amd64 + arm64) và push tới Docker Hub (`snapotter/snapotter`) và GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Dựng trang tài liệu này và triển khai nó lên Cloudflare Pages khi push tới `main`.

Để tạo một bản phát hành, hãy vào **Actions > Release > Run workflow** trong giao diện GitHub, hoặc chạy:

```bash
gh workflow run release.yml
```

Semantic-release xác định phiên bản từ lịch sử commit. Tag Docker `latest` luôn trỏ tới bản phát hành gần nhất.

## Phân tích {#analytics}

SnapOtter bao gồm phân tích sản phẩm ẩn danh (các mẫu sử dụng công cụ, báo cáo lỗi) để giúp phát hiện lỗi và cải thiện tính năng. Nó được bật theo mặc định. Các tệp, tên tệp, và dữ liệu cá nhân của bạn không bao giờ là một phần của việc này. SnapOtter hoạt động bình thường khi phân tích bị tắt.

### Tắt phân tích {#disabling-analytics}

Tùy chọn từ chối khi chạy là một công tắc quản trị chỉ một lần nhấp. Mở Settings > System > Privacy và tắt Anonymous Product Analytics. Nó dừng ngay lập tức cho toàn bộ phiên bản, không cần dựng lại.

Đối với một image không bao giờ có thể phát ra phân tích, hãy đặt tùy chọn tắt cứng tại thời điểm dựng bằng cách clone kho và dựng lại:

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

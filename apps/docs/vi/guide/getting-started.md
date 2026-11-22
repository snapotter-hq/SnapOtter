---
description: "Cài đặt SnapOtter bằng Docker chỉ với một lệnh, đăng nhập và mở công cụ đầu tiên. Bao gồm tăng tốc GPU, máy cấu hình thấp, Docker Compose và build từ mã nguồn."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 1a05facef342
i18n_hash_version: 2
---

# Bắt đầu {#getting-started}

::: tip Dùng thử trước khi cài đặt
Khám phá toàn bộ giao diện tại [demo.snapotter.com](https://demo.snapotter.com) - không cần đăng ký hay cài đặt.
:::

## Bắt đầu nhanh {#quick-start}

Chạy một lệnh:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sau đó mở [http://localhost:1349](http://localhost:1349) và đăng nhập bằng `admin` / `admin`. Bạn sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.

Giờ hãy mở một công cụ. Chọn một công cụ từ thanh bên, hoặc vào thẳng [Resize](http://localhost:1349/image/resize), thả một ảnh vào và tải kết quả về.

Vậy là xong phần cài đặt. Container duy nhất này chạy mọi thứ cần thiết: khi không đặt `DATABASE_URL`, nó tự khởi động PostgreSQL và Redis riêng trên giao diện loopback (chế độ nhúng) và lưu toàn bộ dữ liệu trong volume `SnapOtter-data`. Đây là cách nhanh nhất để thử SnapOtter hoặc tự lưu trữ trên homelab. Chế độ nhúng chạy với quyền root (mặc định) và tự động tắt ngay khi bạn đặt `DATABASE_URL`. Với môi trường production, hãy dùng [stack Docker Compose](#docker-compose), nơi PostgreSQL và Redis chạy trong các container riêng.

Kết quả của các job không được lưu trong volume dữ liệu, nên chúng biến mất khi container được thay thế (ví dụ khi nâng cấp image) và liên kết tải xuống của chúng ngừng hoạt động. Mục [Giữ lại kết quả job](/vi/guide/deployment#keeping-job-output) trong hướng dẫn Triển khai giải thích cách giữ lại chúng.

::: tip Chạy trên máy có RAM từ 4 GB trở xuống
Trên Raspberry Pi, laptop cũ hoặc VPS nhỏ, hãy chạy từng job một và giới hạn nhóm luồng xử lý ảnh bằng cách thêm `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` vào lệnh ở trên, đồng thời bỏ qua các gói AI nặng. [Thiết lập cho tài nguyên thấp](/vi/guide/low-resource#tuning-knobs) liệt kê các giới hạn đáng đặt khác và những gì nên kỳ vọng ở phần cứng hạn chế.
:::

::: tip Phân tích sử dụng sản phẩm ẩn danh
SnapOtter mặc định có phân tích sử dụng sản phẩm ẩn danh. Để tắt, hãy mở **Settings → System → Privacy** và tắt **Anonymous Product Analytics**. Tính năng này dừng ngay lập tức cho toàn bộ instance.

Bạn cũng có thể đặt biến môi trường `SNAPOTTER_TELEMETRY=0` (`false` và `off` cũng dùng được) để tắt toàn bộ telemetry của instance mà không cần build lại.

Việc giám sát lỗi do [Sentry](https://sentry.io) đảm nhiệm, đơn vị tài trợ cho SnapOtter thông qua chương trình mã nguồn mở của họ.

Để biết chi tiết về dữ liệu được thu thập, xem [SnapOtter thu thập những gì](/vi/guide/telemetry).
:::

## Tăng tốc GPU {#gpu-acceleration}

GPU NVIDIA giúp các công cụ AI nặng nhanh hơn nhiều: upscale (khoảng 47 lần), nâng cấp khuôn mặt (khoảng 12 lần), phiên âm và xóa nền (mỗi tác vụ khoảng 4 lần). OCR, phát hiện khuôn mặt và phục hồi ảnh vẫn bị giới hạn bởi CPU, nên GPU không giúp ích cho chúng. Cùng một image dùng được cho cả hai trường hợp; hãy thêm `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Cách này cần [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) trên máy chủ. Khi không có CUDA, SnapOtter tự chuyển về CPU. Hiện tại không hỗ trợ tăng tốc suy luận AI bằng iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL.

- [Yêu cầu phần cứng](/vi/guide/deployment#full-ai-tools-on-nvidia-cuda) có thời gian xử lý đầy đủ trên GPU và CPU, còn [benchmark image Docker](/vi/guide/docker-tags#benchmarks) có số liệu khởi động nóng và khởi động nguội.
- Nếu các công cụ AI vẫn chạy trên CPU, xem [Xác minh tăng tốc GPU](/vi/guide/deployment#verify-gpu-acceleration).
- Với Compose, dùng [Bắt đầu nhanh với NVIDIA CUDA](/vi/guide/deployment#quick-start-nvidia-cuda) trong hướng dẫn Triển khai.

## Các cách cài đặt khác {#other-ways-to-install}

### Một container với Compose {#single-container-compose}

Cùng container chế độ nhúng như ở phần Bắt đầu nhanh, nhưng viết thành tệp Compose để dễ theo dõi và chỉnh sửa hơn. Lưu thành `docker-compose.yml` và chạy `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Giống lệnh `docker run`, cách này dành cho việc thử SnapOtter và các bản cài đặt nhỏ. Mọi cài đặt trong [Cấu hình](/vi/guide/configuration) đều đặt dưới `environment`.

### Docker Compose (production) {#docker-compose}

Hãy dùng tệp production được duy trì và kiểm thử cùng mỗi bản phát hành thay vì sao chép một ví dụ Compose rút gọn từ trang này:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Mở [http://localhost:1349](http://localhost:1349) và đăng nhập bằng `admin` / `admin`.

Tệp [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) chuẩn bao gồm đủ bốn volume runtime, health check, giới hạn tài nguyên, cấu hình Redis bền vững, các image cơ sở dữ liệu/cache đã cố định phiên bản và các biện pháp tăng cường bảo mật container hiện hành. Hãy đổi mật khẩu quản trị mặc định ngay sau lần đăng nhập đầu tiên. Để triển khai có thể tái lập, hãy cố định image ứng dụng SnapOtter theo tag hoặc digest bản phát hành mà bạn đã xác minh thay vì theo dõi `latest`.

Xem [Cấu hình](/vi/guide/configuration) để biết tất cả biến môi trường và [Bảo mật và tăng cường](/vi/guide/security) để biết hướng dẫn về secret, chính sách mạng và sao lưu.

### GitHub Container Registry {#ghcr}

Cả Docker Hub và GHCR đều phát hành cùng một image ở mỗi bản phát hành. Để pull từ GHCR, hãy đổi tên image:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Build từ mã nguồn {#build-from-source}

**Điều kiện tiên quyết:** Node.js 22.22+, pnpm 9+, Docker (cho Postgres + Redis), Python 3.11+ (cho các tính năng AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Bạn có thể làm gì {#what-you-can-do}

### Xử lý tệp (200+ công cụ) {#file-processing-200-tools}

| Phương thức | Số lượng | Công cụ ví dụ |
|----------|-------|---------------|
| **Ảnh** | 112 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 63 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Âm thanh** | 57 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Tài liệu** | 37 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Tệp** | 25 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipeline {#pipelines}

Nối các công cụ thành quy trình nhiều bước và áp dụng cho một ảnh hoặc cả một lô:

1. Mở **Pipelines** trên thanh bên.
2. Thêm các bước (công cụ bất kỳ, cài đặt bất kỳ).
3. Chạy trên một tệp đơn lẻ - hoặc cả một lô cùng lúc.
4. Lưu pipeline để dùng lại sau.

Mặc định pipeline cho phép 20 bước. Đặt `MAX_PIPELINE_STEPS=0` để bỏ giới hạn này.

### Thư viện tệp {#file-library}

Mọi tệp bạn xử lý đều có thể được lưu vào thư viện **Files** của bạn. SnapOtter theo dõi toàn bộ lịch sử phiên bản để bạn có thể lần lại từng bước xử lý, từ tệp tải lên ban đầu đến kết quả cuối cùng.

Việc lưu là chủ động: kết quả bạn lưu vào thư viện được giữ cho đến khi bạn xóa, còn kết quả đã xử lý mà không lưu sẽ tự động bị xóa sau 72 giờ (có thể cấu hình qua `FILE_MAX_AGE_HOURS`).

### REST API và khóa API {#rest-api-api-keys}

Mọi công cụ đều truy cập được qua HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Tạo khóa API tại **Settings → API Keys**. Xem [tài liệu tham khảo REST API](/vi/api/rest) để biết tất cả endpoint, hoặc truy cập [http://localhost:1349/api/docs](http://localhost:1349/api/docs) để xem tài liệu tương tác.

### Nhiều người dùng và nhóm {#multi-user-teams}

Bật nhiều người dùng với kiểm soát truy cập theo vai trò:

- **Admin**: toàn quyền - quản lý người dùng, nhóm, cài đặt, tất cả tệp/pipeline/khóa API
- **User**: dùng các công cụ, quản lý tệp/pipeline/khóa API của chính mình

Tạo nhóm tại **Settings → Teams** để gom người dùng.

Đặt `AUTH_ENABLED=true` (hoặc `false` cho trường hợp một người dùng/tự dùng, không cần đăng nhập).

## Dùng trên điện thoại {#use-it-from-your-phone}

SnapOtter hoạt động trên trình duyệt di động và bạn có thể cài đặt nó như một ứng dụng. Mở instance của bạn trên điện thoại, sau đó:

- **iPhone / iPad (Safari):** nhấn Chia sẻ, rồi chọn **Add to Home Screen**.
- **Android (Chrome):** mở menu trình duyệt và nhấn **Install app**.

Ứng dụng đã cài sẽ mở trong cửa sổ riêng, đi thẳng vào instance của bạn.

Có một lưu ý: trình duyệt chỉ hiển thị lời nhắc cài đặt qua HTTPS. Địa chỉ HTTP thuần trong mạng LAN vẫn dùng tốt trong một tab trình duyệt; để cài đặt thật sự, hãy đặt instance sau một reverse proxy có chứng chỉ (xem [hướng dẫn triển khai](/vi/guide/deployment)).

Trên điện thoại và máy tính bảng, các công cụ ảnh hiển thị nút **Take photo** cạnh nút tải lên. Chụp một hóa đơn hoặc bảng trắng và ảnh sẽ đi thẳng vào công cụ.

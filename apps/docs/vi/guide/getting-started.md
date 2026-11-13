---
description: "Cài đặt SnapOtter bằng Docker chỉ với một lệnh. Bao gồm thiết lập Docker Compose, build từ mã nguồn và tổng quan đầy đủ các tính năng."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 355c895f6050
i18n_hash_version: 2
---

# Bắt đầu {#getting-started}

::: tip Dùng thử trước khi cài đặt
Khám phá toàn bộ giao diện tại [demo.snapotter.com](https://demo.snapotter.com) - không cần đăng ký hay cài đặt.
:::

## Bắt đầu nhanh {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Container duy nhất này chạy mọi thứ cần thiết: khi không đặt `DATABASE_URL`, nó tự khởi động PostgreSQL và Redis riêng trên giao diện loopback (chế độ nhúng) và lưu toàn bộ dữ liệu trong volume `SnapOtter-data`. Đây là cách nhanh nhất để thử SnapOtter hoặc tự lưu trữ trên homelab. Với môi trường production, hãy dùng [stack Docker Compose chuẩn](#docker-compose), nơi PostgreSQL và Redis chạy trong các container riêng. Chế độ nhúng chạy với quyền root (mặc định) và tự động tắt ngay khi bạn đặt `DATABASE_URL`.

Bạn cài đặt trên Raspberry Pi, laptop cũ hoặc VPS nhỏ? Xem [Thiết lập cho tài nguyên thấp](/vi/guide/low-resource) để có hướng dẫn đã tinh chỉnh và biết nên kỳ vọng gì ở phần cứng hạn chế.

Bạn sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.

::: tip Phân tích sử dụng sản phẩm ẩn danh
SnapOtter mặc định có phân tích sử dụng sản phẩm ẩn danh. Để tắt, hãy mở **Settings → System → Privacy** và tắt **Anonymous Product Analytics**. Tính năng này dừng ngay lập tức cho toàn bộ instance.

Bạn cũng có thể đặt biến môi trường `SNAPOTTER_TELEMETRY=0` (`false` và `off` cũng dùng được) để tắt toàn bộ telemetry của instance mà không cần build lại.

Việc giám sát lỗi do [Sentry](https://sentry.io) đảm nhiệm, đơn vị tài trợ cho SnapOtter thông qua chương trình mã nguồn mở của họ.

Để biết chi tiết về dữ liệu được thu thập, xem [SnapOtter thu thập những gì](/vi/guide/telemetry).
:::

::: tip Tăng tốc NVIDIA CUDA
Thêm `--gpus all` để tăng tốc bằng NVIDIA CUDA cho các tác vụ xóa nền, upscale, nâng cấp khuôn mặt và phục hồi ảnh. OCR vẫn chạy trên CPU và hoạt động trong cùng một image, dù có quyền truy cập GPU hay không:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Yêu cầu [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Tự động chuyển về CPU khi CUDA không khả dụng. Hiện tại không hỗ trợ tăng tốc suy luận AI bằng iGPU Intel/AMD qua VA-API, Quick Sync hoặc OpenCL. Xem [Tag Docker](/vi/guide/docker-tags) để biết benchmark. Nếu các công cụ AI vẫn chạy trên CPU dù đã dùng `--gpus all`, xem [Xác minh tăng tốc GPU](/vi/guide/deployment#verify-gpu-acceleration).
:::

::: details Cũng có trên GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Cả hai registry đều phát hành cùng một image ở mỗi bản phát hành.
:::

## Docker Compose {#docker-compose}

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

Tệp [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) chuẩn bao gồm đủ bốn volume runtime, health check, giới hạn tài nguyên, cấu hình Redis bền vững, các image cơ sở dữ liệu/cache đã cố định phiên bản và các biện pháp tăng cường bảo mật container hiện hành. Hãy đổi mật khẩu quản trị mặc định ngay sau lần đăng nhập đầu tiên. Để triển khai có thể tái lập, hãy cố định image ứng dụng SnapOtter theo tag hoặc digest bản phát hành mà bạn đã xác minh thay vì theo dõi `latest`.

Xem [Cấu hình](/vi/guide/configuration) để biết tất cả biến môi trường và [Bảo mật và tăng cường](/vi/guide/security) để biết hướng dẫn về secret, chính sách mạng và sao lưu.

## Build từ mã nguồn {#build-from-source}

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
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Âm thanh** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Tài liệu** | 35 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Tệp** | 23 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

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

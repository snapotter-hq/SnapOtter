---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: f3a870d1a4ce
i18n_hash_version: 2
---
# Thiết lập cho tài nguyên thấp {#low-resource-setups}

SnapOtter chạy tốt trên phần cứng nhỏ: Raspberry Pi 4 hoặc 5, laptop cũ, hoặc VPS 2 GB. Trang này là hướng dẫn thực tế cho các máy đó: nên kỳ vọng gì, một thiết lập sao chép là dùng được với các giới hạn hợp lý, và những tính năng nên bỏ qua. Dữ liệu benchmark đầy đủ đằng sau các con số này nằm trong [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

Hai ràng buộc cứng cần nắm trước:

- **Chỉ 64-bit.** Image được build cho `linux/amd64` và `linux/arm64`. ARM 32-bit (`armv7`/`armhf`) không được hỗ trợ, nên Pi thế hệ đầu và dòng Pi Zero bị loại.
- **Mức bộ nhớ tối thiểu 2 GB (công cụ không dùng AI).** 512 MB không thể khởi động stack, và 1 GB lỗi khi xử lý lô nhiều tệp. 2 GB với 2 nhân là cấu hình nhỏ nhất chạy thoải mái các công cụ không dùng AI.

## Những gì chạy tốt trên phần cứng nhỏ {#what-runs-well}

Mọi công cụ không dùng AI đều hoạt động trên máy 2 GB / 2 nhân: toàn bộ mục Ảnh và Tệp, công cụ PDF, và các thao tác video và âm thanh kiểu stream-copy (cắt, tắt tiếng, remux container). Phần lớn hoàn tất trong chưa đầy một giây.

Có hai tác vụ là ngoại lệ:

- **Mã hóa lại video** (chuyển đổi giữa các codec) bị giới hạn bởi CPU. Một clip 1080p mất khoảng 40 giây trên CPU desktop nhanh có thể mất vài phút trên CPU cấp Pi. Các thao tác stream-copy vẫn tức thì.
- **Công cụ AI** có mức bộ nhớ CPU tối thiểu theo từng bundle: 2 GB RAM máy chủ (còn trống 0.5 GB) cho Face Detection và Fast OCR tích hợp, 4 GiB bộ nhớ hiệu dụng được cấu hình cho Accurate OCR, 4 GB RAM máy chủ (còn trống 2 đến 3 GB) cho Transcription, Object Eraser & Colorize, Background Removal, Upscale & Enhance và Photo Restoration, và 8 GB RAM máy chủ (còn trống 6 GB) cho High-Quality Inpainting. Máy 2 GB không thể chạy Whisper, RealESRGAN, rembg hay LaMa mà không bị OOM-kill, vì vậy SnapOtter kiểm tra bộ nhớ trống trước khi chuyển tác vụ sang sidecar Python và từ chối ngay các lần chạy dưới mức tối thiểu của bundle.

Cả hai đều không được cài đặt hay chạy trừ khi bạn dùng đến: khi chưa cài bundle AI nào, ứng dụng ở trạng thái rảnh với khoảng 360 MB, và các bundle AI chỉ được tải khi quản trị viên bật chúng.

## Hướng dẫn cho Raspberry Pi / laptop cũ {#walkthrough}

Đây là bản cài Compose tiêu chuẩn từ [Bắt đầu](/vi/guide/getting-started), cộng thêm giới hạn tài nguyên và các mức giới hạn thận trọng. Hướng dẫn giả định hệ điều hành 64-bit (trên Pi: Raspberry Pi OS 64-bit hoặc Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Lưu ý cho các máy cấp Pi:

- **Ưu tiên SSD USB hơn thẻ SD** cho volume dữ liệu và Postgres. Không gian làm việc của job thực hiện nhiều IO đĩa, và thẻ SD vừa chậm vừa nhanh hỏng.
- **Container all-in-one cũng chạy được ở đây** (Postgres và Redis nhúng khi `DATABASE_URL`/`REDIS_URL` không được đặt), và trên máy chủ hạn chế bộ nhớ, bạn nên hạ giới hạn Redis nhúng của nó bằng `REDIS_MAXMEMORY` (xem [Cấu hình](/vi/guide/configuration)). Compose cho phép kiểm soát chi tiết hơn theo từng dịch vụ, đó là lý do hướng dẫn này dùng nó.
- **Thêm swap trên thiết bị 2 GB.** Swap giúp những đợt tăng đột biến thỉnh thoảng (một PDF lớn, một lô bạn quên đặt giới hạn) không kết thúc bằng việc bị kill do hết bộ nhớ. zram là lựa chọn thân thiện với thẻ SD.
- Image arm64 chỉ chạy CPU; không có CUDA trên các bo mạch ARM.

## Các tham số tinh chỉnh {#tuning-knobs}

Mọi giới hạn đều là biến môi trường, được mô tả đầy đủ trong [Cấu hình](/vi/guide/configuration). `0` nghĩa là không giới hạn hoặc tự động. Những biến quan trọng trên phần cứng nhỏ:

| Biến | Gợi ý cho máy nhỏ | Bảo vệ điều gì |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Số job chạy song song. Tự phát hiện dùng số nhân CPU trừ một, phù hợp với máy lớn nhưng quá hăng với máy 2 nhân khi thiếu bộ nhớ. |
| `MAX_WORKER_THREADS` | `2` | Thread pool xử lý ảnh. |
| `MAX_BATCH_SIZE` | `5` | Xử lý lô là nơi máy 1-2 GB hết bộ nhớ đầu tiên. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Ngăn một tệp khổng lồ chiếm toàn bộ không gian làm việc. |
| `MAX_MEGAPIXELS` | `50` | Giải mã ảnh trên 100 MP tốn RAM bất kể dung lượng tệp. |
| `MAX_VIDEO_DURATION_S` | `300` | Các lần transcode dài chiếm dụng CPU nhỏ từ vài phút đến vài giờ. |
| `PROCESSING_TIMEOUT_S` | `600` | Trần cứng để một job chạy mất kiểm soát cuối cùng cũng giải phóng máy. |

Các giới hạn này áp dụng cho những gì máy chủ chấp nhận, nên hãy đặt chúng khớp với những gì bạn thực sự dùng thay vì đặt nhỏ nhất có thể. Nếu bạn không bao giờ dùng video, giới hạn `MAX_VIDEO_DURATION_S` không gây tốn kém gì; nếu bạn quét tài liệu hằng ngày, đừng giới hạn `MAX_PDF_PAGES`.

## Nên bỏ qua gì {#what-to-skip}

- **Các bundle AI nặng.** Upscale, phục hồi ảnh và xóa nền cần GPU hoặc CPU nhiều nhân nhanh, và mỗi bundle tốn 4-5 GB đĩa. Trên máy nhỏ, đơn giản là đừng cài chúng; các công cụ thiếu bundle sẽ hiện lời nhắc cài đặt thay vì chạy.
- **Mã hóa lại video như một tác vụ thường xuyên.** Thỉnh thoảng transcode thì ổn (chỉ là chậm); một hàng đợi transcode liên tục cần nhân CPU, không phải một chiếc Pi.
- **Nói chung là các công cụ không dùng đến.** Quản trị viên có thể tắt từng công cụ trong Settings, việc này gỡ chúng khỏi giao diện và ngừng đăng ký các route API của chúng. Bản thân việc đó không tiết kiệm bộ nhớ, nhưng giúp một instance nhỏ dùng chung không bị dùng cho đúng tác vụ mà phần cứng không chịu nổi.

Nếu sau này bạn chuyển instance sang phần cứng mạnh hơn, hãy gỡ các giới hạn (đặt lại về `0`) và cùng volume dữ liệu đó sẽ được dùng tiếp.

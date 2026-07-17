---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 807fa3238d8e
---
# Thiết lập trên phần cứng hạn chế {#low-resource-setups}

SnapOtter chạy tốt trên phần cứng nhỏ: một chiếc Raspberry Pi 4 hoặc 5, một laptop cũ, hoặc một VPS 2 GB. Trang này là hướng dẫn thực tế cho những máy đó: nên kỳ vọng điều gì, một thiết lập sao chép dán là chạy với các giới hạn hợp lý, và những tính năng nào nên bỏ qua. Dữ liệu benchmark đầy đủ đằng sau các con số này nằm trong [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

Hai ràng buộc cứng cần biết trước:

- **Chỉ hỗ trợ 64-bit.** Image được build cho `linux/amd64` và `linux/arm64`. ARM 32-bit (`armv7`/`armhf`) không được hỗ trợ, nên các Pi thế hệ đầu và dòng Pi Zero bị loại.
- **Ngưỡng bộ nhớ tối thiểu 2 GB.** 512 MB không thể khởi động stack, và 1 GB thất bại với các lô nhiều tập tin. 2 GB cùng 2 nhân là cấu hình nhỏ nhất chạy thoải mái.

## Những gì chạy tốt trên phần cứng nhỏ {#what-runs-well}

Mọi công cụ không dùng AI đều hoạt động trên máy 2 GB / 2 nhân: toàn bộ mục Hình ảnh và Tập tin, các công cụ PDF, và các thao tác video, âm thanh dạng stream-copy (cắt, tắt tiếng, đổi container). Phần lớn hoàn thành trong chưa đầy một giây.

Hai loại tải là ngoại lệ:

- **Mã hóa lại video** (chuyển đổi giữa các codec) phụ thuộc CPU. Một clip 1080p mất ~40 giây trên CPU desktop nhanh có thể mất vài phút trên CPU cỡ Pi. Các thao tác stream-copy vẫn tức thời.
- **Các công cụ AI** cần RAM (khuyến nghị 4 GB) và ổ đĩa (các gói lớn nặng 4-5 GB mỗi gói), và những công cụ nặng (nâng cấp độ phân giải, phục hồi ảnh, loại bỏ nền) không thực tế trên CPU cỡ Pi. AI nhẹ như nhận diện khuôn mặt và OCR vẫn dùng được nếu bạn có đủ bộ nhớ.

Cả hai đều không được cài đặt hay chạy trừ khi bạn dùng đến: khi chưa cài gói AI nào, ứng dụng chỉ chiếm khoảng 360 MB lúc nhàn rỗi, và các gói AI chỉ được tải xuống khi quản trị viên bật chúng.

## Hướng dẫn từng bước cho Raspberry Pi / laptop cũ {#walkthrough}

Đây là bản cài đặt Compose tiêu chuẩn từ trang [Bắt đầu](/vi/guide/getting-started), cộng thêm giới hạn tài nguyên và các mức trần thận trọng. Nó giả định một hệ điều hành 64-bit (trên Pi: Raspberry Pi OS 64-bit hoặc Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Lưu ý cho các máy cỡ Pi:

- **Ưu tiên SSD USB thay vì thẻ SD** cho volume dữ liệu và Postgres. Không gian làm việc của các job tạo ra IO đĩa thực sự, còn thẻ SD vừa chậm vừa nhanh hỏng.
- **Container đơn tất-cả-trong-một cũng hoạt động ở đây** (Postgres và Redis nhúng khi `DATABASE_URL`/`REDIS_URL` không được đặt), và trên máy chủ hạn chế bộ nhớ, bạn nên hạ mức trần của Redis nhúng bằng `REDIS_MAXMEMORY` (xem [Cấu hình](/vi/guide/configuration)). Compose cho bạn quyền kiểm soát chi tiết hơn theo từng dịch vụ, đó là lý do hướng dẫn này dùng nó.
- **Thêm swap trên các thiết bị 2 GB.** Nó giúp những đợt tăng đột biến thi thoảng (một PDF lớn, một lô bạn quên giới hạn) không kết thúc bằng việc bị kill do hết bộ nhớ. zram là lựa chọn thân thiện với thẻ SD.
- Image arm64 chỉ chạy CPU; không có CUDA trên các bo mạch ARM.

## Các nút tinh chỉnh {#tuning-knobs}

Tất cả các mức trần đều là biến môi trường, được ghi chép đầy đủ trong [Cấu hình](/vi/guide/configuration). `0` nghĩa là không giới hạn hoặc tự động. Những biến quan trọng trên phần cứng nhỏ:

| Biến | Gợi ý cho máy nhỏ | Nó bảo vệ điều gì |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Số job chạy song song. Chế độ tự phát hiện dùng số nhân CPU trừ một, ổn trên máy lớn nhưng quá tham trên máy 2 nhân khi thiếu bộ nhớ. |
| `MAX_WORKER_THREADS` | `2` | Pool luồng xử lý hình ảnh. |
| `MAX_BATCH_SIZE` | `5` | Xử lý lô là nơi các máy 1-2 GB cạn bộ nhớ đầu tiên. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Ngăn một tập tin khổng lồ chiếm trọn không gian làm việc. |
| `MAX_MEGAPIXELS` | `50` | Giải mã một ảnh 100+ MP tốn RAM bất kể kích thước tập tin. |
| `MAX_VIDEO_DURATION_S` | `300` | Các phiên chuyển mã dài độc chiếm CPU nhỏ trong nhiều phút đến nhiều giờ. |
| `PROCESSING_TIMEOUT_S` | `600` | Trần cứng để một job mất kiểm soát cuối cùng cũng trả lại máy. |

Các mức trần này áp cho những gì máy chủ chấp nhận, vì vậy hãy đặt chúng theo những gì bạn thực sự dùng thay vì càng nhỏ càng tốt. Nếu bạn không bao giờ đụng đến video, một mức trần `MAX_VIDEO_DURATION_S` chẳng tốn gì; nếu bạn quét tài liệu hằng ngày, đừng giới hạn `MAX_PDF_PAGES`.

## Những gì nên bỏ qua {#what-to-skip}

- **Các gói AI nặng.** Nâng cấp độ phân giải, phục hồi ảnh, và loại bỏ nền cần GPU hoặc CPU nhiều nhân tốc độ cao, và mỗi gói tốn 4-5 GB ổ đĩa. Trên máy nhỏ, đơn giản là đừng cài chúng; các công cụ thiếu gói sẽ hiển thị lời nhắc cài đặt thay vì chạy.
- **Mã hóa lại video như một tải thường xuyên.** Thi thoảng chuyển mã thì không sao (chỉ là chậm); một hàng đợi chuyển mã đều đặn cần nhiều nhân CPU, không phải một chiếc Pi.
- **Nói chung là các công cụ không dùng đến.** Quản trị viên có thể tắt từng công cụ trong Settings, việc này gỡ chúng khỏi giao diện và ngừng đăng ký các route API của chúng. Bản thân việc đó không tiết kiệm bộ nhớ, nhưng nó giữ cho một instance nhỏ dùng chung không bị đem ra chạy đúng loại tải mà phần cứng không kham nổi.

Nếu sau này bạn chuyển instance sang phần cứng mạnh hơn, hãy gỡ các mức trần (đặt lại về `0`) và chính volume dữ liệu đó sẽ được mang theo.

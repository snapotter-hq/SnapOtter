---
description: "Tất cả biến môi trường của SnapOtter cùng giá trị mặc định. Cấu hình xác thực, lưu trữ, mô hình AI, analytics và nhiều hơn nữa."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 126c1b6c34ac
i18n_hash_version: 2
---

# Cấu hình {#configuration}

Mọi cấu hình đều được thực hiện thông qua biến môi trường. Mỗi biến đều có một giá trị mặc định hợp lý, nên SnapOtter hoạt động ngay mà không cần đặt biến nào.

## Biến môi trường {#environment-variables}

### Máy chủ {#server}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `1349` | Cổng mà máy chủ lắng nghe. |
| `HOST` | `0.0.0.0` | Địa chỉ IP mà máy chủ lắng nghe. Trên mạng bridge (mặc định cho `docker run` và Compose), hãy giữ `0.0.0.0` (hoặc `::`), nếu không các cổng đã publish sẽ ngừng hoạt động. Trên bản cài đặt native hoặc container dùng mạng host, `127.0.0.1` giữ API tách khỏi mạng; hãy đặt một reverse proxy phía trước để truy cập từ xa. [Chế độ nhúng](#embedded-mode) chỉ hoạt động với `0.0.0.0`, `::` hoặc `127.0.0.1`, vì bước kiểm tra khởi động của nó gọi đến `127.0.0.1`. Với bất kỳ địa chỉ nào khác, kể cả `::1`, container không bao giờ được xem là đã khởi động, và một lần crash sau đó sẽ dừng container thay vì khởi động lại máy chủ. Bất cứ giá trị nào không phải địa chỉ IP, kể cả `localhost`, đều làm máy chủ dừng ngay khi khởi động. |
| `BASE_PATH` | (trống) | Đường dẫn triển khai công khai, ví dụ `/snapotter`. Để trống hoặc `/` sẽ phục vụ ở gốc của tên miền. Được áp dụng khi chạy; không cần build lại image. |
| `RATE_LIMIT_PER_MIN` | `1000` | Số yêu cầu tối đa mỗi phút trên mỗi IP. Đặt là 0 để tắt giới hạn tần suất. |
| `CORS_ORIGIN` | (trống) | Danh sách các origin được phép cho CORS, phân tách bằng dấu phẩy, hoặc để trống để chỉ cho phép cùng origin. |
| `LOG_LEVEL` | `info` | Mức độ chi tiết của log. Một trong: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Những peer nào được phép đặt IP máy khách thông qua `X-Forwarded-For`. Mặc định chỉ tin một peer thuộc mạng riêng, nên reverse proxy trên mạng Docker hoặc LAN được tin cậy còn header giả mạo từ máy khách công khai thì không. Chỉ đặt `true` khi có một proxy do bạn kiểm soát đứng phía trước ở một địa chỉ công khai. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (chưa đặt) | Trả lời trước câu hỏi về analytics ở lần chạy đầu tiên, nên không ai bị hỏi. Nếu chưa đặt, instance mới sẽ hỏi quản trị viên của nó và không gửi gì cho đến khi có câu trả lời. `off` khởi động nó với "Anonymous Product Analytics" đã tắt; `on` khởi động với tùy chọn này đã bật. Biến này chỉ điền giá trị cho cài đặt khi chưa có ai chọn. Khi cài đặt đã được lưu, dù bởi quản trị viên hay bởi biến này, việc thay đổi biến không còn tác dụng gì; quản trị viên vẫn có thể thay đổi nó trong Settings > System > Privacy. |

### Xác thực {#authentication}

Hai giá trị boolean bên dưới chỉ chấp nhận `true` và `false`. Bất cứ giá trị nào khác, `1` hay `yes` hay `on`, đều không qua được bước kiểm tra và máy chủ thoát trước khi bắt đầu lắng nghe.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `AUTH_ENABLED` | `true` | Yêu cầu đăng nhập. Đặt là `false` để chạy mà không có tài khoản nào, điều này cấp quyền quản trị cho mọi yêu cầu, vì vậy chỉ nên dùng trong một mạng đáng tin cậy. |
| `DEFAULT_USERNAME` | `admin` | Tên người dùng cho tài khoản quản trị ban đầu. Chỉ dùng ở lần chạy đầu tiên. |
| `DEFAULT_PASSWORD` | `admin` | Mật khẩu cho tài khoản quản trị ban đầu. Hãy đổi nó sau lần đăng nhập đầu tiên. |
| `MAX_USERS` | `0` (không giới hạn) | Số tài khoản người dùng đã đăng ký tối đa. Đặt là 0 để không giới hạn. |
| `SESSION_DURATION_HOURS` | `168` | Thời hạn phiên đăng nhập tính bằng giờ (mặc định là 7 ngày). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Đặt là `true` để bỏ qua lời nhắc buộc đổi mật khẩu ở lần đăng nhập đầu tiên. |

### Lưu trữ {#storage}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` hoặc `s3`. S3 và MinIO cần giấy phép có tính năng s3_storage cùng các biến `S3_*` bên dưới. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Chuỗi kết nối PostgreSQL, và là kết nối phục vụ mọi yêu cầu. Từ 2.3.0 trở đi, hãy đặt thêm `DATABASE_MIGRATION_URL` và biến này trở thành vai trò runtime có đặc quyền tối thiểu, chỉ nắm DML trên các bảng của ứng dụng và không có gì khác. Ngăn xếp Compose trỏ nó đến dịch vụ `postgres`; để trống nó (cùng với `REDIS_URL`) để dùng chế độ nhúng. |
| `DATABASE_MIGRATION_URL` | (trống) | Kết nối có đặc quyền, chỉ dùng trong lúc khởi động để chạy migration và cấp quyền cho vai trò runtime, sau đó đóng trước yêu cầu đầu tiên. Để trống thì SnapOtter chạy với một vai trò duy nhất, với `DATABASE_URL` đảm nhiệm cả hai việc. Xem [Vai trò đặc quyền tối thiểu](/vi/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Chuỗi kết nối Redis (dùng cho hàng đợi công việc BullMQ). Compose trỏ biến này đến dịch vụ `redis` của nó. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Thư mục cho các tệp tạm trong lúc xử lý. Được dọn dẹp tự động. Image đặt `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Thư mục cho các tệp người dùng lâu dài (hình ảnh đã tải lên, kết quả đã lưu). Image đặt `/data/files`. |

### Lưu trữ đối tượng S3 {#s3-object-storage}

Chỉ được đọc khi `STORAGE_MODE=s3`. Thiếu bất kỳ biến nào trong ba biến bắt buộc và quá trình khởi động thất bại, kèm tên biến bạn đã bỏ sót.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `S3_BUCKET` | (trống) | Bucket chứa các tệp tải lên và đầu ra. Bắt buộc. |
| `S3_ACCESS_KEY_ID` | (trống) | Access key. Bắt buộc. Trong container bạn có thể mount nó thay thế, thông qua `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (trống) | Secret key. Bắt buộc. Cùng quy ước tệp: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region của bucket. |
| `S3_ENDPOINT` | (trống) | Endpoint tùy chỉnh cho MinIO, R2, Backblaze và các kho tương thích S3 khác. Để trống nghĩa là AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Đặt là `true` cho MinIO và bất cứ thứ gì khác muốn `endpoint/bucket/key` thay vì địa chỉ kiểu virtual-host. |
| `S3_PREFIX` | (trống) | Tiền tố khóa, để một bucket có thể chứa nhiều instance. |

### Mã hóa khi lưu trữ {#encryption-at-rest}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (trống) | 64 ký tự hex (32 byte). Mã hóa các cài đặt nhạy cảm được lưu trong cơ sở dữ liệu. Bất cứ giá trị nào không phải 64 ký tự hex đều bị từ chối khi khởi động. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (trống) | Khóa mà bạn đang chuyển đổi khỏi, cùng định dạng. Đặt cả hai trong lúc xoay khóa để các dòng hiện có vẫn giải mã được, rồi bỏ biến này đi. |

### Chế độ nhúng {#embedded-mode}

Chạy image mà không có `DATABASE_URL` và `REDIS_URL` thì nó tự khởi động PostgreSQL 17 và Redis của riêng nó bên trong container, gắn vào loopback, với toàn bộ dữ liệu trên volume `/data`. Cách này khôi phục trải nghiệm một lệnh `docker run` cho khởi động nhanh, homelab và nâng cấp từ 1.x. Đây là con đường tiện lợi, không phải một triển khai production: với production, hãy chạy ngăn xếp Compose 3 container với PostgreSQL và Redis riêng biệt. Chế độ nhúng yêu cầu chạy container bằng root và không tương thích với các runtime UID tùy ý (OpenShift, Kubernetes `runAsNonRoot`); hãy dùng Compose ở những nơi đó.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `EMBEDDED` | `auto` | Tự động bật khi cả `DATABASE_URL` và `REDIS_URL` đều chưa được đặt. Đặt là `0` để tắt (khi đó ứng dụng thất bại nhanh nếu không có `DATABASE_URL`/`REDIS_URL` bên ngoài được đặt, thay vì âm thầm khởi động cơ sở dữ liệu trong container). |
| `REDIS_MAXMEMORY` | `512mb` | Giới hạn bộ nhớ cho Redis nhúng (chỉ ở chế độ nhúng). Hạ thấp nó trên các máy chủ bị hạn chế bộ nhớ như Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Cổng loopback cho PostgreSQL nhúng (chỉ ở chế độ nhúng). Chỉ đổi nó khi container dùng chung một mạng mà cổng 5432 đã bị chiếm, chẳng hạn `--network host`. Nó phải khác `EMBEDDED_REDIS_PORT` và lớn hơn 1023, vì PostgreSQL chạy dưới một người dùng không có đặc quyền, không thể bind vào cổng đặc quyền trên mạng host. |
| `EMBEDDED_REDIS_PORT` | `6379` | Tương tự, cho Redis nhúng, vốn cũng chạy dưới một người dùng không có đặc quyền. |
| `EMBEDDED_DB_PASSWORDS` | (trống) | Đặt là `1` để tạo mật khẩu ngẫu nhiên cho các vai trò PostgreSQL nhúng và Redis ở lần khởi động kế tiếp, được lưu trong `/data/.embedded-db-secrets`. Từ đó, đăng nhập qua TCP cần các mật khẩu này. Trên một volume được tạo lần đầu bởi 2.3.0 trở đi, superuser của PostgreSQL hoàn toàn không thể đăng nhập qua TCP; trên volume cũ hơn, chủ sở hữu cơ sở dữ liệu là superuser, và mật khẩu của nó chính là thứ bảo vệ nó. Hãy dùng biến này bất cứ khi nào có chương trình khác dùng chung mạng của container, chẳng hạn với `--network host`. Nó luôn bật đối với volume đó: mật khẩu được dùng ở mọi lần khởi động ngay cả khi bạn bỏ đặt biến này, và việc xóa `/data/.embedded-db-secrets` chỉ cho bạn mật khẩu mới, hoặc một lần khởi động thất bại nếu biến chưa được đặt. Nếu container không khởi động được vì một trong các tệp đó bị hỏng, hãy xóa tệp đó bằng `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` rồi khởi động lại container; lần khởi động kế tiếp sẽ tạo tệp mới. Biến nhận `1`, `0` hoặc để trống, và bất kỳ giá trị nào khác đều làm dừng quá trình khởi động. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Số giây quá trình khởi động chờ Redis nhúng trả lời `PING` trước khi bỏ cuộc. Khi hết thời gian, container dừng lại và ghi log lý do, thay vì bị treo. Số giây nguyên từ 1 đến 999999; không có giá trị không giới hạn, vì chờ mãi mãi chính là lỗi mà giới hạn này tồn tại để ngăn chặn. Chỉ tăng nó nếu một máy chủ chậm làm nó bị kích hoạt. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Tương tự, cho PostgreSQL nhúng. Đồng hồ bắt đầu sau khi `initdb` ở lần khởi động đầu tiên hoàn tất, nên nó bao gồm việc khởi động máy chủ và khôi phục sau crash thay vì việc tạo cơ sở dữ liệu ban đầu. |

Nâng cấp từ 1.x: đặt `snapotter.db` cũ của bạn tại `/data/snapotter.db` trong volume và chế độ nhúng sẽ nhập nó vào PostgreSQL nhúng ở lần khởi động đầu tiên. Việc nhập chỉ chạy một lần; các lần khởi động sau bỏ qua.

Lưu ý về telemetry: chế độ nhúng thừa hưởng mặc định analytics của image như mọi cấu hình khác. Image được phát hành có thể gửi analytics, nhưng instance mới sẽ hỏi quản trị viên trước và không gửi gì cho đến khi có câu trả lời. Để tắt nó, hãy trả lời không, build với `--build-arg SNAPOTTER_ANALYTICS=off`, đặt `SNAPOTTER_ANALYTICS_DEFAULT=off` trước lần khởi động đầu tiên, hoặc dùng tùy chọn từ chối của quản trị viên trong ứng dụng.

### Giới hạn xử lý {#processing-limits}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (không giới hạn) | Dung lượng tệp tối đa cho mỗi lần tải lên, tính bằng megabyte. Đặt là 0 để không giới hạn. Image được phát hành đi kèm `0`; bản build từ mã nguồn bắt đầu ở 100. |
| `MAX_BATCH_SIZE` | `0` (không giới hạn) | Số tệp tối đa trong một yêu cầu batch. Đặt là 0 để không giới hạn. Image được phát hành đi kèm `0`; bản build từ mã nguồn bắt đầu ở 100. |
| `CONCURRENT_JOBS` | `0` (tự động) | Số công việc batch chạy song song. Đặt là 0 để tự phát hiện dựa trên số lõi CPU khả dụng. |
| `MAX_MEGAPIXELS` | `0` (không giới hạn) | Độ phân giải hình ảnh tối đa được phép tính bằng megapixel. Đặt là 0 để không giới hạn. |
| `MAX_WORKER_THREADS` | `0` (tự động) | Số worker thread tối đa cho xử lý hình ảnh. Đặt là 0 để tự phát hiện dựa trên số lõi CPU khả dụng. |
| `PROCESSING_TIMEOUT_S` | `0` (không giới hạn) | Timeout cho mỗi lần gọi vào Python sidecar chạy các công cụ AI, tính bằng giây. Đặt là 0 để không có timeout. Nó không giới hạn các công việc hình ảnh, PDF hay phương tiện; việc đó do `JOB_TIMEOUT_FAST_S` và `JOB_TIMEOUT_LONG_S` đảm nhiệm. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Số giây Python AI sidecar và runtime OCR chính xác ở trạng thái nghỉ trước khi thoát và giải phóng bộ nhớ (khoảng 1,3 GB và 0,7 GB khi đã khởi động nóng). Cả hai sẽ khởi động lại ở yêu cầu kế tiếp, nên lần gọi AI đầu tiên sau khi thoát do nghỉ phải chịu chi phí khởi động thư viện, mất vài giây. Đặt là 0 để giữ chúng luôn chạy. Giá trị mặc định khớp với `AI_SESSION_IDLE_TIMEOUT`, nên các mô hình đã tải không bị gỡ sớm hơn mức cài đặt đó quy định. Nếu bạn tăng `AI_SESSION_IDLE_TIMEOUT`, hãy tăng biến này cho khớp. |
| `JOB_TIMEOUT_FAST_S` | `120` | Hạn chót cho một công việc trên các pool nhanh (công cụ hình ảnh và tài liệu), tính bằng giây. Công việc chạy lâu hơn sẽ thất bại với lỗi timeout. Đặt là 0 để không giới hạn. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Hạn chót cho một công việc trên các pool dài (công cụ AI và phương tiện, cùng mọi công cụ được đánh dấu là chạy lâu), tính bằng giây. Đặt là 0 để không giới hạn. PDF OCR Balanced và Best tự kéo dài hạn chót của chúng theo số trang (2 và 5 phút mỗi trang), tối đa 6 giờ, nên một PDF lớn không cần tăng biến này. |
| `SYNC_WAIT_MS` | `8000` | Thời gian một yêu cầu công cụ chờ công việc của nó trước khi API ngừng chờ và trả về `202` kèm một job id để theo dõi qua SSE, tính bằng mili giây. Nó không dừng công việc. Đặt là 0 để chờ công việc dù nó mất bao lâu. |
| `MAX_PIPELINE_STEPS` | `20` | Số bước tối đa trong một pipeline. Đặt là 0 để không giới hạn. |
| `MAX_CANVAS_PIXELS` | `0` (không giới hạn) | Kích thước canvas tối đa tính bằng pixel cho hình ảnh đầu ra. Đặt là 0 để không giới hạn. |
| `MAX_SVG_SIZE_MB` | `50` | SVG lớn nhất được chấp nhận trước khi làm sạch, tính bằng megabyte. `0` hoạt động khác ở đây so với các dòng xung quanh. Nó loại bỏ hoàn toàn giới hạn kích thước trước khi phân tích thay vì nâng nó lên, nên hãy để biến này được đặt. |
| `MAX_PDF_PAGES` | `0` (không giới hạn) | Số trang PDF tối đa cho chuyển đổi PDF sang hình ảnh. Đặt là 0 để không giới hạn. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Kích thước lớn nhất của trường `settings` mà một yêu cầu công cụ có thể mang, tính bằng kilobyte, đếm theo byte UTF-8. Yêu cầu vượt giới hạn sẽ nhận `400`. Đặt là 0 để không giới hạn. Cài đặt công cụ thực tế nhỏ hơn 64 KB rất nhiều, nên chỉ tăng giá trị này nếu một client gửi cài đặt lớn bất thường. |

### Engine {#engines}

SnapOtter tìm từng binary xử lý trên `$PATH` bên trong container, nên các biến này để trống trừ khi bạn mount một bản build của riêng mình.

| Biến | Mặc định | Mô tả |
|---|---|---|
| `FFMPEG_PATH` | (trống) | Đường dẫn đến binary `ffmpeg` đứng sau các công cụ video và âm thanh. |
| `FFPROBE_PATH` | (trống) | Đường dẫn đến `ffprobe`, công cụ đọc các tệp phương tiện trước khi chúng được xử lý. Trỏ nó đến cùng bản build với `FFMPEG_PATH`. |
| `QPDF_PATH` | (trống) | Đường dẫn đến `qpdf`, được các công cụ PDF dùng và để kiểm tra các PDF đã tải lên. |
| `SOFFICE_PATH` | (trống) | Đường dẫn đến `soffice` của LibreOffice, dùng cho chuyển đổi tài liệu văn phòng. |
| `PDFCPU_PATH` | (trống) | Đường dẫn đến `pdfcpu`, được một số công cụ PDF dùng. |
| `GS_PATH` | (trống) | Đường dẫn đến `gs` của Ghostscript, được các công cụ PDF và PDF OCR dùng. |
| `PANDOC_PATH` | (trống) | Đường dẫn đến `pandoc`, dùng cho chuyển đổi tài liệu. |
| `SNAPOTTER_FONT_FILE` | (trống) | Tệp phông chữ cho văn bản được vẽ lên video (ghi cứng phụ đề, watermark video). Để trống thì dùng phông chữ đầu tiên mà image tìm thấy. |
| `SNAPOTTER_FONT_FAMILY` | (trống) | Tên họ phông chữ của `SNAPOTTER_FONT_FILE`. Để trống nghĩa là `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (trống) | Họ bộ mã hóa video phần cứng, `nvenc` hoặc `vaapi`. Để trống thì mã hóa bằng phần mềm. |

`SNAPOTTER_HW_ACCEL` cần một ffmpeg được build với họ bộ mã hóa đó, và ffmpeg trong image không có cả hai. Với binary của chính image, cài đặt này chuyển về mã hóa bằng phần mềm và ghi điều đó trong log khởi động. Để dùng nó, hãy mount bản build ffmpeg của riêng bạn, trỏ `FFMPEG_PATH` và `FFPROBE_PATH` đến nó, và cấp thiết bị GPU cho container. Với `nvenc`, cũng hãy đặt `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: image chỉ yêu cầu `compute,utility`, và thiếu `video` thì runtime NVIDIA không mount thư viện mã hóa, nên bộ mã hóa được liệt kê nhưng mọi lần mã hóa đều thất bại. Một override đường dẫn không tồn tại hoặc không thể thực thi cũng được nêu tên trong log khởi động, và mọi công việc cần binary đó đều thất bại cho đến khi bạn sửa đường dẫn hoặc bỏ đặt nó.

Các tệp Compose được phát hành truyền tất cả các biến này từ `.env`, nên đặt chúng ở đó là đủ.

### Dọn dẹp {#cleanup}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Thời gian giữ các kết quả xử lý chưa lưu (tệp tải lên thô và đầu ra của công cụ) trước khi tự động xóa. Các tệp bạn lưu rõ ràng vào thư viện Files không bị ảnh hưởng và tồn tại cho đến khi bạn xóa chúng. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Tần suất chạy công việc dọn dẹp. |

### Giao diện {#appearance}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `DEFAULT_THEME` | `light` | Chủ đề mặc định cho các phiên mới. `light`, `dark` hoặc `system`. |
| `DEFAULT_LOCALE` | `en` | Ngôn ngữ giao diện mặc định. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Bố cục công cụ mặc định. `sidebar` hoặc `fullscreen`. |

### Quyền Docker {#docker-permissions}

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PUID` | `999` | Chạy tiến trình container với UID này. Đặt cho khớp với người dùng máy chủ của bạn khi dùng bind mount (`id -u`). |
| `PGID` | `999` | Chạy tiến trình container với GID này. Đặt cho khớp với nhóm máy chủ của bạn khi dùng bind mount (`id -g`). |

## Ví dụ Docker {#docker-example}

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
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
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

## Volume {#volumes}

Ngăn xếp Docker Compose dùng bốn volume:

- `/data` (app) - Mô hình AI, Python venv và tệp người dùng. Mount volume này để giữ các tệp đã tải lên và AI bundle đã cài qua các lần khởi động lại.
- `/tmp/workspace` (app) - Lưu trữ tạm cho các tệp đang được xử lý. Volume này có thể là tạm thời, nhưng mount nó giúp tránh làm đầy lớp ghi được của container.
- `SnapOtter-pgdata` (postgres) - Thư mục dữ liệu PostgreSQL. Nó chứa toàn bộ dữ liệu quan hệ (người dùng, cài đặt, pipeline, công việc, nhật ký kiểm toán). Sao lưu qua `pg_dump` hoặc snapshot volume.
- `SnapOtter-redisdata` (redis) - Tệp append-only của Redis cho hàng đợi công việc bền vững.
---
description: "Ghi chú phát hành và lịch sử phiên bản của SnapOtter. Xem những gì mới, được cải thiện và được sửa trong mỗi bản phát hành."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 4a5f17b9117c
---

# Nhật ký thay đổi {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 biến bộ công cụ ảnh thành một bộ thao tác tệp đầy đủ: hơn 200 công cụ trải trên năm phương thức (Image, Video, Audio, PDF và Files), được xây dựng lại trên Postgres 17 và một hàng đợi công việc dựa trên Redis, với một `docker run` chỉ bằng một lệnh. Đây là một bản phát hành lớn; hãy đọc phần Thay đổi phá vỡ trước khi nâng cấp từ 1.x.

### Tính năng mới {#new-features}

- **Bốn phương thức công cụ mới**: Video, Audio, PDF và Files gia nhập cùng Image, nâng danh mục lên hơn 200 công cụ.
- **Công việc nền bền vững**: Một hàng đợi dựa trên Redis (BullMQ) chạy mọi công cụ như một công việc được theo dõi với tiến trình SSE trực tiếp.
- **Chế độ một container tất-cả-trong-một**: Một `docker run` khởi động một phiên bản hoàn chỉnh với Postgres và Redis nhúng.
- **Gói AI theo yêu cầu**: Xóa nền, OCR, chuyển giọng nói thành văn bản, phóng to, phát hiện và tăng cường khuôn mặt, xóa vật thể, tô màu và phục chế ảnh cài đặt từ giao diện. Tăng tốc GPU được phát hiện theo từng framework.
- **Ký PDF**: Vẽ, gõ hoặc tải lên chữ ký và đặt nó lên một PDF ngay trong trình duyệt.
- **Automate**: Một trình dựng pipeline trực quan kết nối các công cụ, kèm chín mẫu dựng sẵn.
- **83 preset chuyển đổi một cú nhấp**: Các trình chuyển đổi chuyên dụng như JPG-to-PNG, MP4-to-GIF và tương tự, với tìm kiếm mờ.
- **Trình chỉnh sửa ảnh theo lớp**: Một trình chỉnh sửa dùng Konva tại `/editor` với cọ, hình khối, điều chỉnh, bộ lọc và đường cong.
- **Thư viện Files**: Lưu bất kỳ kết quả nào và tái sử dụng nó làm đầu vào cho một công cụ khác.
- Công cụ được ghim, thu phóng và di chuyển trong khung vẽ, 21 ngôn ngữ và các khả năng doanh nghiệp (OIDC/SSO, SAML, SCIM, lưu trữ S3, quyền theo từng công cụ, xuất nhật ký kiểm toán, truy vết phân tán).

### Cải thiện {#improvements}

- Hủy một tiến trình đang chạy. (#137)
- Giải mã RAW ở độ phân giải đầy đủ qua LibRaw, bao gồm cả DNG. (#289)
- Triển khai không phải root và với UID ngoại lai (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Phát hiện cài đặt AI chính xác và một luồng cài đặt được gia cố. (#214, #352)
- Gia cố quyền riêng tư: không có luồng ra bên thứ ba tự động, cùng một chế độ ngoại tuyến nghiêm ngặt tùy chọn.
- Nút phản hồi luôn hiển thị, ngay cả khi tắt phân tích.

### Sửa lỗi {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` vô hiệu hóa giới hạn tốc độ cho các tuyến công cụ trở lại. (#271)
- Sửa các đường dẫn virtualenv AI bên trong image Docker. (#390)
- Tương thích với sharp 0.35.2+. (#362)
- Các sửa lỗi bố cục trình chỉnh sửa ảnh: thước, hành vi tô, thanh bên và định cỡ khung vẽ. (#258, #259)
- Hoàn thành bản dịch tiếng Ý. (#231, #206, #425)
- Chuẩn hóa âm thanh và loudnorm giữ nguyên tần số lấy mẫu gốc.
- Gia cố SSRF: so khớp CIDR IPv6 dạng số và mở rộng quét URL trước. (#287)
- Các PDF được tạo ra được đóng dấu SnapOtter làm Producer.
- mediapipe cài đặt được trên Python 3.13 và Debian 13.

### Thay đổi phá vỡ {#breaking-changes}

2.0 thay thế cơ sở dữ liệu SQLite nhúng bằng Postgres 17 và bổ sung Redis 8 cho hàng đợi công việc. Dữ liệu 1.x của bạn di trú tự động ở lần khởi động đầu tiên, nhưng ngăn xếp container đã thay đổi, vì vậy hãy sao lưu toàn bộ volume `/data` của bạn trước (1.x chạy SQLite ở chế độ WAL, nên dữ liệu đã cam kết thường nằm trong `snapotter.db-wal`). Sau đó hãy chọn image một container (Postgres và Redis nhúng, chỉ dành cho root) hoặc ngăn xếp Compose (ứng dụng cộng với Postgres 17 và Redis 8). Xem [hướng dẫn di trú](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) và [hướng dẫn nâng cấp](/vi/guide/upgrading).

### Nâng cấp {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ khác biệt trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Công cụ HTML to Image mới, khả năng tiếp cận WCAG 2.2 AA, gia cố bảo mật từ kiểm thử xâm nhập, và 5 sửa lỗi Docker quan trọng.

### Tính năng mới {#new-features-1}

- **HTML to Image**: Chụp ảnh màn hình của các URL hoặc HTML thô dưới dạng PNG/JPEG/WebP. Chụp toàn trang, viewport tùy chỉnh, chế độ tối.
- **Quy ước bí mật _FILE của Docker**: Gắn các biến môi trường nhạy cảm dưới dạng tệp thay vì văn bản thuần. (#205)
- **Cấp phép doanh nghiệp và lưu trữ S3**: Khóa giấy phép thương mại tùy chọn và lưu trữ đối tượng tương thích S3.
- **Cải thiện trình chỉnh sửa hình khối**: Độ trong suốt của tô/nét, bảng chọn màu RGBA, kiểu đường nét đứt.
- **Gói phát hành dựng sẵn**: Tải các tarball từ GitHub Releases cho các bản cài đặt không dùng Docker (Proxmox, máy vật lý, LXC). (#202)

### Cải thiện {#improvements-1}

- **Khả năng tiếp cận WCAG 2.2 AA**: Bỏ qua điều hướng, giữ bẫy tiêu điểm, vùng aria-live, hỗ trợ giảm chuyển động, tỉ lệ tương phản đúng. (#209)
- **Khả năng đáp ứng trên di động**: Cài đặt đáp ứng, SSE tự kết nối lại khi chuyển tab trên di động. (#203, #204)
- **Chất lượng xóa nền**: Làm mượt cạnh, khử nhiễm màu, chọn định dạng đầu ra.
- **Bản dịch tiếng Ý**: khoảng 145 chuỗi mới bởi @albanobattistella. (#206)
- **Tài liệu API theo từng công cụ**: 53 trang tài liệu với tham số, ví dụ và định dạng phản hồi.
- **Tải mô hình AI**: Logic thử lại với thoái lui theo cấp số nhân cho HuggingFace. (#201)

### Sửa lỗi {#bug-fixes-1}

- Các container Docker mới hoàn toàn không dùng được (giới hạn tốc độ chặn mọi yêu cầu).
- Các công cụ AI phát hiện khuôn mặt (blur-faces, red-eye-removal, enhance-faces, passport-photo) thất bại trên mọi nền tảng.
- Tệp HEIC hỏng trên ARM (không khớp ký hiệu libheif).
- Các gói AI upscale và restore-photo không cài đặt được trên ARM.
- OCR dùng sai phiên bản CUDA trên các container GPU.
- Vượt qua lá chắn SSRF qua địa chỉ IPv6 dạng hex ánh xạ IPv4. (Ghi công: @tonghuaroot)
- Giải mã HEIC của iPhone với ảnh phụ trợ. (#183, #199)
- Real-ESRGAN CUDA OOM trên các GPU 8GB. (#200)
- 6 lỗi Sentry sản xuất và 7 lỗi QA. (#208)

### Bảo mật {#security}

- Xử lý 10 phát hiện kiểm thử xâm nhập (vượt qua XFF, sự cố JSON dị dạng, pipeline không giới hạn, XSS nhật ký kiểm toán, phương thức TRACE, và hơn thế). (#207)
- Chặn vượt qua SSRF IPv6 dạng hex. (Ghi công: @tonghuaroot)
- Các image cơ sở trong Dockerfile được ghim theo digest.

### Nâng cấp {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ khác biệt trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Bản demo trực tiếp, các trang đích theo từng công cụ, và một loạt sửa lỗi trau chuốt.

### Tính năng mới {#new-features-2}

- **Bản demo trực tiếp** - [demo.snapotter.com](https://demo.snapotter.com) cho phép mọi người thử SnapOtter mà không cần cài đặt gì.
- **Trang chỉ mục công cụ** - Duyệt toàn bộ hơn 50 công cụ tại `/tools` với tìm kiếm và bộ lọc theo danh mục.
- **Hơn 50 trang đích SEO** - Mỗi công cụ giờ đây có một trang đích chuyên dụng với FAQ, tình huống sử dụng và bảng so sánh.
- **Xem trước nền** - Thanh trượt trước-sau hiển thị nền kẻ ô phía sau các ảnh trong suốt.
- **Trình tạo mật khẩu mạnh** - Nút một cú nhấp trong biểu mẫu Thêm thành viên.

### Sửa lỗi {#bug-fixes-2}

- Công cụ thông tin HEIC/HEIF không còn thất bại (đã thêm bước giải mã trước).
- Cài đặt gói mô hình AI hiển thị thông báo lỗi tốt hơn và tôn trọng giới hạn tài nguyên.
- Ảnh thu nhỏ trong thư viện tải đúng (thiếu các header xác thực).
- Các menu thả xuống không còn bị cắt trong các bảng cài đặt People và Teams.
- Ẩn phần trăm so sánh kích thước trên các công cụ không phải nén.
- Xóa liên kết chính sách quyền riêng tư trùng lặp.
- Thêm bản dịch tiếng Ý cho cài đặt tính năng AI.
- Cập nhật các biểu tượng Lucide được đổi tên (Wand2, Columns).

### Hạ tầng {#infrastructure}

- OpenSSF Scorecard được gia cố từ 4.3 lên khoảng 7.0.
- Kiểm thử CI được song song hóa thành 4 phân đoạn với các fixture thu nhỏ.
- 41 bản cập nhật phụ thuộc.

### Nâng cấp {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ khác biệt trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Năm công cụ mới, một trình chỉnh sửa ảnh đầy đủ, đăng nhập SSO, 20 ngôn ngữ. Lẽ ra nên là ba bản phát hành riêng, nhưng nó là như vậy.

### Tính năng mới {#new-features-3}

- **Trình chỉnh sửa ảnh** - Lớp, cọ, hình khối, điều chỉnh, bộ lọc, đường cong, phím tắt. Chạy trong trình duyệt của bạn, xử lý trên phần cứng của bạn.
- **Xác thực OIDC / SSO** - Đăng nhập với Google, GitHub, Okta, hoặc bất kỳ nhà cung cấp OpenID Connect nào. Đặt vài biến môi trường và nhóm của bạn dùng tài khoản sẵn có.
- **Trình tạo meme** - 100 mẫu tích hợp sẵn với kết xuất văn bản qua opentype.js. Hoặc tải lên ảnh của riêng bạn.
- **Beautify** - Thả một ảnh chụp màn hình vào, nhận ra một ảnh được trau chuốt. Khung thiết bị (macOS, Windows, trình duyệt), đổ bóng, dải màu, các preset mạng xã hội.
- **Mô phỏng mù màu** - Xem trước ảnh trông thế nào với chứng mù màu đỏ, mù màu lục, mù màu lam và các khiếm khuyết thị giác màu khác.
- **Trình sửa độ trong suốt PNG** - Phát hiện các PNG giả trong suốt và sửa chúng bằng BiRefNet HR-matting. Tùy chọn xóa watermark qua LaMa inpainting.
- **Mở rộng khung vẽ bằng AI** - Mở rộng ranh giới ảnh với phần điền bằng AI. Ba bậc chất lượng (nhanh, cân bằng, chất lượng) tùy theo lượng thời gian GPU bạn muốn đánh đổi.
- **20 ngôn ngữ** - Tiếng Ả Rập, Tiếng Trung (Giản thể/Phồn thể), Tiếng Séc, Tiếng Hà Lan, Tiếng Pháp, Tiếng Đức, Tiếng Hindi, Tiếng Indonesia, Tiếng Ý, Tiếng Nhật, Tiếng Hàn, Tiếng Ba Lan, Tiếng Bồ Đào Nha, Tiếng Nga, Tiếng Tây Ban Nha, Tiếng Thái, Tiếng Thổ Nhĩ Kỳ, Tiếng Ukraina, Tiếng Việt. RTL hoạt động cho tiếng Ả Rập.
- **Nhập từ URL** - Dán các URL vào vùng thả hoặc nhập hàng loạt từ một danh sách. Truy xuất phía máy chủ với bảo vệ SSRF.
- **Tẩy xóa nhiều tệp** - Vẽ các mặt nạ xóa trên nhiều ảnh, xử lý tất cả chỉ bằng một cú nhấp. Các nét vẽ được giữ lại theo từng ảnh.
- **Nhập/xuất pipeline** - Lưu các chuỗi công cụ dưới dạng JSON, chia sẻ với người khác.
- **17 định dạng RAW máy ảnh mới** qua exiftool, cùng đầu vào QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ và APNG. Các codec đầu ra mới cho BMP, ICO, JP2, QOI. Xuất AVIF, TIFF, GIF, JXL và PSD được khôi phục từ một nhánh đã mất trước đây.

### Cải thiện {#improvements-2}

- **Tăng cường ảnh** - Thay pipeline cũ bằng CLAHE + normalise + gamma. Công tắc Deep Enhance mới dùng mô hình AI để cho kết quả mạnh mẽ hơn.
- **Phục chế ảnh** - Viết lại phần phát hiện vết xước với lọc Otsu 8 góc. LaMa inpainting giờ chạy ở độ phân giải gốc.
- **Định dạng lạ ở khắp nơi** - OCR, image-to-PDF, trình tạo favicon, ghép, khâu và vector hóa nay đều giải mã HEIC, RAW, PSD.
- **Nén** - Dung sai kích thước mục tiêu được siết từ 5% xuống 1%. Kích thước mục tiêu là chế độ mặc định. Thêm nút tăng giảm và bộ chọn đơn vị KB/MB.
- **Dọn dẹp Sentry** - Lọc 644 sự kiện không thể xử lý. Các lỗi thật giờ được xử lý đúng cách.
- **Phát hiện GPU** - Chẩn đoán tốt hơn cho các container nơi có CUDA nhưng không có nvidia-smi.
- **Chế độ tắt xác thực** - Người dùng ẩn danh được gieo vào cơ sở dữ liệu với vai trò admin. Khóa API, pipeline và tệp người dùng không còn hỏng do ràng buộc FK.
- **Hơn 2.705 kiểm thử mới** trải trên unit, integration và E2E.

### Sửa lỗi {#bug-fixes-3}

- Upscale trên CPU không còn hết thời gian trên các hộp NAS và phần cứng công suất thấp.
- Logo mã QR không còn khiến bản xem trước biến mất vĩnh viễn.
- Sửa tràn khi cắt cho các ảnh chân dung cao.
- Các tệp TIFF có alpha buộc đầu ra PNG đúng cách thay vì tạo ra hỏng hóc.
- Giải mã HDR/EXR chuyển sang 8-bit trước CLAHE, sửa các lỗi giải mã.
- Các buffer đầu vào của điểm mốc khuôn mặt được chuyển thành PNG trước sidecar Python, sửa các sự cố.
- Tìm trùng lặp xử lý các lô hỗn hợp định dạng và lỗi mạng.
- Bản xem trước Beautify cập nhật theo thời gian thực.
- Thanh tiến trình cho khâu và vector hóa.
- SVGZ được xử lý bởi SVG-to-raster.
- Sửa các tên tệp không phải ASCII qua header X-File-Results mã hóa phần trăm.

### Nâng cấp {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ khác biệt trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker hợp nhất với tự động phát hiện GPU. Một image xử lý cả khối lượng công việc CPU và GPU. Đơn giản hóa compose thành một tệp duy nhất với xoay vòng nhật ký. Việc tải trước mô hình nay bao gồm kiểm tra và một bài kiểm thử nhanh.

---

## v1.13.0 {#v1-13-0}

Kiểm soát truy cập dựa trên vai trò (RBAC). 14 quyền chi tiết, ba vai trò tích hợp sẵn (admin, editor, user), hỗ trợ vai trò tùy chỉnh. Kiểm tra quyền trên mọi tuyến API. Các tab giao diện được lọc theo quyền người dùng.

---

## v1.12.0 {#v1-12-0}

Công cụ PDF to Image. Chuyển các trang PDF thành PNG, JPEG, WebP hoặc TIFF ở DPI tùy chỉnh. Image Docker hợp nhất với tự động phát hiện GPU.

---

## v1.11.0 {#v1-11-0}

Tự động tạo llms.txt qua vitepress-plugin-llms cho tài liệu thân thiện với AI.

---

## v1.10.0 {#v1-10-0}

Thay đổi kích thước nhận biết nội dung (seam carving) với bảo vệ khuôn mặt. Thay đổi kích thước ảnh trong khi giữ lại nội dung quan trọng.

---

## v1.9.0 {#v1-9-0}

Công cụ Khâu / Ghép. Nối các ảnh cạnh nhau, xếp chồng theo chiều dọc, hoặc theo một lưới tùy chỉnh.

---

## v1.8.0 {#v1-8-0}

Công cụ Chỉnh sửa Metadata. Xem và chỉnh sửa metadata EXIF, IPTC và XMP với một giao diện tước/giữ chi tiết.

---

## Các bản phát hành cũ hơn {#older-releases}

Để xem nhật ký thay đổi đầy đủ ở cấp commit bao gồm các bản vá, xem [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).

---
description: "Ghi chú phát hành và lịch sử phiên bản của SnapOtter. Xem những gì mới, được cải thiện và được sửa trong từng bản phát hành."
i18n_source_hash: 76c6d18aedb4
i18n_provenance: machine
i18n_output_hash: b9c851afe7bf
i18n_hash_version: 2
---

# Nhật ký thay đổi {#changelog}

## Chưa phát hành {#unreleased}

### Không còn được khuyến nghị {#unreleased-deprecated}

- **Năm thao tác nén ảnh về dung lượng cố định không còn được khuyến nghị.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb` và `-500kb` được đánh dấu deprecated trong đặc tả OpenAPI và sẽ được giữ lại ít nhất một bản phát hành phụ. Hãy gửi `POST /api/v1/tools/image/compress` với `settings` đặt là `{"mode":"targetSize","targetSizeKb":20}` (hoặc 50, 100, 200, 500). Kết quả đầu ra là như nhau. Các đường dẫn preset PDF không thay đổi.

## v2.3.0 {#v2-3-0}

SnapOtter vừa vượt một triệu lượt pull image trên Docker Hub và GHCR, cùng 3.000 sao trên GitHub. Đó là rất nhiều máy chủ tự lưu trữ, nên bản phát hành này là lời cảm ơn của chúng tôi gửi đến tất cả những ai đang vận hành chúng.

Hãy nâng cấp sớm. Bản 2.3.0 đóng sáu advisory bảo mật, trong đó có một advisory mức độ cao. Chi tiết nằm ở phần Bảo mật bên dưới.

Ngoài các bản sửa lỗi, còn có các công cụ mới: trình chỉnh sửa trang PDF Multi-Tool, các preset nén theo dung lượng mục tiêu chỉ bằng một cú nhấp cho hình ảnh và PDF, và sắp xếp thứ tự trang bằng kéo và thả trong Organize PDF. OCR giờ đã đọc được tiếng Ả Rập, và pdf-to-text đề nghị chạy OCR khi gặp PDF dạng quét. SnapOtter có thể chạy dưới một subpath như `/snapotter` phía sau reverse proxy. Ứng dụng không còn cần superuser của Postgres để chạy. Quản trị viên bị khóa tài khoản có thể khôi phục từ dòng lệnh. Phần còn lại là khoảng 1.400 bản sửa lỗi, phần lớn cho các vấn đề do các bạn báo cáo.

> [!IMPORTANT]
> Cả sáu advisory bên dưới đều ảnh hưởng đến 2.2.0, và một số còn ảnh hưởng ngược đến 2.0.0. Nếu bạn dùng chung một instance với người dùng khác hoặc mở nó ra ngoài mạng của riêng mình, hãy nâng cấp.

### Bảo mật {#v2-3-0-security}

- **Tệp SVG tải lên có thể bỏ qua bước làm sạch (GHSA-9c7h-xjrp-8gh3, cao).** Một SVG bị bộ giải mã hình ảnh từ chối sẽ được lưu và phục vụ nguyên trạng thay vì được làm sạch. Bị ảnh hưởng: 2.2.0 trở về trước. Được báo cáo bởi @xaferima. (#1211)
- **Luồng tiến trình công việc không kiểm tra ai đang yêu cầu (GHSA-ff22-w6x2-fm98, trung bình).** Giờ đây luồng này yêu cầu đăng nhập và quyền sở hữu công việc. Bị ảnh hưởng: 2.0.0 đến 2.2.0. (#1750)
- **Liên kết tải kết quả cũng phục vụ cả tệp gốc đã tải lên (GHSA-jgv3-2jc6-f628, trung bình).** Bị ảnh hưởng: 2.2.0 trở về trước. Được báo cáo bởi @emirhancatkin. (#3623)
- **Ảnh hộ chiếu và các hiệu ứng nền tin vào job id do máy khách cung cấp (GHSA-3c8g-8v4x-qq9j, trung bình).** Bị ảnh hưởng: 2.2.0 trở về trước. Được báo cáo bởi @shaoyuuuuu. (#3623)
- **Nhập từ URL, tải lên và xem trước bỏ qua việc kiểm tra quyền theo vai trò và theo khóa API (GHSA-8xxr-g2w8-7f9r, trung bình).** Bị ảnh hưởng: 2.2.0 trở về trước. Được báo cáo bởi @nguyenvantiennani. (#3780, #707)
- **SSO enforcement làm lộ tên người dùng break-glass (GHSA-q6fg-vvw9-cr8r, thấp).** Một lần đăng nhập cục bộ bị từ chối giờ nhận cùng mã 401 như mọi lần đăng nhập thất bại khác. Bị ảnh hưởng: 2.0.0 đến 2.2.0. (#2148)
- **Postgres không còn chạy bằng superuser.** Ứng dụng giờ kết nối bằng một vai trò chỉ có thể đọc và ghi dữ liệu. Migration dùng một kết nối riêng, không bắt buộc. Xem Ghi chú nâng cấp. (#918)
- **Các phụ thuộc đã được vá**: ngưỡng override của dompurify và handlebars được nâng lên các phiên bản đã sửa. (#4247)

### Tính năng mới {#v2-3-0-new-features}

- **PDF Multi-Tool**: trình chỉnh sửa trang cho phép sắp xếp lại, nhân bản, xoay và xóa trang, cũng như kéo trang từ các PDF khác vào. Máy chủ ghép tệp cuối cùng. (#1338)
- **Nén về dung lượng mục tiêu chỉ bằng một cú nhấp**: năm preset hình ảnh (20, 50, 100, 200, 500 KB) và năm preset PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Chạy SnapOtter dưới một subpath**: đặt `BASE_PATH=/snapotter` và cùng một image sẽ phục vụ từ đó. Liên kết kết quả, cookie, chuyển hướng SSO và tài liệu API đều theo subpath này. (#1252, #1324)
- **OCR tiếng Ả Rập**: chọn tiếng Ả Rập một cách rõ ràng, hoặc để chế độ tự động nhận diện. Hoạt động với OCR hình ảnh và PDF. (#4130, #4183)
- **pdf-to-text đề nghị chạy OCR** khi một PDF, hoặc cả một lô, không có lớp văn bản, thay vì trả về một tệp rỗng. (#4142, #4198)
- **Sắp xếp thứ tự trang bằng kéo và thả trong Organize PDF**, hỗ trợ chuột và cảm ứng. (#1249, #2601)
- **Sắp xếp lại tệp trước khi chạy nhiều tệp**: merge, stitch, collage và các công cụ nhiều tệp khác giữ đúng thứ tự bạn đã đặt. (#756, #757)
- **Hủy các lần chạy batch và pipeline**, và công việc thực sự dừng lại trên máy chủ. (#807)
- **Lệnh khôi phục `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` và đặt lại MFA, dành cho quản trị viên bị khóa khỏi giao diện web. (#4016)
- **Đăng ký MFA ngay khi đăng nhập**: khi MFA là bắt buộc, người dùng chưa thiết lập sẽ được thiết lập ngay tại chỗ thay vì bị chặn.
- **Chụp ảnh bằng camera và ứng dụng có thể cài đặt**: chụp ảnh trực tiếp vào một công cụ trên thiết bị di động, và cài SnapOtter như một PWA. (#773)
- **Phần đệm trong suốt trong hộp thoại Canvas Size của trình chỉnh sửa.** (#4111)
- **Thông báo cập nhật cho quản trị viên**: khi có bản SnapOtter mới hơn, quản trị viên thấy một thông báo có thể đóng kèm liên kết đến ghi chú phát hành. Việc kiểm tra chạy qua kết nối analytics hiện có, nên sẽ tắt khi analytics bị tắt.

### Cải tiến {#v2-3-0-improvements}

- **Xóa nền nhanh hơn ở các lần chạy lặp lại**: mô hình được giữ nạp giữa các yêu cầu thay vì nạp lại mỗi lần. (#4144)
- **Tải lên hàng loạt dùng ít bộ nhớ hơn nhiều**: mỗi tệp được ghi vào đĩa tạm và được xử lý lần lượt từng tệp thay vì nằm trong RAM. (#2687)
- **Cài đặt AI bundle thất bại gọn gàng và được hoàn tác** thay vì để lại một venv cài dở. Việc cài xóa nền trên Proxmox LXC hoạt động trở lại, và các máy chủ ít bộ nhớ được đặt giới hạn CPU hợp lý trước khi một công việc bắt đầu. (#2628, #2597, #2526, #2546)
- **Nhận diện GPU đáng tin cậy hơn**: CUDA được phát hiện thông qua driver, card dòng RTX 50 chuyển sang CPU thay vì thất bại, và các bộ mã hóa video phần cứng được chạy thử trước khi sử dụng. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` giờ đã hoạt động**. Trước đây nó được phân tích nhưng chưa bao giờ được áp dụng. (#3249)
- **Các công cụ chạy lâu được dùng timeout dài**: pdf-to-word, compress-pdf, convert-document và content-aware resize không còn hết thời gian sớm trên các tệp lớn. (#3276)
- **Compress PDF giữ cho bản quét vẫn đọc được**, và báo rõ khi không thể đạt dung lượng mục tiêu thay vì tạo ra một tệp không đọc được. (#4112)
- **Đăng nhập thất bại bị giới hạn theo tên người dùng**: hơn mười lần trong mười lăm phút sẽ nhận mã 429 kèm `Retry-After`. (#827)
- **Lỗi nói rõ điều gì đã xảy ra**: thiếu binary, lỗi lưu trữ, tiến trình bị kill do hết bộ nhớ và giới hạn tải lên giờ có thông báo cụ thể thay vì một mã 500 hay 422 trống.
- **Nhật ký kiểm toán bao gồm các lần chạy công cụ, batch và pipeline**, và các sự kiện về người dùng, vai trò, nhóm và GDPR ghi lại ai đã làm gì với ai. (#3991, #3984)
- **Container all-in-one dừng lại khi lần khởi động đầu tiên bị lỗi** thay vì khởi động lại mãi mãi, và Postgres cùng Redis nhúng có thời hạn khởi động. (#3008, #1130)
- **Ngày tháng và số nhiều theo ngôn ngữ của bạn**, và những chuỗi tiếng Anh cuối cùng được mã hóa cứng đã được dịch.
- **Trau chuốt cho thiết bị di động và trình chỉnh sửa**: bố cục thanh trượt, Sign PDF và cắt ảnh trên điện thoại, kéo bằng cảm ứng, cọ pixel nhanh hơn, và Levels cùng Curves nằm trong undo và tự động lưu.

### Sửa lỗi {#v2-3-0-bug-fixes}

- **Adjust Colors kết hợp các cài đặt sai**: nhiệt độ màu, độ bão hòa, sắc độ, độ tương phản và sepia ghi đè lẫn nhau thay vì cộng dồn. (#3153, #3120, #3469)
- **Pixelate không tạo hiệu ứng pixel**, và đầu ra PNG âm thầm bị giảm bảng màu trên các công cụ hình ảnh. (#709, #716)
- **GIF và WebP động bị mất khung hình** ở một số công cụ, và bảng màu cùng độ trong suốt của GIF cho kết quả sai. (#1184, #1225, #3407, #2573)
- **Ảnh tải lên bị xoay làm giảm chất lượng**: auto-orient làm mất mã hóa không mất dữ liệu, độ trong suốt và độ sâu 16-bit. WebP động giờ xoay mọi khung hình. (#2384, #2529)
- **TIFF có độ trong suốt, tệp AV1 HEIF và một số định dạng RAW** bị lỗi hoặc mất kênh alpha. (#2609, #2572, #1120)
- **Đổi kích thước canvas trong trình chỉnh sửa làm co giãn hình ảnh** thay vì thêm khoảng trống xung quanh. (#2081)
- **Tên tệp đầu ra bị xáo trộn**: `.jpeg` và `.tif` bị biến thành tên khác, và các dotfile hoặc tên lặp lại phần mở rộng bị hỏng. (#3495, #3382)
- **Tự động lưu vào thư viện bỏ qua hạn mức lưu trữ**, và bộ đếm lưu trữ có thể âm. (#2389, #2585)
- **Các công việc bị kẹt sau khi khởi động lại** giờ được xử lý dứt điểm khi khởi động thay vì hiển thị "đang xử lý" mãi mãi. (#3219, #3193)
- **Đăng nhập OIDC đặt tên mọi người dùng mới là "admin"**, và đăng nhập trên iOS Safari kết thúc ở trang lỗi dù đã thành công. (#862, #4021)
- **Các quy tắc mật khẩu đã tắt vẫn bị áp dụng** khi tạo người dùng. (#1028)
- **PDF hỏng bị treo 30 giây** trước khi báo lỗi. (#920)
- **Kiểm tra dung lượng đĩa cho AI bundle yêu cầu khoảng 18 GB** để cài một bundle duy nhất. (#1248)
- **Compress Video thất bại với bản ghi màn hình có tốc độ khung hình thay đổi.** (#2427)
- **Xóa nền hàng loạt làm mất các kết quả đã hoàn tất** khi trình duyệt gửi lại yêu cầu. (#2015)
- **Các ô nhập số trong Settings không thể xóa** khi đang gõ. (#1449)
- **Tắt analytics vẫn để lại các sự kiện trong hàng đợi** và gửi chúng khoảng 30 giây sau đó. Giờ chúng bị loại bỏ khi bạn từ chối. (#4270)

### Ghi chú nâng cấp {#v2-3-0-upgrade-notes}

Migration tự chạy khi khởi động. Bạn không cần chạy bất kỳ câu lệnh SQL nào.

- **Vai trò cơ sở dữ liệu.** Tệp Compose chuẩn giờ cấp cho ứng dụng một vai trò chỉ có thể đọc và ghi dữ liệu (`DATABASE_URL`) và một kết nối có đặc quyền riêng (`DATABASE_MIGRATION_URL`) chỉ được dùng lúc khởi động cho migration và cấp quyền. Tệp Compose hiện có vẫn hoạt động như trước: để `DATABASE_MIGRATION_URL` không được đặt và SnapOtter chạy với một vai trò duy nhất. Với triển khai không chạy cục bộ, hãy đặt `POSTGRES_APP_PASSWORD` cùng với `POSTGRES_PASSWORD`.
- **Kiểm tra khởi động chặt chẽ hơn.** Trước đây những lỗi này xuất hiện muộn hơn, hoặc âm thầm. Giờ chúng dừng container kèm một thông báo nêu tên biến: `DEFAULT_LOCALE` không được hỗ trợ (hãy dùng một mã được hỗ trợ như `de`, không phải `de_DE`), `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` hoặc `OIDC_ISSUER_URL` sai định dạng khi SSO được bật, danh sách `TRUST_PROXY` không hợp lệ, `BASE_PATH` sai, và `LOG_DIR` không ghi được.
- **`TRUST_PROXY` không còn nhận số hop.** Một số như `TRUST_PROXY=2` giờ dừng container khi khởi động thay vì âm thầm không tin proxy nào. Hãy đặt nó thành các địa chỉ proxy hoặc dải được đặt tên (mặc định là `loopback,linklocal,uniquelocal`), `false` khi không có gì làm proxy cho SnapOtter, hoặc `true` chỉ khi một proxy do bạn kiểm soát nằm phía trước ở một địa chỉ công khai. (#998)
- **`MAX_WORKER_THREADS` giờ đã có hiệu lực.** Nếu trước đây bạn đã đặt nó và không thấy thay đổi, giờ bạn sẽ thấy.
- **Mã trạng thái API.** Lỗi engine và lưu trữ trả về 503 `ENGINE_UNAVAILABLE` (các endpoint batch trước đây trả về 422). Tải lên vượt giới hạn trả về 413 (trước là 400). `clientJobId` sai định dạng trả về 400 và một giá trị dùng lại trả về 409 (trước là 500). Phát lại batch pipeline của chính bạn trả về 202. `mode=targetSize` không có `targetSizeKb` trả về 400. Đăng nhập cục bộ bị từ chối khi SSO enforcement trả về 401 thay vì 403 `SSO_ENFORCED`. Đăng nhập bị giới hạn tần suất trả về 429 `LOGIN_THROTTLED`. Kết quả remove-background không còn bao gồm `originalUrl`.
- **Biến tùy chọn mới**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (mặc định 15 phút, `0` để tắt), `EMBEDDED_REDIS_TIMEOUT_S` (180) và `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Tệp Compose đi kèm bản phát hành.** `docker-compose.yml` và `docker-compose-gpu.yml` được đính kèm trong bản phát hành này, nên bạn có thể tải thẳng từ trang phát hành.

### Lời cảm ơn {#v2-3-0-acknowledgements}

Một triệu lượt pull nghĩa là rất nhiều người đã báo lỗi, gửi bản sửa và cho chúng tôi biết còn thiếu gì. Bản phát hành này phần lớn là công sức của họ.

Mã nguồn và đóng góp:

- **@zakka258** ❤️: Xây dựng trình chỉnh sửa trang PDF Multi-Tool và triển khai theo subpath, hai trong số những tính năng lớn nhất của bản phát hành này, bao gồm cả các bài kiểm thử cho xác thực và SSO dưới subpath. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Xây dựng các preset hình ảnh nén theo dung lượng mục tiêu chỉ bằng một cú nhấp, sửa việc đồng thời và dọn dẹp của bản xem trước, và ngăn bộ nhớ trình duyệt bị chặn làm treo vòng quay đăng nhập. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Thêm sắp xếp lại trang bằng kéo và thả vào Organize PDF, điều mà họ đã yêu cầu từ trước trong Discussions. (#1249, #965)
- **@drakeo338** ❤️: Mười bản sửa trên toàn hệ thống, gồm auto-orient giữ nguyên định dạng và chất lượng, nhóm SCIM được tạo trong một transaction, cài AI dưới cgroup v2, và lỗi 5xx không còn bị che thành 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Thêm phần đệm canvas trong suốt cho trình chỉnh sửa, sửa các kết luận lỗi thời về dung lượng mục tiêu của Compress PDF, và cho phép cập nhật một phần nhóm. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Ngăn các instance tự lưu trữ gửi dữ liệu heatmap, kiểm tra `TRUST_PROXY` khi khởi động thay vì để bị crash, và sửa cách xử lý tên nhóm SCIM và timeout của qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Biến nhiều lỗi 500 thành các phản hồi 400 và 409 đúng nghĩa cho job id và lần nhập multipart sai định dạng, và sửa việc xóa ô nhập số trong Settings. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Làm cho việc đọc mã vạch hoạt động ngoại tuyến bằng cách đóng gói sẵn bộ giải mã, sửa lỗi xem trước phương tiện hiển thị đầu vào, và cải thiện tìm kiếm định dạng. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Báo cáo và sửa lỗi Compress Video thất bại với bản ghi màn hình có tốc độ khung hình thay đổi. (#2426, #2427)
- **@dvd233** ❤️: Mở ra mọi định dạng RAW của máy ảnh mà bộ giải mã hỗ trợ, và làm cho các công cụ favicon xuất hiện khi tìm kiếm ICO. (#1120, #1121)
- **@bercedev** ❤️: Sửa các tên tệp có phần tên lặp lại phần mở rộng, và làm cho AI báo cáo đúng thiết bị mà nó thực sự chạy trên đó. (#3382, #3613)
- **@pamod-madubashana** ❤️: Dịch tiêu đề MFA cuối cùng chỉ có tiếng Anh và nối các chuỗi tiến trình chưa được dùng. (#1228, #1227)
- **@mvanhorn** ❤️: Sửa việc cấp trùng tên người dùng khi đăng nhập SAML. (#2640)
- **@peremunoz** ❤️: Ngăn việc tạo mã vạch che giấu lỗi lưu trữ và bộ nhớ thành "Invalid text". (#4057)
- **@mayuriphad** ❤️: Sửa lỗi crash với header xác thực cảnh báo đã lưu bị sai định dạng. (#3080)
- **@DevShoaib78** ❤️: Sửa việc đóng đường lasso đa giác trong trình chỉnh sửa. (#1207)
- **@dltsum** ❤️: Chuyển các hiển thị tiến trình sang danh mục thông điệp dùng chung. (#1262)
- **@albanobattistella** ❤️: Sửa bản dịch. (#1024)
- **@shoaibyazdani** ❤️: Tạo lại các baseline hình ảnh cho macOS. (#2475)

Công bố bảo mật:

- **@xaferima** ❤️: Phát hiện rằng các SVG bị bộ giải mã từ chối bỏ qua bước làm sạch, và cùng chúng tôi phân tích mức độ ảnh hưởng. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Phát hiện rằng liên kết kết quả cũng phục vụ cả tệp gốc đã tải lên. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Phát hiện rằng ảnh hộ chiếu và các hiệu ứng nền tin vào job id do máy khách cung cấp. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Phát hiện rằng nhập từ URL bỏ qua việc kiểm tra quyền. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Báo cáo các cách vượt qua kiểm tra địa chỉ SSRF bằng IPv6, kèm các bản proof of concept hoạt động được. Các bản sửa đã được phát hành trong 2.0.0, và lời cảm ơn này đã đến muộn. (#287)

Báo cáo lỗi:

- **@kabo** ❤️: `docker-compose.yml` ví dụ không hoạt động. (#1027)
- **@xromen** ❤️: PDF hỏng bị treo cho đến khi qpdf hết thời gian 30 giây. (#920)
- **@snmabaur** ❤️: Đăng nhập OIDC đặt tên mọi hồ sơ là "admin". (#862)
- **@CodecNomad** ❤️: Công cụ Blur nhân đôi hình ảnh. (#829)
- **@ohora0923** ❤️ và **@Alexis-VS-CSharp** ❤️: Pixelate không hoạt động. (#678, #775)
- **@mptpro** ❤️: Việc tải AI xóa nền bị thất bại. (#714)
- **@dominic427** ❤️: Đổi kích thước canvas trong trình chỉnh sửa làm co giãn hình ảnh thay vì mở rộng nó. (#2016)
- **@CodeByToast** ❤️: Các ô nhập số trong Settings không thể xóa. (#1186)
- **@gioxx** ❤️: Kiểm tra dung lượng đĩa cho AI bundle đòi khoảng 18 GB cho một bundle. (#1248)
- **@rekcodocker** ❤️ và **@madmike970** ❤️: Cài AI bundle thất bại trên Proxmox LXC, kèm thông tin container giúp xác định nguyên nhân. (#1030, #352)
- **@wxf26054** ❤️: Các quy tắc mật khẩu đã tắt vẫn bị áp dụng khi tạo người dùng. (#1028)
- **@ersil** ❤️: iOS Safari gọi callback OIDC hai lần và dừng ở trang lỗi sau khi đăng nhập thành công. (#4021)
- **@casi-3** ❤️: Xóa nền hàng loạt làm mất kết quả đã hoàn tất khi trình duyệt phát lại yêu cầu, kèm một chẩn đoán chính xác. (#2015)
- **@killervette42** ❤️: Lỗi GPU Blackwell trên unRaid, điều đã dẫn đến cơ chế chuyển sang CPU cho dòng RTX 50. (#120, #4075)

Yêu cầu tính năng và phản hồi:

- **@photoevents** ❤️: Đo được rằng xóa nền mất khoảng 11 giây để nạp mô hình và 1 giây để suy luận, đề xuất lưu cache các session, và chia sẻ những gì họ học được khi chạy cache riêng. Điều đó trở thành session cache trong bản phát hành này. (#768, #776, #4144)
- **@benbou8231** ❤️: Chỉ ra rằng các tệp được nhập vào xuất hiện theo thứ tự ngược trong các công cụ nhiều tệp, điều dẫn đến tính năng sắp xếp lại trước khi chạy. (#729, #756)
- **@cf3901646** ❤️: Lần ra một lỗi gây nhiễu trên môi trường production là do lớp lỗi 58 của Postgres và đề xuất bản sửa. Chúng tôi không thể merge PR của họ khi chưa có CLA đã ký, nên đã tự viết cùng bản sửa đó. (#4210, #4253)
- **@chiliec** ❤️: Nhận ra rằng một lần auto-orient thất bại bị nuốt mất âm thầm và tiến trình cài đặt bỏ qua danh mục dịch. Cả hai đề xuất đều được phát hành qua các PR của người bảo trì. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Đề xuất single-flight cho việc import module enterprise, bản sửa cho việc các yêu cầu SCIM đồng thời không thống nhất về giấy phép. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Chỉ ra rằng hướng dẫn cấu hình chưa bao giờ đề cập đến các override binary của engine hay `SNAPOTTER_HW_ACCEL`, giờ đã được ghi lại. (#1312, #1696)
- **@aron-intframe** ❤️: Tái hiện một lỗ hổng xử lý lỗi của exiftool trên bản clone mới và phát hiện rằng race condition của đường dẫn tạm còn tệ hơn mô tả trong issue. (#3458)

Chúng tôi cũng xin cảm ơn các thành viên cộng đồng đã báo cáo những vấn đề này qua Discord và email, những người mà chúng tôi không ghi lại tên.

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Phần lớn bản 2.2 là việc gia cố bảo mật. Một người không phải quản trị viên nắm vai trò `users:manage` được ủy quyền có thể chiếm quyền một instance, và hóa ra mọi endpoint công cụ đều thiếu bước kiểm tra quyền. Hãy nâng cấp nếu bạn chạy nhiều hơn một người dùng.

Phần còn lại là cái đuôi dài của việc tự lưu trữ: các lượt tải bắt đầu rồi không bao giờ kết thúc, các preset hỏng ngay khi bạn thêm tệp thứ hai, các container crash-loop trong lúc Postgres vẫn đang khởi động. Hai công cụ mới cũng đã ra mắt. Tài liệu và trang web giờ được dịch sang 21 ngôn ngữ, và giao diện cuối cùng cũng đạt độ tương phản WCAG AA.

> [!IMPORTANT]
> Nếu bạn đã cấp `users:manage` cho người không phải quản trị viên thông qua một vai trò tùy chỉnh, vai trò đó có thể chiếm quyền các tài khoản quản trị viên trên 2.0.0 đến 2.1.0. Chi tiết trong phần Bảo mật.

### Bảo mật {#v2-2-0-security}

- **Leo thang đặc quyền thông qua vai trò `users:manage` được ủy quyền (GHSA-9xgh-95qh-2x7h).** Một người không phải quản trị viên nắm `users:manage` thông qua một vai trò tùy chỉnh có thể đặt lại mật khẩu hoặc xóa một tài khoản có đặc quyền cao hơn, kể cả quản trị viên tích hợp sẵn, và chiếm quyền instance. Việc đặt lại mật khẩu và xóa tài khoản giờ kiểm tra thẩm quyền của người gọi đối với đối tượng, nên một vai trò được ủy quyền không thể vươn lên trên cấp của chính nó. Bị ảnh hưởng: 2.0.0 đến 2.1.0. Được báo cáo bởi 李春来 (Chunlai Li). (#616)
- **Mọi endpoint công cụ giờ đều được kiểm soát.** Quyền truy cập công cụ trước đây được áp dụng theo từng route, nên cả 45 route viết tay đều phải nhớ gọi cùng một lệnh và không route nào làm vậy. Một vai trò không có `tools:use` vẫn có thể chạy image-to-pdf, erase-object, upscale, sign-pdf và các công cụ còn lại. Việc kiểm tra giờ nằm trong một preHandler duy nhất dựa trên route khớp, nên nó bao phủ cả các sub-path và bất kỳ route nào được thêm sau này. (#646)
- **Giới hạn tần suất có thể bị vượt qua trên các bản cài Docker.** Image đi kèm `TRUST_PROXY=true`, nên IP của máy khách được lấy từ một header yêu cầu và một `X-Forwarded-For` giả mạo vượt qua bộ giới hạn đăng nhập. Mặc định giờ là danh sách tin cậy mạng riêng. (#649)
- **Việc ghi cài đặt được kiểm tra theo từng cài đặt**, không chỉ một lần ở cửa vào, và việc nhập cấu hình giờ mang tính transaction để một khóa bị từ chối không thể để lại một cấu hình được áp dụng dở dang. (#618)
- **Tên tệp trong thư viện không thể thoát khỏi thư mục gốc lưu trữ.** Một tên đã lưu được tạo cố ý, mà một lần nhập SQLite 1.x độc hại sao chép nguyên văn, có thể đọc hoặc xóa các tệp bên ngoài thư mục tệp. Chỉ khai thác được sau khi người vận hành nhập một cơ sở dữ liệu SQLite 1.x do kẻ tấn công cung cấp, đây là con đường duy nhất cho phép chọn tên đã lưu. Được báo cáo bởi @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Việc hủy công việc giờ kiểm tra quyền sở hữu**, nên người dùng đã xác thực không còn có thể hủy công việc của người khác bằng id của nó. Được báo cáo bởi @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Một lần kiểm toán lại toàn bộ cây mã 2.0 đã bắt được những gì còn sót**: một SAML assertion bị chặn bắt có thể bị phát lại, một thử thách MFA tồn tại qua số lần nhập sai mã không giới hạn, việc tra cứu khóa API cho mỗi yêu cầu là quét toàn bộ bảng, `MAX_WORKSPACE_SIZE_GB` là cấu hình vô dụng, và bộ làm sạch SVG để lọt các href `javascript:` không có dấu nháy. (#620)
- **Chín CVE đã công bố được vá**: fast-uri, svgo, sharp và tar qua phụ thuộc bắc cầu (#619), cùng Pillow 12.3.0 (#517). Việc giải mã RAW trên arm64 giờ build LibRaw 0.22.2 từ mã nguồn thay vì liên kết với bản hệ thống chưa được vá. (#649)

### Tính năng mới {#v2-2-0-new-features}

- **Rounded Crop**: mặt nạ hình vuông bo góc và squircle kiểu iOS, kèm điều khiển bán kính góc. Được tạo cho favicon và biểu tượng ứng dụng. (#602)
- **Remove GIF Background**: tách nền khỏi từng khung của GIF, WebP hoặc APNG động và nhận lại một ảnh động trong suốt. (#502)
- **Lasso và chế độ High Quality của Object Eraser**: kéo một vòng tự do thay vì tô từng pixel, và tùy chọn cài một bundle diffusion inpainting để lấp vùng lớn sạch hơn. (#503, #566)
- **Lưu thành bản mới, hoặc ghi đè.** Trước đây chỉnh sửa một tệp trong thư viện âm thầm thay thế bản gốc. Giờ bạn chọn theo từng lần chỉnh sửa, và mặc định là giữ bản gốc. (#564, #577)
- **Preset tỷ lệ khung hình trong Resize.** Chọn 1:1, 4:3 hoặc 16:9 và hai kích thước được giữ khóa với nhau, không phóng to. (#530)
- **OCR hai tầng**: tầng nhanh được đóng gói sẵn trong image và chạy ngoại tuyến không cần tải, còn runtime chính xác hơn được cài theo yêu cầu. (#519)
- **Gõ ở bất kỳ đâu để tìm kiếm.** Bắt đầu gõ trên bảng điều khiển hoặc trang chủ và chữ sẽ vào ô tìm kiếm. (#644)
- **Tài liệu và trang web có 21 ngôn ngữ**: trang tài liệu, các trang landing và tài liệu tham chiếu API giờ đều được dịch, nối tiếp giao diện ứng dụng. Một hướng dẫn triển khai tài nguyên thấp mới bao gồm Raspberry Pi và các máy 2 GB. (#548)
- **Tên công cụ rõ ràng hơn**: 18 tên mơ hồ giờ tự bổ nghĩa, nên "Compress" trở thành "Compress Image". Tool id và route không đổi, nên không có đánh dấu trang nào bị hỏng. (#520)

### Cải tiến {#v2-2-0-improvements}

- **Độ tương phản WCAG AA trên toàn giao diện**: bảng màu được tinh chỉnh để màu cam rực chỉ nằm trên các vùng tô trong khi văn bản và nhãn dùng các ink token dễ tiếp cận, và cả 57 chỉ báo focus giờ đều vượt ngưỡng 3:1 cho phần tử phi văn bản. (#567, #574)
- **Upscale và xóa nền không còn trông như bị đơ**: thanh tiến trình tiến lên trong lúc suy luận thay vì đứng ở 30%, và cả hai công cụ giờ cảnh báo rằng máy chủ chỉ có CPU chậm hơn nhiều. (#605, #608)
- **Thông báo timeout nêu đúng nguyên nhân** và tính đến các máy chủ chỉ có CPU thay vì đổ lỗi cho tệp tải lên. (#596)
- **SnapOtter chờ Postgres và Redis khi khởi động** thay vì crash-loop, trong cả Compose lẫn image all-in-one. Một bản cài Proxmox LXC đã khởi động lại 76 lần trước khi có bản sửa này. (#537, #595)
- **Lượt tải sống sót qua reverse proxy**: SnapOtter yêu cầu nginx và các proxy tương thích không đệm các phản hồi tệp, vốn là lý do thường gặp khiến một lượt tải tự lưu trữ bắt đầu rồi không bao giờ kết thúc. (#604, #607)
- **Compress PDF đạt gần dung lượng mục tiêu**, và nói thẳng khi mục tiêu nằm ngoài tầm với. (#522)
- **Các điều khiển công cụ trên thiết bị di động luôn với tới được** vì giao diện ứng dụng giờ co giãn theo viewport động. (#559)
- **Convert Audio có thêm cài đặt tần số lấy mẫu.** (#561)
- **Quản trị viên có thể nới lỏng độ dài mật khẩu tối thiểu**, xuống còn 1 cho instance LAN đáng tin cậy. (#543)
- **MFA là tự phục vụ**, lỗ hổng khóa do chính sách được đóng lại, và đăng nhập OIDC hoặc SAML nhận một thử thách MFA thực sự thay vì bị chặn cứng. (#531, #536)
- **Một lỗi `Error: Error` trống giờ nêu nguyên nhân.** Lỗi mã hóa của Sharp, AI sidecar thoát, đầu ra sidecar tài liệu không phải JSON và lỗi xóa nền trước đây đều đến nơi với lý do đã bị xóa mất. (#532, #534, #535, #538, #612)
- **Hộp thoại trợ giúp đã được dịch.** Nhãn phím tắt và văn bản bắt đầu nhanh của nó bị mã hóa cứng bằng tiếng Anh trong khi các bản dịch hoàn chỉnh nằm không dùng trong cả 21 tệp ngôn ngữ. (#647)

### Sửa lỗi {#v2-2-0-bug-fixes}

- **Tệp HEIC từ iPhone bị từ chối** là không đọc được trước khi chúng đến được bộ giải mã xử lý chúng. (#631)
- **Preset chuyển đổi thất bại ở tệp thứ hai**: jpg-to-pdf và các công cụ cùng họ image-to-pdf, cùng pdf-to-png, pdf-to-jpg và pdf-to-tiff, đều trả về `Tool not found` khi bạn tải lên hai tệp. (#633, #643)
- **Preset chuyển đổi PDF mất nút tải xuống.** (#629)
- **Timeout xử lý không giới hạn không được tôn trọng**, và các luồng tiến trình bị đứng giờ tự phục hồi thay vì để giao diện chờ mãi. (#638)
- **Lượt tải bị treo thay vì thất bại** khi một tệp đã lưu hóa ra ngắn hơn độ dài được ghi nhận. (#617)
- **Các công cụ trang PDF thất bại với tệp ngắn và tệp được mã hóa**: Remove Pages mặc định dùng một dải trang mà không tài liệu nào dưới sáu trang có, và PDF được bảo vệ bằng mật khẩu thất bại một cách khó hiểu bên trong worker. (#594)
- **PDF to Text âm thầm trả về tệp rỗng** cho PDF dạng quét. Giờ nó chỉ bạn đến OCR và phục vụ văn bản dạng UTF-8. (#603)
- **PDF to Word làm rơi các khối văn bản có màu** và chia chúng rải khắp trang. (#500)
- **Object Eraser để lại tàn dư mờ** và làm nhòe các vật thể nhỏ trong hình ảnh độ phân giải cao. (#501)
- **Stabilize Video ghi ra đầu ra không phát được** khi thiếu faststart. (#593)
- **Sửa trình chỉnh sửa hình ảnh**: xoay, lật, đổi kích thước, levels, curves, bộ lọc và khóa layer. (#597)
- **Sign PDF hiển thị canvas trống** thay vì báo lý do một PDF không nạp được. (#545)
- **Thư viện tệp ghi nhận kích thước 0x0** và bỏ qua bản xem trước cho các tệp HEIC, RAW và PSD tải lên. (#636, #637)
- **Cài nhiều hơn một AI bundle** để lại virtualenv dùng chung nhiều phiên bản và âm thầm làm hỏng ba công cụ. (#649)
- **Chuyển sang JXL ở chất lượng 1 đến 4 trả về lỗi 500**, và việc thiếu ffmpeg bị báo cho bạn như một tệp tải lên bị hỏng. (#649)
- **Một sự cố Postgres thoáng qua để lại các công việc đã xong bị bỏ rơi**, đầu ra nằm trên đĩa mà không có dòng nào trỏ tới. Một reconciler giờ tiếp nhận phần việc đó thay vì bỏ nó. (#649)
- **Một endpoint Redis đổi địa chỉ làm kẹt mọi consumer** trong khi các health check vẫn trả lời 200. (#649)
- **Sửa trang web và tài liệu**: liên kết đã bản địa hóa không còn làm rơi các fragment `#` hay chuyển `zh-CN` thành chữ thường, thanh điều hướng tài liệu nằm trong viewport trên máy tính bảng, và cả hai trang không còn gọi GitHub API từ trình duyệt của bạn. (#516, #562, #570, #560)

### Ghi chú nâng cấp {#v2-2-0-upgrade-notes}

Không cần migrate gì, nhưng hai giá trị mặc định đi kèm đã thay đổi:

- **`TRUST_PROXY` giờ mặc định là `loopback,linklocal,uniquelocal`** thay vì tin mọi peer. Mạng cầu nối của Docker và mạng Compose nằm trong dải đó, nên hầu hết các thiết lập không cần thay đổi. Nếu reverse proxy của bạn kết nối đến SnapOtter từ một địa chỉ công khai, hãy đặt `TRUST_PROXY` một cách tường minh, nếu không giới hạn tần suất và nhật ký kiểm toán sẽ quy mọi yêu cầu cho proxy.
- **`MAX_AI_JOBS_PER_USER` mặc định là 5** công việc AI đơn tệp đang chạy trên mỗi người dùng. Các lần chạy AI theo batch và pipeline vẫn không bị giới hạn.

Các tùy chọn mới: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (mặc định tắt) và `GIF_BG_MAX_FRAMES`.

### Lời cảm ơn {#v2-2-0-acknowledgements}

Một phần lớn của bản phát hành này khởi đầu từ báo cáo lỗi của người khác.

Mã nguồn và đóng góp:

- **@mvanhorn** ❤️: Viết lại lỗi hết thời gian của remove-background thành một thông báo nói rõ cần làm gì, thay vì một timeout trống. (#518, #494)
- **@EuanTop** ❤️: Khôi phục hành động tải xuống trên các trang preset chuyển đổi PDF bằng cách cho route đồng bộ trả về hợp đồng kết quả công cụ chuẩn. (#629, #623)
- **@harshjainnn** ❤️: Chẩn đoán lượt tải bắt đầu rồi không bao giờ kết thúc, và đề xuất hướng đặt lại socket mà bản sửa được xây dựng dựa trên. (#617, #590)

Công bố bảo mật:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Công bố riêng tư lỗ hổng leo thang đặc quyền thông qua vai trò `users:manage` được ủy quyền, kèm phân tích đầy đủ từ nguồn đến đích và một chuỗi khai thác hoạt động được. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Công bố một IDOR đã xác thực trong việc hủy công việc, và một path traversal trong tên tệp đã lưu của thư viện có thể khai thác sau một lần nhập SQLite 1.x độc hại, mỗi lỗ hổng kèm một proof of concept hoạt động được. (#599, #600)

Báo cáo lỗi:

- **@riz467** ❤️: Các tệp HEIC thật từ iPhone bị từ chối ở bước xác thực, với nguyên nhân gốc được tìm ra ngay trong báo cáo. (#622)
- **@coupej** ❤️: Các trang preset PDF treo vĩnh viễn, và jpg-to-pdf thất bại ngay khi thêm tệp thứ hai. Hai lỗi riêng biệt, được tách bạch chính xác. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` được ghi là không giới hạn nhưng bị chặn ở năm phút. (#630)
- **@bezibaerchen** ❤️: Convert Audio ẩn cài đặt tần số lấy mẫu mà chính phần mô tả của nó đã hứa. (#558)
- **@hell-toupee** ❤️: Bundle OCR chính xác không cài được với lỗi `libpaddle`. (#505)
- **@Michael1260** ❤️ và **@And-CSH** ❤️: Độc lập xác nhận lỗi cài OCR đó và xác lập rằng giải nén thủ công hoạt động trong khi trình cài đặt trong ứng dụng thì không, điều khoanh vùng lỗi vào trình cài đặt. (#505)
- **@TomErnst1972** ❤️: Việc bật chính sách bắt buộc MFA khóa một quản trị viên khỏi chính instance của họ. (#515)
- **@thokich** ❤️: Xóa vật thể tạo ra các vùng lấp mờ, không dùng được, điều đã thúc đẩy cả việc viết lại HD inpainting lẫn bundle chất lượng cao tùy chọn. (#141)
- **@Hennie-git** ❤️: Một bản cài Proxmox LXC khởi động lại 76 lần với một Postgres chưa chấp nhận kết nối. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Phân loại báo cáo đó theo thời gian thực và đưa ra chẩn đoán mà bản sửa khởi động được xây dựng dựa trên. (#537)

Yêu cầu tính năng và phản hồi:

- **@LECOQQ** ❤️: Đề nghị nới lỏng độ phức tạp của mật khẩu trên bản cài home-server. (#136)
- **@killervette42** ❤️: Đề nghị có Unraid Community App, nay đã được phát hành trên cửa hàng Unraid CA. (#96)
- **@alienatedsec** ❤️: Chỉ ra rằng bản sửa GPU chuyển sang CPU bị chôn trong một issue đã đóng và không thể tìm thấy, đó là lý do nó có trong tài liệu triển khai hiện nay. (#490, #587)
- **@neilp316** ❤️: Xác nhận lỗi GPU Blackwell trên RTX 5060 và vạch ra một lộ trình nâng cấp CUDA 12.8 hoạt động được. (#120)
- **@Roiki11** ❤️: Lập luận cho việc dùng lưu trữ dùng chung với tham chiếu đường dẫn thay vì truyền tệp qua HTTP cho điện toán AI ngoài máy. (#189)

Chúng tôi cũng xin cảm ơn các thành viên cộng đồng đã báo cáo những vấn đề này qua Discord và email, những người mà chúng tôi không ghi lại tên: yêu cầu về cắt squircle (#602), lượt tải image-to-PDF bắt đầu rồi không bao giờ kết thúc (#604, #607), công cụ Delete Pages bị kẹt (#594), văn bản tiếng Ả Rập bị thiếu trong pdf-to-text (#603), và chẩn đoán đằng sau việc ONNX chuyển sang CPU thay GPU (#490).

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 biến bộ công cụ hình ảnh thành một bộ thao tác tệp đầy đủ: hơn 200 công cụ trên năm phương thức (Image, Video, Audio, PDF và Files), được xây dựng lại trên Postgres 17 và một hàng đợi công việc dựa trên Redis, với một lệnh `docker run` duy nhất. Đây là một bản phát hành lớn; hãy đọc phần Thay đổi gây phá vỡ trước khi nâng cấp từ 1.x.

### Tính năng mới {#new-features}

- **Bốn phương thức công cụ mới**: Video, Audio, PDF và Files gia nhập Image, đưa danh mục lên hơn 200 công cụ.
- **Công việc nền bền vững**: Một hàng đợi dựa trên Redis (BullMQ) chạy mọi công cụ như một công việc được theo dõi với tiến trình SSE trực tiếp.
- **Chế độ container đơn all-in-one**: Một lệnh `docker run` khởi động một instance hoàn chỉnh với Postgres và Redis nhúng.
- **AI bundle theo yêu cầu**: Xóa nền, OCR, phiên âm, upscale, phát hiện và cải thiện khuôn mặt, object eraser, colorize và phục hồi ảnh được cài từ giao diện. Tăng tốc GPU được phát hiện theo từng framework.
- **Sign PDF**: Vẽ, gõ hoặc tải lên chữ ký và đặt nó lên PDF ngay trong trình duyệt.
- **Automate**: Một trình dựng pipeline trực quan nối chuỗi các công cụ, với chín mẫu dựng sẵn.
- **83 preset chuyển đổi một cú nhấp**: Các bộ chuyển đổi chuyên dụng như JPG-to-PNG, MP4-to-GIF và tương tự, kèm tìm kiếm mờ.
- **Trình chỉnh sửa hình ảnh theo layer**: Một trình chỉnh sửa chạy trên Konva tại `/editor` với cọ, hình khối, điều chỉnh, bộ lọc và curves.
- **Thư viện tệp**: Lưu bất kỳ kết quả nào và dùng lại làm đầu vào cho công cụ khác.
- Công cụ được ghim, thu phóng và kéo trong canvas, 21 ngôn ngữ, và các khả năng enterprise (OIDC/SSO, SAML, SCIM, lưu trữ S3, quyền theo từng công cụ, xuất kiểm toán, distributed tracing).

### Cải tiến {#improvements}

- Hủy một tiến trình đang chạy. (#137)
- Giải mã RAW độ phân giải đầy đủ thông qua LibRaw, bao gồm DNG. (#289)
- Triển khai không dùng root và UID lạ (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Nhận diện cài đặt AI chính xác và luồng cài đặt được gia cố. (#214, #352)
- Gia cố quyền riêng tư: không có egress bên thứ ba tự động, cùng chế độ strict-offline tùy chọn.
- Nút phản hồi luôn bật, kể cả khi analytics tắt.

### Sửa lỗi {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` tắt giới hạn tần suất cho các route công cụ trở lại. (#271)
- Sửa đường dẫn virtualenv của AI bên trong image Docker. (#390)
- Tương thích sharp 0.35.2+. (#362)
- Sửa bố cục trình chỉnh sửa hình ảnh: thước kẻ, hành vi tô, thanh bên và kích thước canvas. (#258, #259)
- Hoàn thành bản dịch tiếng Ý. (#231, #206, #425)
- Audio normalize và loudnorm giữ nguyên tần số lấy mẫu của nguồn.
- Gia cố SSRF: khớp CIDR IPv6 dạng số và mở rộng bước quét trước URL. (#287)
- Các PDF được tạo ra được đóng dấu SnapOtter làm Producer.
- mediapipe cài được trên Python 3.13 và Debian 13.

### Thay đổi gây phá vỡ {#breaking-changes}

Bản 2.0 thay cơ sở dữ liệu SQLite nhúng bằng Postgres 17 và thêm Redis 8 cho hàng đợi công việc. Dữ liệu 1.x của bạn được migrate tự động khi khởi động lần đầu, nhưng ngăn xếp container đã thay đổi, nên hãy sao lưu toàn bộ volume `/data` trước (1.x chạy SQLite ở chế độ WAL, nên dữ liệu đã commit thường nằm trong `snapotter.db-wal`). Sau đó chọn image container đơn (Postgres và Redis nhúng, chỉ chạy root) hoặc ngăn xếp Compose (ứng dụng cộng Postgres 17 và Redis 8). Xem [hướng dẫn migrate](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) và [hướng dẫn nâng cấp](/vi/guide/upgrading).

### Nâng cấp {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Công cụ HTML to Image mới, khả năng truy cập WCAG 2.2 AA, gia cố bảo mật từ kiểm thử xâm nhập, và 5 bản sửa Docker nghiêm trọng.

### Tính năng mới {#new-features-1}

- **HTML to Image**: Chụp ảnh màn hình của URL hoặc HTML thô dưới dạng PNG/JPEG/WebP. Chụp toàn trang, viewport tùy chỉnh, chế độ tối.
- **Quy ước _FILE secret của Docker**: Mount các biến môi trường nhạy cảm dưới dạng tệp thay vì văn bản thuần. (#205)
- **Cấp phép enterprise và lưu trữ S3**: Khóa giấy phép thương mại tùy chọn và lưu trữ đối tượng tương thích S3.
- **Cải tiến trình chỉnh sửa hình khối**: Độ trong suốt của fill/stroke, bộ chọn màu RGBA, kiểu đường nét đứt.
- **Gói phát hành dựng sẵn**: Tải tarball từ GitHub Releases cho các bản cài không dùng Docker (Proxmox, bare metal, LXC). (#202)

### Cải tiến {#improvements-1}

- **Khả năng truy cập WCAG 2.2 AA**: Bỏ qua điều hướng, giữ focus, vùng aria-live, hỗ trợ giảm chuyển động, tỷ lệ tương phản đúng. (#209)
- **Đáp ứng trên thiết bị di động**: Cài đặt đáp ứng, SSE tự kết nối lại khi chuyển tab trên thiết bị di động. (#203, #204)
- **Chất lượng xóa nền**: Làm mượt viền, khử nhiễm màu, chọn định dạng đầu ra.
- **Bản dịch tiếng Ý**: ~145 chuỗi mới bởi @albanobattistella. (#206)
- **Tài liệu API theo từng công cụ**: 53 trang tài liệu với tham số, ví dụ và định dạng phản hồi.
- **Tải mô hình AI**: Logic thử lại với exponential backoff cho HuggingFace. (#201)

### Sửa lỗi {#bug-fixes-1}

- Các container Docker mới hoàn toàn không dùng được (giới hạn tần suất chặn mọi yêu cầu).
- Các công cụ AI nhận diện khuôn mặt (blur-faces, red-eye-removal, enhance-faces, passport-photo) thất bại trên mọi nền tảng.
- Tệp HEIC hỏng trên ARM (libheif không khớp symbol).
- Các AI bundle upscale và restore-photo không cài được trên ARM.
- OCR dùng sai phiên bản CUDA trên container GPU.
- Vượt qua SSRF guard thông qua địa chỉ IPv6 ánh xạ IPv4 dạng hex. (Ghi công: @tonghuaroot)
- Giải mã HEIC iPhone với ảnh phụ trợ. (#183, #199)
- Real-ESRGAN hết bộ nhớ CUDA trên GPU 8GB. (#200)
- 6 lỗi Sentry production và 7 lỗi QA. (#208)

### Bảo mật {#security}

- Xử lý 10 phát hiện từ kiểm thử xâm nhập (vượt qua XFF, crash do JSON sai định dạng, pipeline không giới hạn, XSS trong nhật ký kiểm toán, phương thức TRACE, và nhiều hơn nữa). (#207)
- Chặn việc vượt qua SSRF bằng IPv6 hex. (Ghi công: @tonghuaroot)
- Các base image trong Dockerfile được ghim theo digest.

### Nâng cấp {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Bản demo trực tiếp, các trang landing theo từng công cụ, và một loạt bản sửa trau chuốt.

### Tính năng mới {#new-features-2}

- **Bản demo trực tiếp** - [demo.snapotter.com](https://demo.snapotter.com) cho phép mọi người dùng thử SnapOtter mà không cần cài đặt gì.
- **Trang chỉ mục công cụ** - Duyệt toàn bộ hơn 50 công cụ tại `/tools` với tìm kiếm và bộ lọc danh mục.
- **Hơn 50 trang landing SEO** - Mỗi công cụ giờ có một trang landing riêng với FAQ, trường hợp sử dụng và bảng so sánh.
- **Xem trước nền** - Thanh trượt trước-sau hiển thị nền caro phía sau hình ảnh trong suốt.
- **Trình tạo mật khẩu mạnh** - Nút một cú nhấp trong biểu mẫu Add Members.

### Sửa lỗi {#bug-fixes-2}

- Công cụ info cho HEIC/HEIF không còn thất bại (đã thêm bước giải mã trước).
- Cài AI model bundle hiển thị thông báo lỗi tốt hơn và tôn trọng giới hạn tài nguyên.
- Ảnh thu nhỏ của thư viện nạp đúng (trước đây thiếu header xác thực).
- Menu thả xuống không còn bị cắt trong các bảng cài đặt People và Teams.
- Phần trăm so sánh dung lượng được ẩn trên các công cụ không nén.
- Gỡ liên kết chính sách quyền riêng tư bị trùng.
- Thêm bản dịch tiếng Ý cho cài đặt tính năng AI.
- Cập nhật các biểu tượng Lucide đã đổi tên (Wand2, Columns).

### Hạ tầng {#infrastructure}

- OpenSSF Scorecard được gia cố từ 4.3 lên ~7.0.
- Kiểm thử CI được song song hóa thành 4 shard với fixture thu nhỏ.
- 41 bản cập nhật phụ thuộc.

### Nâng cấp {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Năm công cụ mới, một trình chỉnh sửa hình ảnh đầy đủ, đăng nhập SSO, 20 ngôn ngữ. Có lẽ nên tách thành ba bản phát hành riêng, nhưng thôi cứ vậy.

### Tính năng mới {#new-features-3}

- **Trình chỉnh sửa hình ảnh** - Layer, cọ, hình khối, điều chỉnh, bộ lọc, curves, phím tắt. Chạy trong trình duyệt của bạn, xử lý trên phần cứng của bạn.
- **Xác thực OIDC / SSO** - Đăng nhập bằng Google, GitHub, Okta hoặc bất kỳ nhà cung cấp OpenID Connect nào. Đặt vài biến môi trường và nhóm của bạn dùng các tài khoản sẵn có.
- **Trình tạo meme** - 100 mẫu dựng sẵn với kết xuất văn bản qua opentype.js. Hoặc tải lên hình ảnh của riêng bạn.
- **Beautify** - Thả ảnh chụp màn hình vào, nhận lại một hình ảnh được trau chuốt. Khung thiết bị (macOS, Windows, trình duyệt), bóng đổ, gradient, preset mạng xã hội.
- **Mô phỏng chứng mù màu** - Xem trước hình ảnh trông ra sao với protanopia, deuteranopia, tritanopia và các dạng khiếm khuyết thị giác màu khác.
- **Trình sửa độ trong suốt PNG** - Phát hiện các PNG trong suốt giả và sửa chúng bằng BiRefNet HR-matting. Tùy chọn xóa watermark qua LaMa inpainting.
- **Mở rộng canvas bằng AI** - Mở rộng biên hình ảnh bằng AI fill. Ba mức chất lượng (nhanh, cân bằng, chất lượng) tùy theo bạn muốn đánh đổi bao nhiêu thời gian GPU.
- **20 ngôn ngữ** - Ả Rập, Trung (Giản thể/Phồn thể), Séc, Hà Lan, Pháp, Đức, Hindi, Indonesia, Ý, Nhật, Hàn, Ba Lan, Bồ Đào Nha, Nga, Tây Ban Nha, Thái, Thổ Nhĩ Kỳ, Ukraina, Việt. RTL hoạt động cho tiếng Ả Rập.
- **Nhập từ URL** - Dán URL vào vùng thả hoặc nhập hàng loạt từ một danh sách. Tải phía máy chủ với bảo vệ SSRF.
- **Eraser nhiều tệp** - Vẽ mặt nạ xóa trên nhiều hình ảnh, xử lý tất cả chỉ bằng một cú nhấp. Nét vẽ được giữ theo từng hình ảnh.
- **Nhập/xuất pipeline** - Lưu chuỗi công cụ dưới dạng JSON, chia sẻ với người khác.
- **17 định dạng RAW máy ảnh mới** qua exiftool, cùng đầu vào QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ và APNG. Codec đầu ra mới cho BMP, ICO, JP2, QOI. Xuất AVIF, TIFF, GIF, JXL và PSD được khôi phục từ một nhánh từng bị mất.

### Cải tiến {#improvements-2}

- **Cải thiện hình ảnh** - Thay pipeline cũ bằng CLAHE + normalise + gamma. Nút Deep Enhance mới dùng mô hình AI cho kết quả mạnh tay hơn.
- **Restore photo** - Viết lại phần phát hiện vết xước với bộ lọc Otsu 8 góc. LaMa inpainting giờ chạy ở độ phân giải gốc.
- **Định dạng lạ ở mọi nơi** - OCR, image-to-PDF, trình tạo favicon, composition, stitch và vectorize giờ đều giải mã được HEIC, RAW, PSD.
- **Compress** - Dung sai dung lượng mục tiêu siết từ 5% xuống 1%. Dung lượng mục tiêu là chế độ mặc định. Thêm nút tăng giảm và bộ chọn đơn vị KB/MB.
- **Dọn dẹp Sentry** - Lọc bỏ 644 sự kiện không thể xử lý. Các lỗi thật giờ được xử lý đúng cách.
- **Phát hiện GPU** - Chẩn đoán tốt hơn cho các container có CUDA nhưng không có nvidia-smi.
- **Chế độ tắt xác thực** - Người dùng ẩn danh được tạo sẵn trong DB với vai trò admin. Khóa API, pipeline và tệp người dùng không còn hỏng vì ràng buộc FK.
- **Hơn 2.705 bài kiểm thử mới** trên unit, integration và E2E.

### Sửa lỗi {#bug-fixes-3}

- Upscale trên CPU không còn hết thời gian trên các thiết bị NAS và phần cứng công suất thấp.
- Logo mã QR không còn làm bản xem trước biến mất vĩnh viễn.
- Sửa tràn khi cắt với hình ảnh chân dung cao.
- Các tệp TIFF có alpha buộc đầu ra PNG một cách đúng đắn thay vì tạo ra tệp hỏng.
- Giải mã HDR/EXR chuyển sang 8-bit trước CLAHE, sửa lỗi giải mã.
- Bộ đệm đầu vào face landmarks được chuyển sang PNG trước khi đến Python sidecar, sửa các lỗi crash.
- Find duplicates xử lý các batch nhiều định dạng và lỗi mạng.
- Bản xem trước Beautify cập nhật theo thời gian thực.
- Thanh tiến trình cho stitch và vectorize.
- SVGZ được SVG-to-raster xử lý.
- Sửa tên tệp không phải ASCII thông qua header X-File-Results được mã hóa phần trăm.

### Nâng cấp {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Hoặc với Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Docker image hợp nhất với tự động phát hiện GPU. Một image xử lý cả khối lượng công việc CPU lẫn GPU. Đơn giản hóa compose thành một tệp duy nhất với xoay vòng log. Việc tải trước mô hình giờ có xác minh và smoke test.

---

## v1.13.0 {#v1-13-0}

Kiểm soát truy cập theo vai trò (RBAC). 14 quyền chi tiết, ba vai trò tích hợp (admin, editor, user), hỗ trợ vai trò tùy chỉnh. Kiểm tra quyền trên mọi route API. Các tab giao diện được lọc theo quyền của người dùng.

---

## v1.12.0 {#v1-12-0}

Công cụ PDF to Image. Chuyển các trang PDF sang PNG, JPEG, WebP hoặc TIFF với DPI tùy chỉnh. Docker image hợp nhất với tự động phát hiện GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt được tạo tự động qua vitepress-plugin-llms cho tài liệu thân thiện với AI.

---

## v1.10.0 {#v1-10-0}

Content-aware resize (seam carving) với bảo vệ khuôn mặt. Đổi kích thước hình ảnh trong khi giữ nguyên nội dung quan trọng.

---

## v1.9.0 {#v1-9-0}

Công cụ Stitch / Combine. Ghép hình ảnh cạnh nhau, xếp dọc, hoặc theo lưới tùy chỉnh.

---

## v1.8.0 {#v1-8-0}

Công cụ Edit Metadata. Xem và chỉnh sửa metadata EXIF, IPTC và XMP với giao diện strip/keep chi tiết.

---

## Các bản phát hành cũ hơn {#older-releases}

Để xem nhật ký thay đổi đầy đủ ở mức commit bao gồm các bản vá, xem [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
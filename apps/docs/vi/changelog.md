---
description: "Ghi chú phát hành và lịch sử phiên bản của SnapOtter. Xem những gì mới, được cải thiện và được sửa trong mỗi bản phát hành."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: e15f50f87853
---

# Nhật ký thay đổi {#changelog}

## v2.2.0 {#v2-2-0}

Phần lớn 2.2 là gia cố bảo mật. Một người không phải quản trị viên nắm giữ vai trò `users:manage` được ủy quyền có thể chiếm quyền điều khiển toàn bộ thực thể, và hóa ra mọi endpoint công cụ đều thiếu kiểm tra quyền. Hãy nâng cấp nếu bạn chạy nhiều hơn một người dùng.

Phần còn lại là hàng loạt vấn đề muôn thuở của tự lưu trữ: các bản tải xuống bắt đầu nhưng không bao giờ hoàn tất, các preset hỏng ngay khi bạn thêm tệp thứ hai, các container khởi động lại liên tục trong khi Postgres vẫn đang khởi động. Hai công cụ mới cũng đã ra mắt. Tài liệu và trang web giờ đã được dịch sang 21 ngôn ngữ, và giao diện cuối cùng đã đạt độ tương phản WCAG AA.

> [!IMPORTANT]
> Nếu bạn đã cấp `users:manage` cho một người không phải quản trị viên thông qua vai trò tùy chỉnh, vai trò đó có thể chiếm các tài khoản quản trị viên trên 2.0.0 đến 2.1.0. Chi tiết trong phần Bảo mật.

### Bảo mật {#v2-2-0-security}

- **Leo thang đặc quyền thông qua vai trò `users:manage` được ủy quyền (GHSA-9xgh-95qh-2x7h).** Một người không phải quản trị viên nắm giữ `users:manage` thông qua vai trò tùy chỉnh có thể đặt lại mật khẩu của, hoặc xóa, một tài khoản có đặc quyền cao hơn, kể cả quản trị viên tích hợp, và chiếm quyền điều khiển toàn bộ thực thể. Việc đặt lại mật khẩu và xóa tài khoản giờ đây xác minh thẩm quyền của người gọi đối với mục tiêu, nên một vai trò được ủy quyền không thể vượt quá cấp của chính nó. Bị ảnh hưởng: 2.0.0 đến 2.1.0. Được báo cáo bởi 李春来 (Chunlai Li). (#616)
- **Mọi endpoint công cụ giờ đều được kiểm soát.** Quyền truy cập công cụ được thực thi theo từng tuyến, nên cả 45 tuyến viết tay đều phải nhớ cùng một lời gọi và không tuyến nào làm được. Một vai trò không có `tools:use` vẫn có thể chạy image-to-pdf, erase-object, upscale, sign-pdf và phần còn lại. Việc kiểm tra giờ nằm trong một preHandler duy nhất dựa trên tuyến đã khớp, nên nó bao phủ các đường dẫn con và bất kỳ tuyến nào được thêm sau này. (#646)
- **Giới hạn tần suất có thể bị vượt qua trên các bản cài đặt Docker.** Image phát hành `TRUST_PROXY=true`, nên IP của client đến từ một header yêu cầu và một `X-Forwarded-For` giả mạo đã lọt qua bộ giới hạn đăng nhập. Mặc định giờ là danh sách tin cậy mạng riêng. (#649)
- **Ghi cài đặt được kiểm tra theo từng cài đặt**, không phải một lần ở cửa, và việc nhập cấu hình giờ mang tính giao dịch để một khóa bị từ chối không thể để lại một nửa cấu hình được áp dụng. (#618)
- **Tên tệp thư viện không thể thoát khỏi thư mục gốc lưu trữ.** Một tên đã lưu được tạo khéo léo, mà một bản nhập SQLite 1.x độc hại sao chép nguyên văn, có thể đọc hoặc xóa các tệp bên ngoài thư mục files. Chỉ có thể tiếp cận sau khi người vận hành nhập một cơ sở dữ liệu SQLite 1.x do kẻ tấn công cung cấp, đây là con đường duy nhất cho phép chọn một tên đã lưu. Được báo cáo bởi @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Việc hủy công việc thực thi quyền sở hữu**, nên một người dùng đã xác thực không còn có thể hủy công việc của người dùng khác bằng id của nó. Được báo cáo bởi @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Một cuộc tái kiểm toán toàn bộ cây 2.0 đã bắt được những gì còn bỏ ngỏ**: một assertion SAML bị đánh cắp có thể bị phát lại, một thách thức MFA tồn tại qua bất kỳ số lượng mã sai nào, việc tra cứu API key theo từng yêu cầu là một lần quét toàn bảng, `MAX_WORKSPACE_SIZE_GB` là cấu hình chết, và bộ làm sạch SVG để lọt các href `javascript:` không có dấu ngoặc kép. (#620)
- **Chín CVE đã được công bố đã được vá**: fast-uri, svgo, sharp và tar một cách gián tiếp (#619), cùng Pillow 12.3.0 (#517). Giải mã RAW trên arm64 giờ xây dựng LibRaw 0.22.2 từ mã nguồn thay vì liên kết một bản sao hệ thống chưa được vá. (#649)

### Tính năng mới {#v2-2-0-new-features}

- **Cắt góc tròn**: mặt nạ hình vuông bo tròn và squircle kiểu iOS, với điều khiển bán kính góc. Được tạo cho favicon và biểu tượng ứng dụng. (#602)
- **Xóa nền GIF**: loại bỏ nền khỏi GIF động, WebP hoặc APNG từng khung hình và nhận lại một hoạt ảnh trong suốt. (#502)
- **Lasso và chế độ Chất lượng cao của Object Eraser**: kéo một vòng tự do thay vì tô từng pixel, và tùy chọn cài đặt gói inpainting khuếch tán để lấp đầy vùng lớn sạch hơn. (#503, #566)
- **Lưu thành mới, hoặc ghi đè.** Việc chỉnh sửa một tệp thư viện trước đây âm thầm thay thế bản gốc. Giờ bạn chọn cho từng lần chỉnh sửa, và mặc định vẫn giữ nguyên. (#564, #577)
- **Preset tỷ lệ khung hình trong Resize.** Chọn 1:1, 4:3 hoặc 16:9 và hai kích thước vẫn được khóa, không phóng to. (#530)
- **OCR hai tầng**: một tầng nhanh được đóng gói sẵn trong image và chạy ngoại tuyến không cần tải xuống, và một runtime chính xác hơn được cài đặt theo yêu cầu. (#519)
- **Nhập ở bất kỳ đâu để tìm kiếm.** Bắt đầu nhập trên bảng điều khiển hoặc trang chủ và nội dung sẽ vào ô tìm kiếm. (#644)
- **Tài liệu và trang web bằng 21 ngôn ngữ**: trang tài liệu, các trang đích và tài liệu tham khảo API đều đã được dịch, cùng với giao diện ứng dụng. Một hướng dẫn triển khai tài nguyên thấp mới bao quát Raspberry Pi và máy 2 GB. (#548)
- **Tên công cụ rõ ràng hơn**: 18 tên mơ hồ giờ đã tự làm rõ nghĩa, nên "Compress" trở thành "Compress Image". Id công cụ và tuyến không thay đổi, nên không có gì đã đánh dấu bị hỏng. (#520)

### Cải thiện {#v2-2-0-improvements}

- **Độ tương phản WCAG AA trên toàn giao diện**: bảng màu đã được tinh chỉnh để màu cam sống động vẫn nằm trên các ô nền trong khi văn bản và nhãn dùng token mực dễ tiếp cận, và tất cả 57 chỉ báo tiêu điểm giờ đạt ngưỡng 3:1 cho phi văn bản. (#567, #574)
- **Upscale và xóa nền không còn trông như bị đóng băng**: thanh tiến trình tiến lên trong quá trình suy luận thay vì dừng ở 30%, và cả hai công cụ giờ cảnh báo rằng máy chủ chỉ có CPU chậm hơn nhiều. (#605, #608)
- **Thông báo thời gian chờ nêu đúng nguyên nhân** và tính đến máy chủ chỉ có CPU thay vì đổ lỗi cho tệp tải lên. (#596)
- **SnapOtter chờ Postgres và Redis khi khởi động** thay vì khởi động lại liên tục, ở cả Compose và image tất-cả-trong-một. Một bản cài đặt Proxmox LXC đã khởi động lại 76 lần trước bản sửa này. (#537, #595)
- **Tải xuống tồn tại qua reverse proxy**: SnapOtter yêu cầu nginx và các proxy tương thích không đệm phản hồi tệp, đây là lý do thường gặp khiến một bản tải xuống tự lưu trữ bắt đầu và không bao giờ kết thúc. (#604, #607)
- **Nén PDF đạt gần kích thước mục tiêu**, và nói thật khi mục tiêu nằm ngoài tầm với. (#522)
- **Điều khiển công cụ trên di động luôn truy cập được** khi vỏ ứng dụng định cỡ theo khung nhìn động. (#559)
- **Convert Audio hiển thị cài đặt tần số lấy mẫu.** (#561)
- **Quản trị viên có thể nới lỏng độ dài mật khẩu tối thiểu**, xuống còn 1 cho một thực thể LAN tin cậy. (#543)
- **MFA là tự phục vụ**, khóa chính sách đã được đóng lại, và đăng nhập OIDC hoặc SAML nhận được thách thức MFA thực sự thay vì bị chặn cứng. (#531, #536)
- **Một `Error: Error` trần giờ nêu nguyên nhân.** Lỗi mã hóa Sharp, thoát sidecar AI, đầu ra sidecar tài liệu không phải JSON, và lỗi xóa nền trước đây đều đến với lý do đã bị xóa sạch. (#532, #534, #535, #538, #612)
- **Hộp thoại trợ giúp đã được dịch.** Nhãn phím tắt và văn bản bắt đầu của nó đã bị mã hóa cứng bằng tiếng Anh trong khi các bản dịch hoàn chỉnh nằm không dùng trong cả 21 tệp ngôn ngữ. (#647)

### Sửa lỗi {#v2-2-0-bug-fixes}

- **Tệp HEIC từ iPhone bị từ chối** là không đọc được trước khi chúng đến bộ giải mã xử lý chúng. (#631)
- **Preset chuyển đổi thất bại ở tệp thứ hai**: jpg-to-pdf và các công cụ anh em image-to-pdf, cùng pdf-to-png, pdf-to-jpg và pdf-to-tiff, đều trả về `Tool not found` khi bạn tải lên hai tệp. (#633, #643)
- **Preset chuyển đổi PDF mất nút tải xuống.** (#629)
- **Thời gian chờ xử lý không giới hạn không được tôn trọng**, và các luồng tiến trình bị đình trệ giờ phục hồi thay vì để giao diện chờ đợi. (#638)
- **Tải xuống bị treo thay vì thất bại** khi một tệp đã lưu ngắn hơn độ dài được ghi của nó. (#617)
- **Công cụ trang PDF thất bại trên tệp ngắn và được mã hóa**: Remove Pages mặc định dùng một phạm vi trang mà không tài liệu nào dưới sáu trang có, và các PDF được bảo vệ bằng mật khẩu thất bại một cách khó hiểu bên trong worker. (#594)
- **PDF to Text âm thầm trả về tệp rỗng** cho các PDF quét. Giờ nó chỉ bạn đến OCR và phục vụ văn bản dưới dạng UTF-8. (#603)
- **PDF to Word làm rơi các khối văn bản có màu** và tách chúng qua trang. (#500)
- **Object Eraser để lại tàn dư ma** và làm mờ các vật thể nhỏ trong ảnh độ phân giải cao. (#501)
- **Stabilize Video ghi đầu ra không phát được** nếu không có faststart. (#593)
- **Sửa lỗi trình chỉnh sửa ảnh**: xoay, lật, thay đổi kích thước, mức, đường cong, bộ lọc và khóa lớp. (#597)
- **Sign PDF hiển thị khung vẽ trống** thay vì báo cáo lý do PDF không tải được. (#545)
- **Thư viện tệp ghi kích thước 0x0** và bỏ qua bản xem trước cho các tệp tải lên HEIC, RAW và PSD. (#636, #637)
- **Cài đặt nhiều hơn một gói AI** khiến virtualenv dùng chung có nhiều phiên bản và âm thầm làm hỏng ba công cụ. (#649)
- **Chuyển đổi sang JXL ở chất lượng 1 đến 4 trả về 500**, và một ffmpeg bị thiếu được báo cho bạn là tệp tải lên bị hỏng. (#649)
- **Một sự cố Postgres tạm thời làm mắc kẹt các công việc đã hoàn thành**, để đầu ra trên đĩa mà không có hàng nào trỏ đến nó. Một bộ đối soát giờ tiếp nhận công việc đó thay vì bỏ nó. (#649)
- **Một endpoint Redis đổi địa chỉ làm kẹt mọi consumer** trong khi kiểm tra sức khỏe vẫn trả lời 200. (#649)
- **Sửa lỗi trang web và tài liệu**: các liên kết bản địa hóa không còn làm rơi đoạn `#` hoặc viết thường `zh-CN`, thanh điều hướng tài liệu vẫn nằm trong khung nhìn trên máy tính bảng, và cả hai trang không còn gọi API GitHub từ trình duyệt của bạn nữa. (#516, #562, #570, #560)

### Ghi chú nâng cấp {#v2-2-0-upgrade-notes}

Không có gì cần di trú, nhưng hai giá trị mặc định được phát hành đã thay đổi:

- **`TRUST_PROXY` giờ mặc định là `loopback,linklocal,uniquelocal`** thay vì tin cậy mọi peer. Mạng cầu Docker và mạng Compose nằm trong phạm vi đó, nên hầu hết các thiết lập không cần thay đổi. Nếu reverse proxy của bạn tiếp cận SnapOtter từ một địa chỉ công khai, hãy đặt `TRUST_PROXY` một cách rõ ràng, nếu không giới hạn tần suất và nhật ký kiểm toán sẽ gán mọi yêu cầu cho proxy.
- **`MAX_AI_JOBS_PER_USER` mặc định là 5** công việc AI một tệp đang xử lý cho mỗi người dùng. Các lượt chạy AI hàng loạt và pipeline vẫn không bị giới hạn.

Các nút tùy chọn mới: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (tắt theo mặc định) và `GIF_BG_MAX_FRAMES`.

### Lời cảm ơn {#v2-2-0-acknowledgements}

Một phần lớn của bản phát hành này bắt đầu từ báo cáo lỗi của người khác.

Mã nguồn và đóng góp:

- **@mvanhorn** ❤️: Viết lại lỗi thời gian chờ xóa nền thành một thông điệp nói rõ cần làm gì, thay vì một lần chờ trần. (#518, #494)
- **@EuanTop** ❤️: Khôi phục thao tác tải xuống trên các trang preset chuyển đổi PDF bằng cách làm cho tuyến đồng bộ trả về hợp đồng kết quả công cụ chuẩn. (#629, #623)
- **@harshjainnn** ❤️: Chẩn đoán bản tải xuống bắt đầu và không bao giờ kết thúc, và đề xuất hướng đặt lại socket mà bản sửa được xây dựng trên đó. (#617, #590)

Công bố bảo mật:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Công bố riêng việc leo thang đặc quyền thông qua vai trò `users:manage` được ủy quyền, với phân tích đầy đủ từ nguồn đến đích và một chuỗi khai thác hoạt động. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Công bố một IDOR đã xác thực trên việc hủy công việc, và một lỗ hổng path traversal trong tên tệp đã lưu của thư viện có thể tiếp cận sau một bản nhập SQLite 1.x độc hại, với một bằng chứng khái niệm hoạt động cho mỗi lỗi. (#599, #600)

Báo cáo lỗi:

- **@riz467** ❤️: Tệp HEIC thật từ iPhone bị từ chối ở bước xác thực, với nguyên nhân gốc được làm rõ trong báo cáo. (#622)
- **@coupej** ❤️: Các trang preset PDF treo mãi mãi, và jpg-to-pdf thất bại ngay khi thêm tệp thứ hai. Hai lỗi riêng biệt, được tách đúng. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` được ghi là không giới hạn nhưng bị giới hạn ở năm phút. (#630)
- **@bezibaerchen** ❤️: Convert Audio ẩn cài đặt tần số lấy mẫu mà chính mô tả của nó hứa hẹn. (#558)
- **@hell-toupee** ❤️: Gói OCR chính xác không cài đặt được với lỗi `libpaddle`. (#505)
- **@Michael1260** ❤️ và **@And-CSH** ❤️: Xác nhận độc lập lỗi cài đặt OCR đó và xác định rằng trích xuất thủ công hoạt động trong khi trình cài đặt trong ứng dụng không hoạt động, điều này ghim lỗi vào trình cài đặt. (#505)
- **@TomErnst1972** ❤️: Bật chính sách yêu cầu MFA khóa quản trị viên khỏi thực thể của chính họ. (#515)
- **@thokich** ❤️: Xóa vật thể tạo ra các vùng lấp đầy mờ, không dùng được, điều này thúc đẩy cả việc viết lại inpainting HD và gói chất lượng cao tùy chọn. (#141)
- **@Hennie-git** ❤️: Một bản cài đặt Proxmox LXC khởi động lại 76 lần với một Postgres chưa chấp nhận kết nối. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Phân loại báo cáo đó trong thời gian thực và đưa ra chẩn đoán mà bản sửa khởi động được xây dựng trên đó. (#537)

Yêu cầu tính năng và phản hồi:

- **@LECOQQ** ❤️: Yêu cầu nới lỏng độ phức tạp mật khẩu trên một bản cài đặt máy chủ tại nhà. (#136)
- **@killervette42** ❤️: Yêu cầu một Unraid Community App, hiện đã được phát hành trên Unraid CA store. (#96)
- **@alienatedsec** ❤️: Chỉ ra rằng bản sửa GPU-tự-động-chuyển-về-CPU bị chôn trong một issue đã đóng và khó khám phá, đó là lý do nó giờ nằm trong tài liệu triển khai. (#490, #587)
- **@neilp316** ❤️: Xác nhận lỗi GPU Blackwell trên RTX 5060 và vạch ra con đường nâng cấp CUDA 12.8 hoạt động. (#120)
- **@Roiki11** ❤️: Lập luận cho lưu trữ dùng chung với tham chiếu đường dẫn thay vì truyền tệp qua HTTP cho tính toán AI ngoài máy. (#189)

Cảm ơn cả các thành viên cộng đồng đã báo cáo những vấn đề này qua Discord và email, những người chúng tôi không ghi lại tên: yêu cầu cắt squircle (#602), bản tải xuống image-to-PDF bắt đầu và không bao giờ kết thúc (#604, #607), công cụ Delete Pages bị kẹt (#594), văn bản tiếng Ả Rập bị thiếu trong pdf-to-text (#603), và chẩn đoán đằng sau cơ chế dự phòng GPU ONNX (#490).

[Toàn bộ diff trên GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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

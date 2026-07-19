---
description: "Cấu trúc monorepo, kiến trúc ứng dụng và gói, vòng đời yêu cầu, và dấu chân tài nguyên của SnapOtter."
i18n_output_hash: ac9f6dfbc8b9
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Kiến trúc {#architecture}

SnapOtter là một monorepo được quản lý bằng pnpm workspaces và Turborepo. Nó triển khai như một ngăn xếp Docker Compose 3 container: image ứng dụng SnapOtter, PostgreSQL 17 và Redis 8.

## Cấu trúc dự án {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Các gói {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

Thư viện xử lý ảnh cốt lõi được xây dựng trên [Sharp](https://sharp.pixelplumbing.com/). Nó xử lý mọi thao tác không phải AI: thay đổi kích thước, cắt, xoay, lật, chuyển đổi, nén, tước metadata và điều chỉnh màu (độ sáng, độ tương phản, độ bão hòa, thang xám, sepia, đảo màu, kênh màu).

Gói này không có phụ thuộc mạng và chạy hoàn toàn trong tiến trình.

### `@snapotter/ai` {#snapotter-ai}

Lớp cầu nối gọi các thời gian chạy gốc và Python ML. Hầu hết các công cụ Python đều sử dụng dispatcher liên tục để nhập trước các thư viện nặng (PIL, NumPy, MediaPipe, rembg) để các lệnh gọi tiếp theo bỏ qua chi phí nhập. OCR bị cô lập khỏi môi trường chia sẻ có thể thay đổi đó: `fast` gọi Tesseract gốc, trong khi `balanced` và `best` sử dụng JSONL dispatcher liên tục chuyên dụng được ghim vào thế hệ RapidOCR/ONNX bất biến đang hoạt động. Mỗi yêu cầu chứa một generation lease. Kích hoạt trước tiên sẽ chạy smoke test trên một ứng cử viên, sau đó chuyển sang dispatcher của nó. dispatcher trước đó sẽ cạn kiệt trước khi thế hệ của nó được thu gom rác.

**Các mô hình không được nạp trước.** Mỗi script công cụ nạp trọng số mô hình của nó từ đĩa vào thời điểm yêu cầu và loại bỏ chúng khi yêu cầu hoàn tất. Xem [Dấu chân tài nguyên](#resource-footprint) để biết hồ sơ bộ nhớ đầy đủ.

Các thao tác được hỗ trợ: xóa nền (rembg/BiRefNet), nâng cấp (RealESRGAN), làm mờ khuôn mặt (MediaPipe), nâng cao khuôn mặt (GFPGAN/CodeFormer), xóa đối tượng (LaMa ONNX), OCR (Tesseract và RapidOCR với các mẫu PP-OCR ONNX), tô màu (DDColor), khử nhiễu, khử mắt đỏ, phục hồi ảnh, tạo ảnh hộ chiếu, độ trong suốt sửa lỗi (BiRefNet HR-matting) và thay đổi kích thước nhận biết nội dung (nhị phân Go caire).

Các tập lệnh Python tồn tại trong `packages/ai/python/`. Các gói mô hình tùy chọn lớn được cài đặt theo yêu cầu vào khối lượng `/data/ai` liên tục. OCR chính xác sử dụng các tạo phẩm đã được ký, dành riêng cho nền tảng; tầng Tesseract tích hợp không yêu cầu tải xuống gói mô hình.

### `@snapotter/shared` {#snapotter-shared}

Các kiểu TypeScript dùng chung, các hằng số (như `APP_VERSION` và định nghĩa công cụ), và các chuỗi dịch i18n được cả frontend và backend sử dụng.

## Các ứng dụng {#applications}

### API (`apps/api`) {#api-apps-api}

Một máy chủ Fastify v5 phơi bày 241 tuyến công cụ trên năm phương thức (image, video, audio, PDF, file) xử lý:
- Tải tệp lên, quản lý không gian làm việc tạm thời, và lưu trữ tệp bền vững
- Thư viện tệp người dùng (bảng `user_files`): theo mặc định, một chỉnh sửa đã lưu được lưu thành một tệp mới độc lập, hoặc thành một phiên bản liên kết với tệp cha khi bạn ghi đè lên tệp gốc. Nó ghi lại những công cụ nào đã được áp dụng (`toolChain`) và nhận một ảnh thu nhỏ tự sinh cho trang Files
- Thực thi công cụ (định tuyến mỗi yêu cầu công cụ đến image engine hoặc cầu nối AI)
- Điều phối pipeline (kết nối nhiều công cụ theo tuần tự)
- Xử lý hàng loạt với kiểm soát đồng thời qua các hàng đợi công việc BullMQ (nhóm: image, media, ai, docs, system)
- Xác thực người dùng, RBAC (vai trò admin/user với một bộ quyền đầy đủ), quản lý khóa API và giới hạn tốc độ
- Quản lý Teams - CRUD chỉ dành cho admin; người dùng được gán vào một nhóm qua trường `team` trên hồ sơ của họ
- Cài đặt runtime - một kho khóa-giá trị trong bảng `settings` điều khiển `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit`, và các nút vận hành khác mà không cần triển khai lại
- Thương hiệu tùy chỉnh và tùy chọn runtime qua các cài đặt được hậu thuẫn bởi cơ sở dữ liệu
- Tài liệu Scalar/OpenAPI tại `/api/docs`
- Phục vụ frontend đã build dưới dạng SPA trong sản xuất

Các phụ thuộc chính: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod để kiểm định.

Máy chủ xử lý việc tắt máy nhẹ nhàng khi nhận SIGTERM/SIGINT: nó rút cạn các kết nối HTTP, dừng các worker BullMQ, tắt dispatcher Python, và đóng kết nối cơ sở dữ liệu.

### Web (`apps/web`) {#web-apps-web}

Một ứng dụng đơn trang React 19 được build với Vite. Dùng Zustand để quản lý trạng thái, Tailwind CSS v4 để tạo kiểu, và Lucide cho biểu tượng. Giao tiếp với API qua REST và SSE (để theo dõi tiến trình).

Các trang bao gồm một không gian làm việc công cụ, một trang Files để quản lý các tệp tải lên và kết quả bền vững, một trình dựng tự động hóa/pipeline, và một bảng cài đặt admin.

Frontend đã build được phục vụ bởi backend Fastify trong sản xuất, nên không có máy chủ web riêng biệt trong container Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Trang VitePress này. Được triển khai lên Cloudflare Pages tự động khi đẩy lên `main`.

## Cách một yêu cầu di chuyển {#how-a-request-flows}

1. Người dùng chọn một công cụ trong giao diện web và tải lên một tệp.
2. Frontend gửi một POST đa phần đến `/api/v1/tools/:section/:toolId` với tệp và các cài đặt.
3. Tuyến API kiểm định đầu vào bằng Zod, rồi điều phối việc xử lý.
4. Đối với các công cụ tiêu chuẩn, công việc được đưa vào nhóm BullMQ phù hợp (image, media hoặc docs dựa trên phương thức). Worker BullMQ trong tiến trình tự định hướng ảnh dựa trên metadata EXIF, chạy hàm xử lý của công cụ, và trả về kết quả.
5. Đối với hầu hết các công cụ AI, cầu nối TypeScript sẽ gửi yêu cầu đến Python dispatcher liên tục. Thay vào đó, OCR nhanh sẽ gọi Tesseract và OCR chính xác sẽ khởi động tệp thực thi được ghim từ thế hệ OCR bất biến đang hoạt động. Cấp OCR được yêu cầu được cố định khi xâm nhập và không bao giờ được thay đổi âm thầm trong quá trình thực thi.
6. Tiến trình công việc được lưu bền vào bảng `jobs` trong PostgreSQL nên trạng thái tồn tại qua các lần khởi động lại container. Các cập nhật thời gian thực được chuyển qua SSE tại `/api/v1/jobs/:jobId/progress`.
7. API trả về một `jobId` và `downloadUrl`. Người dùng tải tệp đã xử lý từ `/api/v1/download/:jobId/:filename`.

Đối với pipeline, API đưa đầu ra của mỗi bước làm đầu vào cho bước kế tiếp, chạy chúng theo tuần tự.

Đối với xử lý hàng loạt, API dùng các flow BullMQ với các công việc con theo từng bước và trả về một tệp ZIP với tất cả các tệp đã xử lý.

## Dấu chân tài nguyên {#resource-footprint}

SnapOtter được thiết kế để dùng bộ nhớ thấp khi rảnh. Không có gì được nạp trước hay giữ ấm khi khởi động.

### Khi rảnh {#at-idle}

Tiến trình Node.js/Fastify, PostgreSQL và Redis đang chạy. RAM rảnh điển hình là **khoảng 200-300 MB** trên cả ba container (tiến trình Node.js, Postgres và Redis). Không có tiến trình Python, không có trọng số mô hình trong bộ nhớ.

### Cái gì khởi động, và khi nào {#what-starts-and-when}

| Thành phần | Khởi động khi | Bộ nhớ khi hoạt động |
|-----------|-------------|---------------------|
| Máy chủ Fastify + Postgres + Redis | Khởi động container | tổng khoảng 200-300 MB |
| Các worker BullMQ | Khởi động container (trong tiến trình) | Một worker cho mỗi nhóm (image, media, ai, docs, system) |
| Dispatcher Python | Yêu cầu công cụ AI đầu tiên | Trình thông dịch Python + các thư viện nạp trước (PIL, NumPy, MediaPipe, rembg) - không có trọng số mô hình |
| Trọng số mô hình AI | Trong yêu cầu của công cụ cụ thể | Nạp từ đĩa, giải phóng khi yêu cầu hoàn tất |

### Nạp mô hình {#model-loading}

Tất cả các tệp trọng số mô hình (tổng cộng vài GB) nằm trên đĩa trong `/opt/models/` mọi lúc. Mỗi script công cụ AI chỉ nạp mô hình của riêng nó vào bộ nhớ trong khoảng thời gian của một yêu cầu, rồi giải phóng chúng. Một số script gọi rõ ràng `del model` và `torch.cuda.empty_cache()` sau khi suy luận để đảm bảo bộ nhớ được trả lại ngay lập tức.

Không có bộ nhớ đệm mô hình giữa các yêu cầu. Chạy cùng một công cụ AI liên tiếp sẽ nạp lại mô hình mỗi lần. Điều này giữ bộ nhớ khi rảnh gần bằng không với cái giá là độ trễ nạp mô hình ở mỗi yêu cầu AI.

### Khởi động nguội của yêu cầu AI đầu tiên {#first-ai-request-cold-start}

Dispatcher Python không chạy khi container khởi động. Yêu cầu AI đầu tiên kích hoạt hai việc song song: dispatcher bắt đầu khởi động trong nền, và bản thân yêu cầu lùi về việc sinh một tiến trình con Python dùng một lần. Khi dispatcher báo hiệu sẵn sàng, tất cả các yêu cầu AI sau đó dùng nó trực tiếp và bỏ qua chi phí sinh tiến trình con.

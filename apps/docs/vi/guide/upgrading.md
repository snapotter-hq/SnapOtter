---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 994209b7b314
i18n_hash_version: 2
---
# Nâng cấp từ 1.x lên 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x lưu mọi thứ trong một tệp SQLite duy nhất và chạy như một container. SnapOtter 2.0 dùng PostgreSQL và Redis. Hướng dẫn này giúp bạn chuyển bản cài 1.x sang 2.0 mà không mất dữ liệu.

Tóm tắt: dùng lại volume `/data` hiện có, và 2.0 sẽ tự động nhập cơ sở dữ liệu 1.x của bạn ở lần khởi động đầu tiên. Người dùng, tệp đã lưu, cài đặt, khóa API và pipeline của bạn đều được chuyển sang. Cơ sở dữ liệu cũ không bao giờ bị sửa đổi, nên bạn luôn có thể quay lại.

::: tip Lời nhắn gửi người dùng 1.x
Nhiều bạn đã tin tưởng SnapOtter từ ngày đầu, và phản hồi của các bạn đã định hình bản phát hành này. 2.0 thay đổi rất nhiều bên trong, và hướng dẫn này tồn tại để việc chuyển đổi không làm bạn mất bất cứ thứ gì bạn quan tâm. Tài khoản, tệp, cài đặt, khóa API và pipeline của bạn được chuyển sang, và cơ sở dữ liệu cũ không bao giờ bị đụng đến. Cảm ơn bạn đã nâng cấp cùng chúng tôi.
:::

## Trước khi bắt đầu: sao lưu toàn bộ volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Hãy làm việc này trước, mỗi lần. Sao lưu **toàn bộ** volume `/data`, không chỉ tệp `snapotter.db`.

Đây là lý do. 1.x chạy SQLite ở chế độ WAL, nên một container 1.x đã dừng thường để phần lớn dữ liệu đã commit trong `snapotter.db-wal` bên cạnh một `snapotter.db` gần như trống. Chỉ sao chép `snapotter.db` sẽ thu được một cơ sở dữ liệu trống và âm thầm mất mọi thứ. Volume chứa `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` và thư mục `files/` của bạn cùng nhau, và chúng phải được sao lưu như một bộ.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Nâng cấp lên 1.17.2 trước {#upgrade-to-1-17-2-first}

Hãy nâng cấp bản cài 1.x của bạn lên bản 1.x mới nhất (1.17.2) trước khi chuyển sang 2.0. Việc đó cho phép 1.x chạy các migration schema cuối cùng của chính nó, để 2.0 nhập từ một schema đã biết và đầy đủ. Nâng cấp thẳng từ một bản 1.x cũ hơn lên 2.0 không được hỗ trợ.

## Kiểm tra tên volume {#check-your-volume-name}

Trình nhập chỉ thấy dữ liệu của bạn nếu stack 2.0 mount đúng volume mà bản cài 1.x đã dùng. Tên volume Docker phân biệt chữ hoa chữ thường, và các đoạn README cũ dùng `snapotter-data` viết thường trong khi các tệp Compose dùng `SnapOtter-data`. Hãy xác nhận bạn đang có cái nào:

```bash
docker volume ls | grep -i snapotter
```

Dùng đúng tên đó trong cấu hình 2.0 của bạn.

## Cách A: một container (nhanh nhất) {#path-a-single-container-quickest}

Nếu bạn chạy SnapOtter bằng một `docker run` duy nhất, cứ tiếp tục như vậy. 2.0 khởi động PostgreSQL và Redis nhúng bên trong container khi bạn không đặt `DATABASE_URL` hoặc `REDIS_URL`, và tự động phát hiện rồi nhập `/data/snapotter.db` ở lần khởi động đầu tiên.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Theo dõi log để thấy một dòng như:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Vậy là xong. Hãy đăng nhập bằng thông tin xác thực hiện có.

## Cách B: Compose (khuyến nghị cho production) {#path-b-compose-recommended-for-production}

Stack Compose của 2.0 chạy ba dịch vụ (app, Postgres, Redis). Dùng lại volume `/data` của 1.x cho dịch vụ app. Ứng dụng tự động phát hiện `/data/snapotter.db` và nhập nó vào Postgres ở lần khởi động đầu tiên.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Nếu bạn muốn trỏ rõ ràng đến cơ sở dữ liệu cũ, hãy đặt `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Đường dẫn được chỉ định rõ luôn được ưu tiên hơn tự phát hiện.

## Xem trước việc nhập (tùy chọn) {#preview-the-import-first-optional}

Để xem chính xác những gì sẽ được nhập mà không ghi gì cả, hãy chạy thử (dry run) trên tệp cơ sở dữ liệu của bạn:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Nó in ra số dòng theo từng bảng, số tệp thư viện đã lưu tìm thấy trên đĩa, và mọi trạng thái job sẽ được chuẩn hóa. Không cần Postgres đang chạy.

## Những gì được chuyển sang và những gì không {#what-carries-over-and-what-does-not}

Được chuyển sang:

- Người dùng, và khả năng đăng nhập. Mã băm mật khẩu không đổi, nên cùng tên người dùng và mật khẩu vẫn dùng được.
- Nhóm, cài đặt (bao gồm danh tính instance của bạn), vai trò, khóa API (vẫn tiếp tục hoạt động) và các pipeline đã lưu.
- Bản ghi lịch sử job.
- Thư viện tệp đã lưu của bạn, cả bản ghi lẫn tệp thực tế, vì `/data/files` được giữ nguyên trên volume.

Không được chuyển sang:

- Phiên đăng nhập. Mọi người đăng nhập lại một lần sau khi nâng cấp. Thông tin xác thực không đổi, nên chỉ là một lần đăng nhập lại, không hơn.
- Các tệp đầu vào và đầu ra của những job xử lý cũ. Chúng nằm trong không gian làm việc tạm thời và đã mất theo thiết kế. Các bản ghi lịch sử job vẫn còn.
- Cờ đồng ý phân tích theo từng người dùng từ 1.x, vốn không có tương đương trong 2.0 (phân tích của 2.0 là một cài đặt cấp instance).

## Tắt việc nhập {#turning-the-import-off}

Nếu bạn cố ý muốn một cơ sở dữ liệu mới dù có `snapotter.db` trên volume, hãy đặt `SQLITE_MIGRATE_PATH=off`.

## Nếu bạn đã có dữ liệu trong instance 2.0 {#if-you-already-have-data-in-the-2-0-instance}

Trình nhập chỉ chạy vào cơ sở dữ liệu trống. Nếu bạn khởi động 2.0 mới (và tạo dữ liệu), rồi sau đó mount một `snapotter.db` cũ, 2.0 sẽ phát hiện nhưng không nhập, vì việc gộp hai tập dữ liệu có thể xung đột ID. Bạn sẽ thấy một cảnh báo trong log. Để nhập dữ liệu 1.x, bạn cần một instance trống:

- Nếu instance 2.0 chỉ chứa quản trị viên mặc định (bạn chưa thực sự dùng nó), hãy dừng stack, xóa volume Postgres (`SnapOtter-pgdata`), rồi khởi động lại với `/data` cũ có mặt. Nó sẽ nhập sạch sẽ. Thao tác này chỉ xóa dữ liệu Postgres tạm, không xóa cơ sở dữ liệu 1.x của bạn.
- Nếu instance 2.0 chứa dữ liệu thật mà bạn muốn giữ, hai tập dữ liệu không thể tự động gộp. Hãy xuất những gì bạn cần và nhập dữ liệu 1.x vào một bản triển khai mới riêng biệt.

## Quay lại bản cũ {#rolling-back}

Việc nâng cấp không bao giờ sửa đổi hay xóa `snapotter.db` 1.x của bạn. Nếu cần quay lại 1.x, hãy triển khai lại image 1.x với cùng volume. Mọi thứ bạn tạo trong 2.0 sau khi nâng cấp nằm trong Postgres và sẽ không có trong cơ sở dữ liệu 1.x, vì vậy hãy quay lại sớm nếu bạn định làm thế.

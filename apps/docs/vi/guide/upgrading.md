---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: b5e5fc12e058
---
# Nâng cấp từ 1.x lên 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x lưu mọi thứ trong một tệp SQLite duy nhất và chạy trong một container. SnapOtter 2.0 dùng PostgreSQL và Redis. Hướng dẫn này chỉ ra cách chuyển một bản cài đặt 1.x lên 2.0 mà không mất dữ liệu.

Bản tóm tắt ngắn gọn: tái sử dụng volume `/data` hiện có của bạn, và 2.0 sẽ tự động nhập cơ sở dữ liệu 1.x của bạn ở lần khởi động đầu tiên. Người dùng, tệp đã lưu, cài đặt, khóa API và pipeline của bạn đều được chuyển qua. Cơ sở dữ liệu cũ không bao giờ bị sửa đổi, nên bạn luôn có thể quay lui.

::: tip Lưu ý cho người dùng 1.x của chúng tôi
Nhiều bạn đã tin tưởng SnapOtter ngay từ ngày đầu, và phản hồi của bạn đã định hình bản phát hành này. 2.0 thay đổi rất nhiều thứ bên dưới, và hướng dẫn này tồn tại để việc chuyển đổi không khiến bạn mất bất cứ thứ gì bạn quan tâm. Tài khoản, tệp, cài đặt, khóa API và pipeline của bạn được chuyển qua, và cơ sở dữ liệu cũ của bạn không bao giờ bị đụng đến. Cảm ơn bạn đã nâng cấp cùng chúng tôi.
:::

## Trước khi bắt đầu: sao lưu toàn bộ volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Hãy làm điều này trước tiên, mỗi lần. Sao lưu **toàn bộ** volume `/data`, không chỉ tệp `snapotter.db`.

Đây là lý do vì sao điều đó quan trọng. 1.x chạy SQLite ở chế độ WAL, nên một container 1.x đã dừng thường để lại phần lớn dữ liệu đã commit của nó trong `snapotter.db-wal` bên cạnh một `snapotter.db` gần như rỗng. Chỉ sao chép `snapotter.db` sẽ chụp lại một cơ sở dữ liệu rỗng và âm thầm làm mất mọi thứ. Volume mang theo `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, và thư mục `files/` của bạn cùng nhau, và chúng phải đi cùng nhau như một bộ.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Nâng cấp lên 1.17.2 trước {#upgrade-to-1-17-2-first}

Hãy nâng cấp bản cài đặt 1.x của bạn lên bản phát hành 1.x mới nhất (1.17.2) trước khi chuyển sang 2.0. Điều đó để 1.x chạy các migration lược đồ cuối cùng của chính nó, nhờ vậy 2.0 nhập từ một lược đồ đã biết và đầy đủ. Nâng cấp từ một bản 1.x cũ hơn thẳng lên 2.0 không được hỗ trợ.

## Kiểm tra tên volume của bạn {#check-your-volume-name}

Trình nhập chỉ thấy dữ liệu của bạn nếu ngăn xếp 2.0 gắn kết đúng volume mà bản cài đặt 1.x của bạn đã dùng. Tên volume của Docker phân biệt chữ hoa chữ thường, và các đoạn README cũ hơn dùng `snapotter-data` chữ thường trong khi các tệp Compose dùng `SnapOtter-data`. Xác nhận bạn đang có tên nào:

```bash
docker volume ls | grep -i snapotter
```

Dùng đúng tên đó trong cấu hình 2.0 của bạn.

## Hướng A: một container (nhanh nhất) {#path-a-single-container-quickest}

Nếu bạn chạy SnapOtter với một `docker run` duy nhất, hãy tiếp tục làm vậy. 2.0 khởi động một PostgreSQL và Redis nhúng bên trong container khi bạn không đặt `DATABASE_URL` hoặc `REDIS_URL`, và nó tự động phát hiện và nhập `/data/snapotter.db` ở lần khởi động đầu tiên.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Hãy theo dõi log để tìm một dòng như:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Vậy là xong. Đăng nhập bằng thông tin đăng nhập hiện có của bạn.

## Hướng B: Compose (khuyến nghị cho production) {#path-b-compose-recommended-for-production}

Ngăn xếp Compose 2.0 chạy ba dịch vụ (app, Postgres, Redis). Tái sử dụng volume `/data` 1.x của bạn cho dịch vụ app. App tự động phát hiện `/data/snapotter.db` và nhập nó vào Postgres ở lần khởi động đầu tiên.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Nếu bạn muốn trỏ đến cơ sở dữ liệu cũ một cách tường minh, hãy đặt `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Một đường dẫn tường minh luôn thắng so với tự động phát hiện.

## Xem trước quá trình nhập trước (tùy chọn) {#preview-the-import-first-optional}

Để thấy chính xác những gì sẽ được nhập mà không ghi gì cả, hãy chạy một lần thử (dry run) trên tệp cơ sở dữ liệu của bạn:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Nó in số hàng theo từng bảng, số tệp thư viện đã lưu mà nó tìm thấy trên đĩa, và bất kỳ trạng thái job nào nó sẽ chuẩn hóa. Nó không cần một Postgres đang chạy.

## Cái gì được chuyển qua, và cái gì thì không {#what-carries-over-and-what-does-not}

Được chuyển qua:

- Người dùng, và khả năng đăng nhập. Băm mật khẩu không thay đổi, nên cùng tên đăng nhập và mật khẩu vẫn dùng được.
- Nhóm (team), cài đặt (bao gồm danh tính phiên bản của bạn), vai trò, khóa API (chúng vẫn hoạt động), và các pipeline đã lưu.
- Bản ghi lịch sử job.
- Thư viện tệp đã lưu của bạn, cả bản ghi lẫn tệp thực tế, vì `/data/files` được giữ lại trên volume.

Không được chuyển qua:

- Phiên đăng nhập. Mọi người đăng nhập lại một lần sau khi nâng cấp. Thông tin đăng nhập không thay đổi, nên đó chỉ là một lần đăng nhập lại, không hơn.
- Các tệp đầu vào và đầu ra của các job xử lý cũ. Những thứ đó nằm trong một không gian làm việc tạm thời và biến mất theo thiết kế. Bản ghi lịch sử job vẫn còn.
- Cờ đồng ý phân tích theo từng người dùng của 1.x, vốn không có tương đương ở 2.0 (phân tích của 2.0 là một cài đặt ở cấp phiên bản).

## Tắt quá trình nhập {#turning-the-import-off}

Nếu bạn cố ý muốn một cơ sở dữ liệu mới ngay cả khi có một `snapotter.db` hiện diện trên volume, hãy đặt `SQLITE_MIGRATE_PATH=off`.

## Nếu bạn đã có dữ liệu trong phiên bản 2.0 {#if-you-already-have-data-in-the-2-0-instance}

Trình nhập chỉ chạy vào một cơ sở dữ liệu rỗng. Nếu bạn khởi động 2.0 mới toanh (tạo dữ liệu), rồi sau đó gắn kết một `snapotter.db` cũ, 2.0 sẽ phát hiện nó nhưng sẽ không nhập, vì việc gộp hai tập dữ liệu có thể xung đột về ID. Bạn sẽ thấy một cảnh báo trong log. Để nhập dữ liệu 1.x, bạn cần một phiên bản rỗng:

- Nếu phiên bản 2.0 chỉ giữ admin mặc định (bạn chưa thực sự dùng nó), hãy dừng ngăn xếp, xóa volume Postgres (`SnapOtter-pgdata`), và khởi động lại với `/data` cũ hiện diện. Nó sẽ nhập một cách sạch sẽ. Điều này chỉ xóa dữ liệu Postgres tạm bỏ đi, không phải cơ sở dữ liệu 1.x của bạn.
- Nếu phiên bản 2.0 giữ dữ liệu thật mà bạn muốn giữ lại, hai tập dữ liệu không thể tự động gộp. Hãy xuất những gì bạn cần và nhập dữ liệu 1.x vào một bản triển khai mới riêng biệt.

## Quay lui {#rolling-back}

Quá trình nâng cấp không bao giờ sửa đổi hay xóa `snapotter.db` 1.x của bạn. Nếu bạn cần quay lại 1.x, hãy triển khai lại image 1.x trên cùng volume đó. Bất cứ thứ gì bạn tạo trong 2.0 sau khi nâng cấp đều nằm trong Postgres và sẽ không có trong cơ sở dữ liệu 1.x, nên hãy quay lui sớm nếu bạn định làm vậy.

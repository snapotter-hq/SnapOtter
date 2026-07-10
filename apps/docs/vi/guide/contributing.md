---
description: "Cách đóng góp cho SnapOtter. Báo cáo lỗi, yêu cầu tính năng, pull request và các yêu cầu về CLA."
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: 84c90166896b
---

# Đóng góp {#contributing}

Cảm ơn bạn đã quan tâm đến việc đóng góp. Hướng dẫn này trình bày cách tham gia, những gì chúng tôi chấp nhận, và cách bắt đầu.

## Các cách đóng góp {#ways-to-contribute}

### Issue (không cần thiết lập gì) {#issues-no-setup-required}

- **Báo cáo lỗi** - Có thứ gì đó bị hỏng? Hãy mở một [báo cáo lỗi](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) kèm các bước tái hiện.
- **Yêu cầu tính năng** - Bạn có ý tưởng? Hãy bắt đầu một [thảo luận](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) để cộng đồng cân nhắc và bình chọn cho nó.
- **Vấn đề về bản dịch** - Phát hiện một bản dịch sai hoặc thiếu? Hãy mở một [issue về bản dịch](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml).
- **Vấn đề về tài liệu** - Có gì đó không ổn trong tài liệu? Hãy mở một [issue về tài liệu](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml).

### Mã nguồn (yêu cầu CLA) {#code-requires-cla}

Chúng tôi chấp nhận pull request cho:

| Loại | Quy trình |
|------|---------|
| Sửa lỗi | Mở PR trực tiếp (liên kết tới issue nếu có) |
| Bản dịch mới | Mở PR trực tiếp (xem [Hướng dẫn dịch](/vi/guide/translations)) |
| Cải thiện tài liệu | Mở PR trực tiếp |
| Cải thiện độ bao phủ kiểm thử | Mở PR trực tiếp |
| Công cụ hoặc tính năng mới | Bắt đầu một [thảo luận](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) trước; một maintainer sẽ chuyển các ý tưởng đã được phê duyệt thành issue được theo dõi trước khi bạn viết mã |
| Refactor hoặc thay đổi kiến trúc | Bắt đầu một [thảo luận](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) trước và chờ maintainer chấp thuận trước khi viết mã |

### Những gì chúng tôi sẽ không chấp nhận {#what-we-will-not-accept}

- Thay đổi đối với các workflow CI/CD, cấu hình phát hành, hoặc cấu hình linter/compiler
- PR mà không có [Thỏa thuận Giấy phép Người đóng góp](#contributor-license-agreement) đã ký
- PR thay đổi hơn 400 dòng (hãy chia công việc lớn thành các PR nhỏ hơn)
- Tính năng chưa được thảo luận và phê duyệt trước
- Thay đổi đối với `packages/ai/` mà không thảo luận trước

## Thỏa thuận Giấy phép Người đóng góp {#contributor-license-agreement}

Trước khi chúng tôi có thể hợp nhất PR đầu tiên của bạn, bạn phải ký [CLA cá nhân](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) của chúng tôi. Đây là yêu cầu chỉ một lần.

**Tại sao:** SnapOtter cấp phép kép (AGPLv3 + thương mại). CLA trao cho chúng tôi quyền phân phối các đóng góp của bạn theo cả hai giấy phép. Bạn giữ toàn bộ quyền sở hữu bản quyền đối với công việc của mình.

**Bằng cách nào:** Khi bạn mở PR đầu tiên, bot CLA Assistant sẽ để lại bình luận kèm một liên kết. Nhấp vào đó, xem lại thỏa thuận, và ký bằng tài khoản GitHub của bạn. Chỉ mất 30 giây.

Nếu bạn đóng góp thay mặt cho nhà tuyển dụng của mình và nhà tuyển dụng giữ quyền sở hữu trí tuệ đối với công việc của bạn, hãy liên hệ contact@snapotter.com để thu xếp một CLA doanh nghiệp trước khi gửi.

## Bắt đầu {#getting-started}

### Điều kiện tiên quyết {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (chỉ dành cho các công cụ AI)
- Docker (tùy chọn, để kiểm thử tích hợp đầy đủ)

### Thiết lập {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### Chạy kiểm tra {#running-checks}

Trước khi gửi PR, hãy đảm bảo tất cả các kiểm tra đều vượt qua ở máy cục bộ:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## Quy trình pull request {#pull-request-process}

1. Fork repo và tạo một nhánh từ `main` (`feat/my-feature` hoặc `fix/issue-123`)
2. Thực hiện các thay đổi trong những commit tập trung, dễ xem xét bằng [conventional commits](https://www.conventionalcommits.org/)
3. Thêm hoặc cập nhật kiểm thử cho các thay đổi của bạn
4. Chạy `pnpm lint && pnpm typecheck && pnpm test` ở máy cục bộ
5. Mở PR nhắm vào `main` và điền vào mẫu
6. Ký CLA nếu được nhắc
7. Chờ CI vượt qua và một maintainer xem xét

### Kỳ vọng về việc xem xét {#review-expectations}

- Chúng tôi cố gắng phản hồi PR trong vòng 7 ngày
- PR nhỏ, tập trung sẽ được xem xét nhanh hơn
- Nếu bạn không nhận được phản hồi trong 7 ngày, hãy để lại bình luận nhắc trong luồng
- Chúng tôi có thể yêu cầu thay đổi, đề xuất một cách tiếp cận khác, hoặc đóng PR nếu nó không phù hợp với định hướng dự án

### Sau khi PR của bạn được hợp nhất {#after-your-pr-is-merged}

Đóng góp của bạn sẽ được đưa vào bản phát hành tiếp theo và được ghi công trong changelog.

## Good first issues {#good-first-issues}

Đang tìm việc gì đó để làm? Hãy xem [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) của chúng tôi để tìm các nhiệm vụ thân thiện với người mới, hoặc [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) cho những hạng mục lớn hơn nơi chúng tôi rất mong nhận được sự trợ giúp của cộng đồng.

## Phong cách mã {#code-style}

- Biome xử lý định dạng và linting (dấu nháy kép, dấu chấm phẩy, thụt lề 2 khoảng trắng)
- Hook trước khi commit tự động chạy `biome check --write` trên các tệp đã được staged
- Nếu linter phàn nàn, hãy sửa mã (đừng chỉnh sửa cấu hình Biome)
- ES module ở khắp mọi nơi (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Để biết đầy đủ chi tiết kiến trúc, hãy xem [Hướng dẫn dành cho nhà phát triển](/vi/guide/developer).

## Bảo mật {#security}

**Đừng mở PR hoặc issue công khai cho các lỗ hổng bảo mật.** Hãy báo cáo chúng một cách riêng tư qua [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) hoặc email contact@snapotter.com. Xem [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) để biết đầy đủ chi tiết.

## Câu hỏi? {#questions}

- [Tài liệu](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)

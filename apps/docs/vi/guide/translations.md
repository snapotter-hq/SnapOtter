---
description: "21 ngôn ngữ được hỗ trợ và cách tạo hoặc cải thiện bản dịch cho SnapOtter bằng hệ thống i18n được TypeScript đảm bảo tính đầy đủ."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 9b59059ad355
---

# Hướng dẫn dịch thuật {#translation-guide}

SnapOtter được tích hợp sẵn 21 ngôn ngữ. Hệ thống i18n sử dụng một runtime tùy chỉnh nhẹ với tính đầy đủ của locale được TypeScript đảm bảo và tách mã (code-splitting) động.

## Các ngôn ngữ được hỗ trợ {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Tiếng Anh | English | LTR |
| `zh-CN` | Tiếng Trung (Giản thể) | 简体中文 | LTR |
| `zh-TW` | Tiếng Trung (Phồn thể) | 繁體中文 | LTR |
| `ja` | Tiếng Nhật | 日本語 | LTR |
| `ko` | Tiếng Hàn | 한국어 | LTR |
| `es` | Tiếng Tây Ban Nha | Español | LTR |
| `fr` | Tiếng Pháp | Français | LTR |
| `it` | Tiếng Ý | Italiano | LTR |
| `pt-BR` | Tiếng Bồ Đào Nha (Brazil) | Português (Brasil) | LTR |
| `de` | Tiếng Đức | Deutsch | LTR |
| `nl` | Tiếng Hà Lan | Nederlands | LTR |
| `sv` | Tiếng Thụy Điển | Svenska | LTR |
| `ru` | Tiếng Nga | Русский | LTR |
| `pl` | Tiếng Ba Lan | Polski | LTR |
| `uk` | Tiếng Ukraina | Українська | LTR |
| `ar` | Tiếng Ả Rập | العربية | RTL |
| `tr` | Tiếng Thổ Nhĩ Kỳ | Türkçe | LTR |
| `hi` | Tiếng Hindi | हिन्दी | LTR |
| `vi` | Tiếng Việt | Tiếng Việt | LTR |
| `id` | Tiếng Indonesia | Bahasa Indonesia | LTR |
| `th` | Tiếng Thái | ไทย | LTR |

## Cách phát hiện ngôn ngữ hoạt động {#how-language-detection-works}

SnapOtter sử dụng thứ tự phân giải theo ba tầng:

1. **Tùy chọn của người dùng** - được lưu trong `localStorage("snapotter-locale")` và đồng bộ vào cài đặt người dùng khi đã xác thực
2. **Tự động phát hiện của trình duyệt** - duyệt qua mảng `navigator.languages` với so khớp tiền tố BCP 47
3. **Mặc định của instance** - biến môi trường `DEFAULT_LOCALE` của quản trị viên (được lấy từ `GET /api/v1/config/locale`)
4. **Dự phòng tiếng Anh** - luôn có sẵn

Người dùng có thể thay đổi ngôn ngữ từ:
- **Bộ chọn Globe ở chân trang** (máy tính để bàn, luôn hiển thị)
- Bộ chọn ngôn ngữ trên **trang đăng nhập** (trước khi xác thực)
- Mục **Settings > General** (tùy chọn theo từng người dùng)
- Trình đơn thả xuống ngôn ngữ trong **thanh bên trên di động**
- Mục **Settings > System** thiết lập mặc định cho toàn bộ instance (chỉ quản trị viên)

## Cách các bản dịch hoạt động {#how-translations-work}

Tất cả các chuỗi giao diện đều nằm trong `packages/shared/src/i18n/`. Tệp tham chiếu là `en.ts`, tệp này xuất ra một đối tượng có kiểu với mọi chuỗi mà ứng dụng sử dụng (~1500 khóa). Các ngôn ngữ khác là những tệp riêng biệt (ví dụ `de.ts`, `fr.ts`) xuất ra cùng một hình dạng.

Kiểu `TranslationKeys` dùng `DeepStringRecord` để chấp nhận bất kỳ giá trị chuỗi nào trong khi vẫn đảm bảo cấu trúc khóa. TypeScript phát hiện các khóa bị thiếu trong bất kỳ tệp dịch nào tại thời điểm biên dịch.

Chỉ locale đang hoạt động mới được tải tại runtime thông qua `import()` động, giúp bundle chính nhỏ gọn.

## Sử dụng bản dịch trong các component {#using-translations-in-components}

```tsx
import { useTranslation } from "@/contexts/i18n-context";
import { format, plural } from "@/lib/format";

function MyComponent() {
  const { t, locale, setLocale } = useTranslation();
  
  return (
    <div>
      <h1>{t.common.settings}</h1>
      <p>{format(t.settings.people.deleteConfirm, { username: "admin" })}</p>
      <p>{plural(count, t.automate.fileCount, t.automate.fileCountPlural)}</p>
    </div>
  );
}
```

## Đóng góp một bản dịch {#contributing-a-translation}

Chúng tôi hoan nghênh các PR dịch thuật gửi trực tiếp. Bạn có thể cải thiện một locale hiện có hoặc thêm một locale mới.

Để báo cáo một lỗi dịch mà không cần gửi mã, hãy mở một [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) kèm theo ngôn ngữ, chuỗi bị sai và bản sửa đề xuất.

::: tip 
Các PR dịch thuật không cần phê duyệt trước. Hãy fork kho lưu trữ, thực hiện thay đổi của bạn và mở một PR. Xem [Hướng dẫn Đóng góp](/vi/guide/contributing) để biết toàn bộ quy trình PR và yêu cầu về CLA.
:::

## Cách tạo hoặc cập nhật một bản dịch {#how-to-create-or-update-a-translation}

### 1. Fork và clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Sao chép tệp tham chiếu (chỉ với ngôn ngữ mới) {#_2-copy-the-reference-file-new-language-only}

Bỏ qua bước này nếu bạn đang cải thiện một bản dịch hiện có.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Dịch các chuỗi {#_3-translate-the-strings}

Mở tệp mới của bạn và dịch mọi giá trị chuỗi. Giữ nguyên cấu trúc đối tượng và các khóa y hệt như cũ.

```ts
import type { TranslationKeys } from "./en.js";

export const xx: TranslationKeys = {
  common: {
    upload: "Your translation here",
    // ... translate all entries
  },
  // ... translate all sections
} as const;
```

Quy tắc:
- Không dịch các khóa của đối tượng, chỉ dịch các giá trị chuỗi
- Giữ `as const` ở cuối
- Import `TranslationKeys` từ `./en.js` và gán kiểu cho phần export của bạn
- Giữ nguyên các placeholder `{variable}` y hệt như cũ
- Các mảng (`rotatingPhrases`, `progressMessages`) phải có cùng số lượng phần tử
- Không dịch: SnapOtter, JPEG, PNG, WebP, EXIF, API và các thuật ngữ kỹ thuật khác

### 4. Đăng ký locale (chỉ với ngôn ngữ mới) {#_4-register-the-locale-new-language-only}

Thêm locale của bạn vào `SUPPORTED_LOCALES` trong `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Kiểm chứng {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Gửi {#_6-submit}

Mở một PR nhắm vào `main` với tiêu đề dạng như `feat(i18n): add Swedish translation` hoặc `fix(i18n): correct German typos`. Bot CLA sẽ yêu cầu bạn ký khi đóng góp lần đầu.

## Thêm các khóa dịch mới {#adding-new-translation-keys}

Khi thêm một tính năng mới cần các chuỗi giao diện mới:

1. Thêm các khóa mới vào `en.ts` trước (tệp tham chiếu)
2. Chạy `pnpm typecheck` - mọi tệp locale sẽ thất bại nếu thiếu khóa mới
3. Thêm khóa mới vào tất cả các tệp locale (dùng tiếng Anh làm bản dự phòng tạm thời)

## Cấu hình {#configuration}

Đặt ngôn ngữ mặc định của instance thông qua biến môi trường:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Tham chiếu tệp {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Các chuỗi tiếng Anh (locale tham chiếu, ~1500 khóa) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, export kiểu |
| `packages/shared/src/i18n/<locale>.ts` | Các tệp dịch theo từng ngôn ngữ |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Các hàm trợ giúp `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint công khai `GET /api/v1/config/locale` |

## Dịch website, tài liệu và tham chiếu API {#translating-the-web-surfaces}

Sự hỗ trợ 21 ngôn ngữ ở trên bao trùm **ứng dụng**. Website công khai
(snapotter.com), trang tài liệu này và tham chiếu REST API cũng được
dịch sang toàn bộ 21 ngôn ngữ, bằng một pipeline có kiểm soát theo hash riêng biệt tái sử dụng
chính các tên và mô tả công cụ từ `packages/shared/src/i18n`, nhờ đó
thuật ngữ luôn nhất quán ở mọi nơi.

### Dịch bằng máy theo mặc định {#machine-translated-by-default}

Mọi trang không phải tiếng Anh trên website và tài liệu đều được **dịch bằng máy** ở
lượt đầu tiên (bởi một phiên Claude Code, không phải dịch vụ bên thứ ba) và mang
một biểu ngữ nhỏ, có thể đóng lại, ghi rõ điều đó, kèm liên kết quay về đây. Đó là chủ ý:
nó phát hành toàn bộ 21 ngôn ngữ một cách nhanh chóng và trung thực, rồi mời cộng đồng
tinh chỉnh những trang quan trọng nhất. Dịch máy truyền tải được ý nghĩa;
rà soát của con người khiến nó đọc lên tự nhiên.

### Cách pipeline quyết định dịch những gì {#how-the-web-pipeline-decides}

Mỗi đơn vị nguồn tiếng Anh có thể dịch được đều được băm (hash), và hash được lưu ngay
bên cạnh bản dịch của nó. Ở mỗi lần chạy, pipeline sẽ:

- dịch bất kỳ đơn vị nào chưa có bản dịch,
- bỏ qua bất kỳ đơn vị nào có hash đã lưu vẫn khớp với nguồn tiếng Anh,
- dịch lại một đơn vị **máy** khi nguồn tiếng Anh của nó thay đổi,
- và gắn cờ một đơn vị đã được con người tinh chỉnh (**human**) là `stale` (cần rà soát) khi nguồn tiếng Anh
  của nó thay đổi, thay vì ghi đè lên công sức của bạn.

### Tinh chỉnh một bản dịch web bằng PR {#refining-a-web-translation-by-pr}

Bạn cải thiện một bản dịch của website, tài liệu hoặc tham chiếu API theo cùng cách bạn
cải thiện một locale của ứng dụng: bằng cách chỉnh sửa tệp được tạo ra và mở một PR.

1. Tìm bản dịch được tạo ra cho ngôn ngữ của bạn:
   - các chuỗi giao diện website: `apps/landing/src/i18n/<locale>.json`
   - một trang tài liệu: `apps/docs/<locale>/**.md`
   - tham chiếu API: `apps/api/src/openapi.<locale>.yaml`
2. Chỉnh sửa văn bản. Giữ nguyên mã, liên kết, `{placeholders}` và mọi dấu `⸤I18N…⸥`
   y hệt như cũ; bộ kiểm chứng của pipeline sẽ từ chối một bản dịch làm mất
   hoặc sắp xếp lại chúng.
3. Mở một PR. Việc chỉnh sửa một đơn vị sẽ chuyển nguồn gốc của nó từ `machine` sang `human`, nhờ đó
   pipeline sẽ **không bao giờ ghi đè nó** ở lần chạy về sau. Nếu nguồn tiếng Anh
   thay đổi sau đó, đơn vị của bạn được gắn cờ `stale` để rà soát thay vì bị
   thay thế một cách âm thầm.

Để báo cáo một lỗi dịch mà không cần gửi mã, hãy mở một
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) kèm theo URL
trang, ngôn ngữ, văn bản bị sai và bản sửa đề xuất của bạn.

::: tip 
Những người bảo trì sẽ chạy pipeline dịch thuật; bạn không cần khóa API để
đóng góp. Chỉ cần chỉnh sửa tệp được tạo ra và mở một PR. Xem
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
để biết cách pipeline chạy.
:::
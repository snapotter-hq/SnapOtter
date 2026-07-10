---
description: "21 ngôn ngữ được hỗ trợ và cách tạo hoặc cải thiện bản dịch cho SnapOtter bằng hệ thống i18n được TypeScript kiểm soát chặt chẽ."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 5dd8b38a1124
---

# Hướng dẫn dịch thuật {#translation-guide}

SnapOtter được cung cấp sẵn 21 ngôn ngữ. Hệ thống i18n dùng một runtime tùy chỉnh nhẹ với tính đầy đủ của locale được TypeScript kiểm soát và tách mã (code-splitting) động.

## Các ngôn ngữ được hỗ trợ {#supported-languages}

| Mã | Ngôn ngữ | Tên bản địa | Hướng |
|------|----------|-------------|-----------|
| `en` | English | English | LTR |
| `zh-CN` | Chinese (Simplified) | 简体中文 | LTR |
| `zh-TW` | Chinese (Traditional) | 繁體中文 | LTR |
| `ja` | Japanese | 日本語 | LTR |
| `ko` | Korean | 한국어 | LTR |
| `es` | Spanish | Español | LTR |
| `fr` | French | Français | LTR |
| `it` | Italian | Italiano | LTR |
| `pt-BR` | Portuguese (Brazil) | Português (Brasil) | LTR |
| `de` | German | Deutsch | LTR |
| `nl` | Dutch | Nederlands | LTR |
| `sv` | Swedish | Svenska | LTR |
| `ru` | Russian | Русский | LTR |
| `pl` | Polish | Polski | LTR |
| `uk` | Ukrainian | Українська | LTR |
| `ar` | Arabic | العربية | RTL |
| `tr` | Turkish | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamese | Tiếng Việt | LTR |
| `id` | Indonesian | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## Cách phát hiện ngôn ngữ hoạt động {#how-language-detection-works}

SnapOtter dùng thứ tự phân giải ba tầng:

1. **Tùy chọn của người dùng** - được lưu trong `localStorage("snapotter-locale")` và đồng bộ vào cài đặt người dùng khi đã xác thực
2. **Tự động phát hiện của trình duyệt** - duyệt qua mảng `navigator.languages` với khớp tiền tố BCP 47
3. **Mặc định của phiên bản (instance)** - biến môi trường `DEFAULT_LOCALE` của quản trị viên (lấy từ `GET /api/v1/config/locale`)
4. **Dự phòng tiếng Anh** - luôn khả dụng

Người dùng có thể thay đổi ngôn ngữ từ:
- **Bộ chọn Globe ở chân trang** (desktop, luôn hiển thị)
- Bộ chọn ngôn ngữ trên **trang đăng nhập** (trước khi xác thực)
- Mục **Settings > General** (tùy chọn theo từng người dùng)
- Trình đơn thả ngôn ngữ trong **thanh bên trên di động**
- Mục **Settings > System** đặt mặc định cho toàn phiên bản (chỉ quản trị viên)

## Cách bản dịch hoạt động {#how-translations-work}

Tất cả chuỗi giao diện nằm trong `packages/shared/src/i18n/`. Tệp tham chiếu là `en.ts`, nó xuất ra một đối tượng có kiểu chứa mọi chuỗi mà ứng dụng dùng (~1500 khóa). Các ngôn ngữ khác là những tệp riêng (ví dụ `de.ts`, `fr.ts`) xuất ra cùng cấu trúc.

Kiểu `TranslationKeys` dùng `DeepStringRecord` để chấp nhận bất kỳ giá trị chuỗi nào trong khi vẫn ép buộc cấu trúc khóa. TypeScript bắt các khóa bị thiếu trong bất kỳ tệp dịch nào tại thời điểm biên dịch.

Chỉ locale đang hoạt động được tải lúc runtime thông qua `import()` động, giữ cho bundle chính nhỏ gọn.

## Sử dụng bản dịch trong các thành phần {#using-translations-in-components}

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

Chúng tôi hoan nghênh các PR dịch thuật trực tiếp. Bạn có thể cải thiện một locale hiện có hoặc thêm một locale mới.

Để báo cáo một lỗi dịch mà không cần gửi mã, hãy mở một [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) kèm ngôn ngữ, chuỗi bị dịch sai và bản sửa được đề xuất.

::: tip 
Các PR dịch thuật không cần được phê duyệt trước. Fork kho, thực hiện thay đổi và mở một PR. Xem [Hướng dẫn đóng góp](/vi/guide/contributing) để biết toàn bộ quy trình PR và yêu cầu CLA.
:::

## Cách tạo hoặc cập nhật một bản dịch {#how-to-create-or-update-a-translation}

### 1. Fork và clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Sao chép tệp tham chiếu (chỉ khi thêm ngôn ngữ mới) {#_2-copy-the-reference-file-new-language-only}

Bỏ qua bước này nếu bạn đang cải thiện một bản dịch hiện có.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Dịch các chuỗi {#_3-translate-the-strings}

Mở tệp mới của bạn và dịch mọi giá trị chuỗi. Giữ nguyên cấu trúc đối tượng và các khóa y hệt.

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
- Không dịch các khóa đối tượng, chỉ dịch giá trị chuỗi
- Giữ `as const` ở cuối
- Import `TranslationKeys` từ `./en.js` và gán kiểu cho export của bạn
- Giữ nguyên các placeholder `{variable}` đúng như hiện trạng
- Các mảng (`rotatingPhrases`, `progressMessages`) phải có cùng số lượng phần tử
- Không dịch: SnapOtter, JPEG, PNG, WebP, EXIF, API, và các thuật ngữ kỹ thuật khác

### 4. Đăng ký locale (chỉ khi thêm ngôn ngữ mới) {#_4-register-the-locale-new-language-only}

Thêm locale của bạn vào `SUPPORTED_LOCALES` trong `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Kiểm tra {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Gửi {#_6-submit}

Mở một PR nhắm vào `main` với tiêu đề như `feat(i18n): add Swedish translation` hoặc `fix(i18n): correct German typos`. Bot CLA sẽ yêu cầu bạn ký ở lần đóng góp đầu tiên.

## Thêm khóa dịch mới {#adding-new-translation-keys}

Khi thêm một tính năng mới cần chuỗi giao diện mới:

1. Thêm khóa mới vào `en.ts` trước (tệp tham chiếu)
2. Chạy `pnpm typecheck` - mọi tệp locale sẽ báo lỗi nếu thiếu khóa mới
3. Thêm khóa mới vào tất cả tệp locale (dùng tiếng Anh làm dự phòng tạm thời)

## Cấu hình {#configuration}

Đặt ngôn ngữ mặc định của phiên bản qua biến môi trường:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Tham chiếu tệp {#file-reference}

| Tệp | Mục đích |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Chuỗi tiếng Anh (locale tham chiếu, ~1500 khóa) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, xuất kiểu |
| `packages/shared/src/i18n/<locale>.ts` | Các tệp dịch theo từng ngôn ngữ |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Các hàm hỗ trợ `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint công khai `GET /api/v1/config/locale` |

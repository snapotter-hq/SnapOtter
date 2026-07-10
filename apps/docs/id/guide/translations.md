---
description: "21 bahasa yang didukung dan cara membuat atau menyempurnakan terjemahan untuk SnapOtter menggunakan sistem i18n yang ditegakkan oleh TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: b81632480637
---

# Panduan terjemahan {#translation-guide}

SnapOtter hadir dengan 21 bahasa secara bawaan. Sistem i18n menggunakan runtime kustom yang ringan dengan kelengkapan lokal yang ditegakkan oleh TypeScript dan pemisahan kode dinamis.

## Bahasa yang didukung {#supported-languages}

| Kode | Bahasa | Nama Asli | Arah |
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

## Cara kerja deteksi bahasa {#how-language-detection-works}

SnapOtter menggunakan urutan resolusi tiga tingkat:

1. **Preferensi pengguna** - disimpan di `localStorage("snapotter-locale")` dan disinkronkan ke pengaturan pengguna saat terautentikasi
2. **Deteksi otomatis peramban** - menelusuri array `navigator.languages` dengan pencocokan awalan BCP 47
3. **Bawaan instans** - variabel env `DEFAULT_LOCALE` milik admin (diambil dari `GET /api/v1/config/locale`)
4. **Fallback bahasa Inggris** - selalu tersedia

Pengguna dapat mengubah bahasa dari:
- **Pemilih Globe di footer** (desktop, selalu terlihat)
- Pemilih bahasa di **halaman login** (pra-autentikasi)
- Bagian **Settings > General** (preferensi per pengguna)
- Dropdown bahasa di **sidebar seluler**
- Bagian **Settings > System** mengatur bawaan seluruh instans (khusus admin)

## Cara kerja terjemahan {#how-translations-work}

Semua string UI berada di `packages/shared/src/i18n/`. File acuan adalah `en.ts`, yang mengekspor objek bertipe berisi setiap string yang digunakan aplikasi (~1500 kunci). Bahasa lain adalah file terpisah (mis. `de.ts`, `fr.ts`) yang mengekspor bentuk yang sama.

Tipe `TranslationKeys` menggunakan `DeepStringRecord` untuk menerima nilai string apa pun sambil menegakkan struktur kunci. TypeScript menangkap kunci yang hilang di file terjemahan mana pun pada waktu kompilasi.

Hanya lokal aktif yang dimuat saat runtime melalui `import()` dinamis, menjaga bundel utama tetap kecil.

## Menggunakan terjemahan di komponen {#using-translations-in-components}

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

## Berkontribusi terjemahan {#contributing-a-translation}

Kami menyambut PR terjemahan secara langsung. Anda dapat menyempurnakan lokal yang ada atau menambahkan yang baru.

Untuk melaporkan kesalahan terjemahan tanpa mengirimkan kode, buka [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) dengan menyertakan bahasa, string yang salah, dan perbaikan yang disarankan.

::: tip 
PR terjemahan tidak memerlukan persetujuan sebelumnya. Fork repo, buat perubahan Anda, dan buka PR. Lihat [Contributing Guide](/id/guide/contributing) untuk proses PR lengkap dan persyaratan CLA.
:::

## Cara membuat atau memperbarui terjemahan {#how-to-create-or-update-a-translation}

### 1. Fork dan clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Salin file acuan (khusus bahasa baru) {#_2-copy-the-reference-file-new-language-only}

Lewati langkah ini jika Anda menyempurnakan terjemahan yang sudah ada.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Terjemahkan string {#_3-translate-the-strings}

Buka file baru Anda dan terjemahkan setiap nilai string. Jaga struktur objek dan kunci tetap persis sama.

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

Aturan:
- Jangan menerjemahkan kunci objek, hanya nilai string
- Jaga `as const` di bagian akhir
- Impor `TranslationKeys` dari `./en.js` dan beri tipe pada ekspor Anda
- Jaga placeholder `{variable}` persis apa adanya
- Array (`rotatingPhrases`, `progressMessages`) harus memiliki jumlah entri yang sama
- Jangan menerjemahkan: SnapOtter, JPEG, PNG, WebP, EXIF, API, dan istilah teknis lainnya

### 4. Daftarkan lokal (khusus bahasa baru) {#_4-register-the-locale-new-language-only}

Tambahkan lokal Anda ke `SUPPORTED_LOCALES` di `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifikasi {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Kirim {#_6-submit}

Buka PR terhadap `main` dengan judul seperti `feat(i18n): add Swedish translation` atau `fix(i18n): correct German typos`. Bot CLA akan meminta Anda menandatangani pada kontribusi pertama Anda.

## Menambahkan kunci terjemahan baru {#adding-new-translation-keys}

Saat menambahkan fitur baru yang membutuhkan string UI baru:

1. Tambahkan kunci baru ke `en.ts` terlebih dahulu (file acuan)
2. Jalankan `pnpm typecheck` - setiap file lokal akan gagal jika kunci baru tidak ada
3. Tambahkan kunci baru ke semua file lokal (gunakan bahasa Inggris sebagai fallback sementara)

## Konfigurasi {#configuration}

Atur bahasa bawaan instans melalui variabel lingkungan:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referensi file {#file-reference}

| File | Tujuan |
|------|---------|
| `packages/shared/src/i18n/en.ts` | String bahasa Inggris (lokal acuan, ~1500 kunci) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, ekspor tipe |
| `packages/shared/src/i18n/<locale>.ts` | File terjemahan per bahasa |
| `apps/web/src/contexts/i18n-context.tsx` | Hook `I18nProvider`, `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helper `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint publik `GET /api/v1/config/locale` |

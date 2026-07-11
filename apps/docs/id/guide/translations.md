---
description: "21 bahasa yang didukung dan cara membuat atau meningkatkan terjemahan untuk SnapOtter menggunakan sistem i18n yang diberlakukan oleh TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 00579c8e1791
---

# Panduan terjemahan {#translation-guide}

SnapOtter hadir dengan 21 bahasa secara bawaan. Sistem i18n menggunakan runtime khusus yang ringan dengan kelengkapan locale yang diberlakukan oleh TypeScript dan pemisahan kode dinamis.

## Bahasa yang didukung {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Inggris | English | LTR |
| `zh-CN` | Tionghoa (Sederhana) | 简体中文 | LTR |
| `zh-TW` | Tionghoa (Tradisional) | 繁體中文 | LTR |
| `ja` | Jepang | 日本語 | LTR |
| `ko` | Korea | 한국어 | LTR |
| `es` | Spanyol | Español | LTR |
| `fr` | Prancis | Français | LTR |
| `it` | Italia | Italiano | LTR |
| `pt-BR` | Portugis (Brasil) | Português (Brasil) | LTR |
| `de` | Jerman | Deutsch | LTR |
| `nl` | Belanda | Nederlands | LTR |
| `sv` | Swedia | Svenska | LTR |
| `ru` | Rusia | Русский | LTR |
| `pl` | Polandia | Polski | LTR |
| `uk` | Ukraina | Українська | LTR |
| `ar` | Arab | العربية | RTL |
| `tr` | Turki | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnam | Tiếng Việt | LTR |
| `id` | Indonesia | Bahasa Indonesia | LTR |
| `th` | Thai | ไทย | LTR |

## Cara kerja deteksi bahasa {#how-language-detection-works}

SnapOtter menggunakan urutan resolusi tiga tingkat:

1. **Preferensi pengguna** - disimpan di `localStorage("snapotter-locale")` dan disinkronkan ke pengaturan pengguna saat terautentikasi
2. **Deteksi otomatis browser** - menelusuri array `navigator.languages` dengan pencocokan prefiks BCP 47
3. **Bawaan instans** - variabel env `DEFAULT_LOCALE` milik admin (diambil dari `GET /api/v1/config/locale`)
4. **Cadangan bahasa Inggris** - selalu tersedia

Pengguna dapat mengubah bahasa dari:
- **Pemilih Globe di footer** (desktop, selalu terlihat)
- Pemilih bahasa di **halaman login** (sebelum autentikasi)
- Bagian **Settings > General** (preferensi per pengguna)
- Dropdown bahasa di **sidebar seluler**
- Bagian **Settings > System** yang menetapkan bawaan seluruh instans (khusus admin)

## Cara kerja terjemahan {#how-translations-work}

Semua string UI berada di `packages/shared/src/i18n/`. File referensinya adalah `en.ts`, yang mengekspor objek bertipe berisi setiap string yang digunakan aplikasi (~1500 kunci). Bahasa lain adalah file terpisah (mis. `de.ts`, `fr.ts`) yang mengekspor bentuk yang sama.

Tipe `TranslationKeys` menggunakan `DeepStringRecord` untuk menerima nilai string apa pun sambil memberlakukan struktur kunci. TypeScript menangkap kunci yang hilang di file terjemahan mana pun pada waktu kompilasi.

Hanya locale aktif yang dimuat saat runtime melalui `import()` dinamis, menjaga bundel utama tetap kecil.

## Menggunakan terjemahan dalam komponen {#using-translations-in-components}

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

## Menyumbangkan terjemahan {#contributing-a-translation}

Kami menyambut PR terjemahan secara langsung. Anda dapat meningkatkan locale yang sudah ada atau menambahkan yang baru.

Untuk melaporkan kesalahan terjemahan tanpa mengirimkan kode, buka [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) dengan bahasa, string yang salah, dan perbaikan yang disarankan.

::: tip 
PR terjemahan tidak memerlukan persetujuan sebelumnya. Fork repo, lakukan perubahan Anda, dan buka PR. Lihat [Contributing Guide](/id/guide/contributing) untuk proses PR lengkap dan persyaratan CLA.
:::

## Cara membuat atau memperbarui terjemahan {#how-to-create-or-update-a-translation}

### 1. Fork dan clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Salin file referensi (hanya bahasa baru) {#_2-copy-the-reference-file-new-language-only}

Lewati langkah ini jika Anda meningkatkan terjemahan yang sudah ada.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Terjemahkan string {#_3-translate-the-strings}

Buka file baru Anda dan terjemahkan setiap nilai string. Pertahankan struktur objek dan kunci persis sama.

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
- Pertahankan `as const` di akhir
- Impor `TranslationKeys` dari `./en.js` dan beri tipe pada ekspor Anda
- Pertahankan placeholder `{variable}` persis apa adanya
- Array (`rotatingPhrases`, `progressMessages`) harus memiliki jumlah entri yang sama
- Jangan menerjemahkan: SnapOtter, JPEG, PNG, WebP, EXIF, API, dan istilah teknis lainnya

### 4. Daftarkan locale (hanya bahasa baru) {#_4-register-the-locale-new-language-only}

Tambahkan locale Anda ke `SUPPORTED_LOCALES` di `packages/shared/src/i18n/index.ts`:

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

Saat menambahkan fitur baru yang memerlukan string UI baru:

1. Tambahkan kunci baru ke `en.ts` terlebih dahulu (file referensi)
2. Jalankan `pnpm typecheck` - setiap file locale akan gagal jika kekurangan kunci baru
3. Tambahkan kunci baru ke semua file locale (gunakan bahasa Inggris sebagai cadangan sementara)

## Konfigurasi {#configuration}

Tetapkan bahasa bawaan instans melalui variabel lingkungan:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referensi file {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | String bahasa Inggris (locale referensi, ~1500 kunci) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, ekspor tipe |
| `packages/shared/src/i18n/<locale>.ts` | File terjemahan per bahasa |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helper `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint publik `GET /api/v1/config/locale` |

## Menerjemahkan situs web, dokumentasi, dan referensi API {#translating-the-web-surfaces}

Dukungan 21 bahasa di atas mencakup **aplikasi**. Situs web publik
(snapotter.com), situs dokumentasi ini, dan referensi REST API juga
diterjemahkan ke seluruh 21 bahasa, oleh pipeline terpisah yang digerbang hash dan menggunakan kembali
nama dan deskripsi tool yang sama dari `packages/shared/src/i18n`, sehingga
terminologi tetap konsisten di mana-mana.

### Diterjemahkan mesin secara bawaan {#machine-translated-by-default}

Setiap halaman non-Inggris di situs web dan dokumentasi **diterjemahkan mesin** pada
lintasan pertama (oleh sesi Claude Code, bukan layanan pihak ketiga) dan membawa
banner kecil yang dapat ditutup yang menyatakan demikian, dengan tautan kembali ke sini. Itu disengaja:
ia mengirimkan seluruh 21 bahasa dengan cepat dan jujur, lalu mengundang komunitas untuk
menyempurnakan halaman yang paling penting. Terjemahan mesin menyampaikan maknanya;
tinjauan manusia membuatnya terbaca secara alami.

### Cara pipeline memutuskan apa yang diterjemahkan {#how-the-web-pipeline-decides}

Setiap unit sumber bahasa Inggris yang dapat diterjemahkan di-hash, dan hash-nya disimpan di samping
terjemahannya. Pada setiap eksekusi, pipeline:

- menerjemahkan unit apa pun yang belum memiliki terjemahan,
- melewati unit apa pun yang hash tersimpannya masih cocok dengan sumber bahasa Inggris,
- menerjemahkan ulang unit **mesin** ketika sumber bahasa Inggrisnya berubah,
- dan menandai unit yang disempurnakan **manusia** sebagai `stale` (perlu ditinjau) ketika sumber
  bahasa Inggrisnya berubah, alih-alih menimpa pekerjaan Anda.

### Menyempurnakan terjemahan web melalui PR {#refining-a-web-translation-by-pr}

Anda meningkatkan terjemahan situs web, dokumentasi, atau referensi API dengan cara yang sama seperti Anda
meningkatkan locale aplikasi: dengan menyunting file yang dihasilkan dan membuka PR.

1. Temukan terjemahan yang dihasilkan untuk bahasa Anda:
   - string UI situs web: `apps/landing/src/i18n/<locale>.json`
   - halaman dokumentasi: `apps/docs/<locale>/**.md`
   - referensi API: `apps/api/src/openapi.<locale>.yaml`
2. Sunting teksnya. Pertahankan kode, tautan, `{placeholders}`, dan penanda `⸤I18N…⸥` apa pun
   persis seperti apa adanya; validator pipeline menolak terjemahan yang menghilangkan
   atau menyusun ulang keduanya.
3. Buka PR. Menyunting sebuah unit membalik provenansinya dari `machine` menjadi `human`, sehingga
   pipeline akan **tidak pernah menimpanya** pada eksekusi berikutnya. Jika sumber bahasa Inggris
   berubah setelahnya, unit Anda ditandai `stale` untuk ditinjau alih-alih
   diganti secara diam-diam.

Untuk melaporkan kesalahan terjemahan tanpa mengirimkan kode, buka
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) dengan
URL halaman, bahasa, teks yang salah, dan perbaikan yang Anda sarankan.

::: tip 
Pemelihara menjalankan pipeline terjemahan; Anda tidak memerlukan kunci API untuk
berkontribusi. Cukup sunting file yang dihasilkan dan buka PR. Lihat
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
untuk cara pipeline berjalan.
:::

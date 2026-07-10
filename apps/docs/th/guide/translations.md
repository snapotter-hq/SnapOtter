---
description: "21 ภาษาที่รองรับ และวิธีสร้างหรือปรับปรุงคำแปลสำหรับ SnapOtter โดยใช้ระบบ i18n ที่บังคับใช้ด้วย TypeScript"
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 7229ca90b281
---

# คู่มือการแปล {#translation-guide}

SnapOtter มาพร้อมกับ 21 ภาษาตั้งแต่ต้น ระบบ i18n ใช้รันไทม์แบบกำหนดเองที่มีน้ำหนักเบา พร้อมการบังคับใช้ความครบถ้วนของภาษาด้วย TypeScript และการแยกโค้ดแบบไดนามิก

## ภาษาที่รองรับ {#supported-languages}

| Code | ภาษา | ชื่อในภาษานั้น | ทิศทาง |
|------|----------|-------------|-----------|
| `en` | อังกฤษ | English | LTR |
| `zh-CN` | จีน (ตัวย่อ) | 简体中文 | LTR |
| `zh-TW` | จีน (ตัวเต็ม) | 繁體中文 | LTR |
| `ja` | ญี่ปุ่น | 日本語 | LTR |
| `ko` | เกาหลี | 한국어 | LTR |
| `es` | สเปน | Español | LTR |
| `fr` | ฝรั่งเศส | Français | LTR |
| `it` | อิตาลี | Italiano | LTR |
| `pt-BR` | โปรตุเกส (บราซิล) | Português (Brasil) | LTR |
| `de` | เยอรมัน | Deutsch | LTR |
| `nl` | ดัตช์ | Nederlands | LTR |
| `sv` | สวีเดน | Svenska | LTR |
| `ru` | รัสเซีย | Русский | LTR |
| `pl` | โปแลนด์ | Polski | LTR |
| `uk` | ยูเครน | Українська | LTR |
| `ar` | อาหรับ | العربية | RTL |
| `tr` | ตุรกี | Türkçe | LTR |
| `hi` | ฮินดี | हिन्दी | LTR |
| `vi` | เวียดนาม | Tiếng Việt | LTR |
| `id` | อินโดนีเซีย | Bahasa Indonesia | LTR |
| `th` | ไทย | ไทย | LTR |

## การตรวจจับภาษาทำงานอย่างไร {#how-language-detection-works}

SnapOtter ใช้ลำดับการแก้ปัญหาแบบสามชั้น:

1. **การตั้งค่าของผู้ใช้** - จัดเก็บใน `localStorage("snapotter-locale")` และซิงค์ไปยังการตั้งค่าผู้ใช้เมื่อผ่านการยืนยันตัวตน
2. **การตรวจจับอัตโนมัติของเบราว์เซอร์** - ไล่ผ่านอาร์เรย์ `navigator.languages` ด้วยการจับคู่คำนำหน้าตาม BCP 47
3. **ค่าเริ่มต้นของอินสแตนซ์** - env var `DEFAULT_LOCALE` ของผู้ดูแลระบบ (ดึงมาจาก `GET /api/v1/config/locale`)
4. **การถอยกลับเป็นภาษาอังกฤษ** - มีให้ใช้เสมอ

ผู้ใช้สามารถเปลี่ยนภาษาได้จาก:
- **ตัวเลือกไอคอนลูกโลกที่ส่วนท้าย** (เดสก์ท็อป มองเห็นได้เสมอ)
- ตัวเลือกภาษาที่ **หน้าเข้าสู่ระบบ** (ก่อนยืนยันตัวตน)
- ส่วน **Settings > General** (การตั้งค่าเฉพาะผู้ใช้)
- เมนูภาษาแบบดรอปดาวน์ใน **แถบด้านข้างบนมือถือ**
- ส่วน **Settings > System** กำหนดค่าเริ่มต้นทั้งอินสแตนซ์ (เฉพาะผู้ดูแลระบบ)

## คำแปลทำงานอย่างไร {#how-translations-work}

สตริง UI ทั้งหมดอยู่ใน `packages/shared/src/i18n/` ไฟล์อ้างอิงคือ `en.ts` ซึ่งเอ็กซ์พอร์ตออบเจ็กต์ที่มีการกำหนดชนิดพร้อมทุกสตริงที่แอปใช้ (~1500 คีย์) ภาษาอื่นเป็นไฟล์แยกต่างหาก (เช่น `de.ts`, `fr.ts`) ที่เอ็กซ์พอร์ตในรูปแบบเดียวกัน

ชนิด `TranslationKeys` ใช้ `DeepStringRecord` เพื่อรับค่าสตริงใดก็ได้ในขณะที่บังคับใช้โครงสร้างคีย์ TypeScript จะตรวจจับคีย์ที่หายไปในไฟล์คำแปลใด ๆ ตอนคอมไพล์

จะโหลดเฉพาะภาษาที่ใช้งานอยู่ ณ รันไทม์ผ่านการ `import()` แบบไดนามิก ทำให้บันเดิลหลักมีขนาดเล็ก

## การใช้คำแปลในคอมโพเนนต์ {#using-translations-in-components}

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

## การมีส่วนร่วมในการแปล {#contributing-a-translation}

เรายินดีรับ PR การแปลโดยตรง คุณสามารถปรับปรุงภาษาที่มีอยู่หรือเพิ่มภาษาใหม่ได้

หากต้องการรายงานคำแปลที่ผิดโดยไม่ส่งโค้ด ให้เปิด [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) พร้อมระบุภาษา สตริงที่ผิด และคำแนะนำในการแก้ไข

::: tip 
PR การแปลไม่จำเป็นต้องได้รับการอนุมัติล่วงหน้า ให้ fork รีโพ ทำการเปลี่ยนแปลง แล้วเปิด PR ดู [Contributing Guide](/th/guide/contributing) สำหรับกระบวนการ PR แบบเต็มและข้อกำหนด CLA
:::

## วิธีสร้างหรืออัปเดตคำแปล {#how-to-create-or-update-a-translation}

### 1. Fork และ clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. คัดลอกไฟล์อ้างอิง (เฉพาะภาษาใหม่) {#_2-copy-the-reference-file-new-language-only}

ข้ามขั้นตอนนี้หากคุณกำลังปรับปรุงคำแปลที่มีอยู่แล้ว

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. แปลสตริง {#_3-translate-the-strings}

เปิดไฟล์ใหม่ของคุณแล้วแปลค่าสตริงทุกตัว รักษาโครงสร้างออบเจ็กต์และคีย์ให้เหมือนเดิมทุกประการ

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

กฎ:
- อย่าแปลคีย์ของออบเจ็กต์ แปลเฉพาะค่าสตริงเท่านั้น
- คง `as const` ไว้ที่ท้าย
- import `TranslationKeys` จาก `./en.js` และกำหนดชนิดให้กับ export ของคุณ
- คงตัวยึด `{variable}` ไว้ตามเดิมทุกประการ
- อาร์เรย์ (`rotatingPhrases`, `progressMessages`) ต้องมีจำนวนรายการเท่ากัน
- อย่าแปล: SnapOtter, JPEG, PNG, WebP, EXIF, API และคำศัพท์ทางเทคนิคอื่น ๆ

### 4. ลงทะเบียนภาษา (เฉพาะภาษาใหม่) {#_4-register-the-locale-new-language-only}

เพิ่มภาษาของคุณลงใน `SUPPORTED_LOCALES` ใน `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. ตรวจสอบ {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. ส่ง {#_6-submit}

เปิด PR ไปยัง `main` ด้วยชื่อเรื่องแบบ `feat(i18n): add Swedish translation` หรือ `fix(i18n): correct German typos` บอต CLA จะขอให้คุณลงนามในการมีส่วนร่วมครั้งแรกของคุณ

## การเพิ่มคีย์คำแปลใหม่ {#adding-new-translation-keys}

เมื่อเพิ่มฟีเจอร์ใหม่ที่ต้องการสตริง UI ใหม่:

1. เพิ่มคีย์ใหม่ลงใน `en.ts` ก่อน (ไฟล์อ้างอิง)
2. รัน `pnpm typecheck` - ไฟล์ภาษาทุกไฟล์จะล้มเหลวหากขาดคีย์ใหม่
3. เพิ่มคีย์ใหม่ลงในไฟล์ภาษาทั้งหมด (ใช้ภาษาอังกฤษเป็นตัวถอยกลับชั่วคราว)

## การกำหนดค่า {#configuration}

กำหนดภาษาเริ่มต้นของอินสแตนซ์ผ่านตัวแปรสภาพแวดล้อม:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## การอ้างอิงไฟล์ {#file-reference}

| ไฟล์ | วัตถุประสงค์ |
|------|---------|
| `packages/shared/src/i18n/en.ts` | สตริงภาษาอังกฤษ (ภาษาอ้างอิง ~1500 คีย์) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, การเอ็กซ์พอร์ตชนิด |
| `packages/shared/src/i18n/<locale>.ts` | ไฟล์คำแปลแยกตามภาษา |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, ฮุก `useTranslation()` |
| `apps/web/src/lib/format.ts` | ตัวช่วย `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | เอ็นด์พอยต์สาธารณะ `GET /api/v1/config/locale` |

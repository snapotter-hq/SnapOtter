---
description: "21 ภาษาที่รองรับ และวิธีสร้างหรือปรับปรุงคำแปลสำหรับ SnapOtter โดยใช้ระบบ i18n ที่บังคับด้วย TypeScript"
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 2c7c9a24cb4d
---

# คู่มือการแปล {#translation-guide}

SnapOtter มาพร้อมกับ 21 ภาษาตั้งแต่ต้น ระบบ i18n ใช้รันไทม์แบบกำหนดเองที่มีขนาดเบา พร้อมการบังคับความสมบูรณ์ของ locale ด้วย TypeScript และการแยกโค้ดแบบไดนามิก

## ภาษาที่รองรับ {#supported-languages}

| Code | Language | Native Name | Direction |
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

## การตรวจจับภาษาทำงานอย่างไร {#how-language-detection-works}

SnapOtter ใช้ลำดับการแก้ไขแบบสามชั้น:

1. **การตั้งค่าของผู้ใช้** - จัดเก็บใน `localStorage("snapotter-locale")` และซิงค์ไปยังการตั้งค่าผู้ใช้เมื่อเข้าสู่ระบบแล้ว
2. **การตรวจจับอัตโนมัติของเบราว์เซอร์** - ไล่ไปตามอาร์เรย์ `navigator.languages` ด้วยการจับคู่คำนำหน้าแบบ BCP 47
3. **ค่าเริ่มต้นของอินสแตนซ์** - ตัวแปรสภาพแวดล้อม `DEFAULT_LOCALE` ของผู้ดูแลระบบ (ดึงมาจาก `GET /api/v1/config/locale`)
4. **การถอยกลับเป็นภาษาอังกฤษ** - พร้อมใช้งานเสมอ

ผู้ใช้สามารถเปลี่ยนภาษาได้จาก:
- **ตัวเลือกลูกโลกที่ส่วนท้าย** (เดสก์ท็อป มองเห็นได้เสมอ)
- ตัวเลือกภาษาที่ **หน้าเข้าสู่ระบบ** (ก่อนการยืนยันตัวตน)
- ส่วน **Settings > General** (การตั้งค่าเฉพาะผู้ใช้)
- เมนูดรอปดาวน์ภาษาใน **แถบข้างบนมือถือ**
- ส่วน **Settings > System** ตั้งค่าเริ่มต้นทั่วทั้งอินสแตนซ์ (เฉพาะผู้ดูแลระบบ)

## การแปลทำงานอย่างไร {#how-translations-work}

สตริง UI ทั้งหมดอยู่ใน `packages/shared/src/i18n/` ไฟล์อ้างอิงคือ `en.ts` ซึ่งส่งออกอ็อบเจกต์ที่มีการกำหนดชนิดข้อมูล พร้อมทุกสตริงที่แอปใช้ (~1500 คีย์) ภาษาอื่นๆ เป็นไฟล์แยกต่างหาก (เช่น `de.ts`, `fr.ts`) ที่ส่งออกในรูปแบบเดียวกัน

ชนิด `TranslationKeys` ใช้ `DeepStringRecord` เพื่อยอมรับค่าสตริงใดๆ ในขณะที่บังคับโครงสร้างคีย์ TypeScript จะตรวจจับคีย์ที่ขาดหายไปในไฟล์แปลใดๆ ณ เวลาคอมไพล์

จะโหลดเฉพาะ locale ที่ใช้งานอยู่เท่านั้น ณ รันไทม์ผ่าน `import()` แบบไดนามิก เพื่อให้บันเดิลหลักมีขนาดเล็ก

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

เรายินดีรับ PR การแปลโดยตรง คุณสามารถปรับปรุง locale ที่มีอยู่หรือเพิ่ม locale ใหม่ได้

หากต้องการรายงานคำแปลที่ผิดโดยไม่ส่งโค้ด ให้เปิด [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) พร้อมระบุภาษา สตริงที่ไม่ถูกต้อง และการแก้ไขที่แนะนำ

::: tip 
PR การแปลไม่จำเป็นต้องได้รับการอนุมัติล่วงหน้า ให้ fork repo ทำการเปลี่ยนแปลงของคุณ แล้วเปิด PR ดู [Contributing Guide](/th/guide/contributing) สำหรับกระบวนการ PR ทั้งหมดและข้อกำหนด CLA
:::

## วิธีสร้างหรืออัปเดตคำแปล {#how-to-create-or-update-a-translation}

### 1. Fork และ clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. คัดลอกไฟล์อ้างอิง (สำหรับภาษาใหม่เท่านั้น) {#_2-copy-the-reference-file-new-language-only}

ข้ามขั้นตอนนี้หากคุณกำลังปรับปรุงคำแปลที่มีอยู่

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. แปลสตริง {#_3-translate-the-strings}

เปิดไฟล์ใหม่ของคุณและแปลค่าสตริงทุกค่า คงโครงสร้างอ็อบเจกต์และคีย์ให้เหมือนกันทุกประการ

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
- อย่าแปลคีย์ของอ็อบเจกต์ แปลเฉพาะค่าสตริงเท่านั้น
- คง `as const` ไว้ที่ท้าย
- นำเข้า `TranslationKeys` จาก `./en.js` และกำหนดชนิดข้อมูลให้กับ export ของคุณ
- คงตัวแทน `{variable}` ไว้ตามเดิมทุกประการ
- อาร์เรย์ (`rotatingPhrases`, `progressMessages`) ต้องมีจำนวนรายการเท่ากัน
- อย่าแปล: SnapOtter, JPEG, PNG, WebP, EXIF, API และคำศัพท์ทางเทคนิคอื่นๆ

### 4. ลงทะเบียน locale (สำหรับภาษาใหม่เท่านั้น) {#_4-register-the-locale-new-language-only}

เพิ่ม locale ของคุณลงใน `SUPPORTED_LOCALES` ใน `packages/shared/src/i18n/index.ts`:

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

เปิด PR ต่อ `main` ด้วยชื่อเรื่องอย่างเช่น `feat(i18n): add Swedish translation` หรือ `fix(i18n): correct German typos` บอต CLA จะขอให้คุณลงนามในการมีส่วนร่วมครั้งแรกของคุณ

## การเพิ่มคีย์คำแปลใหม่ {#adding-new-translation-keys}

เมื่อเพิ่มฟีเจอร์ใหม่ที่ต้องการสตริง UI ใหม่:

1. เพิ่มคีย์ใหม่ลงใน `en.ts` ก่อน (ไฟล์อ้างอิง)
2. รัน `pnpm typecheck` - ไฟล์ locale ทุกไฟล์จะล้มเหลวหากขาดคีย์ใหม่
3. เพิ่มคีย์ใหม่ลงในไฟล์ locale ทั้งหมด (ใช้ภาษาอังกฤษเป็นค่าถอยกลับชั่วคราว)

## การกำหนดค่า {#configuration}

ตั้งค่าภาษาเริ่มต้นของอินสแตนซ์ผ่านตัวแปรสภาพแวดล้อม:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## การอ้างอิงไฟล์ {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | สตริงภาษาอังกฤษ (locale อ้างอิง, ~1500 คีย์) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, การส่งออกชนิดข้อมูล |
| `packages/shared/src/i18n/<locale>.ts` | ไฟล์แปลแยกตามภาษา |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, ฮุก `useTranslation()` |
| `apps/web/src/lib/format.ts` | ตัวช่วย `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | จุดปลายทางสาธารณะ `GET /api/v1/config/locale` |

## การแปลเว็บไซต์ เอกสาร และการอ้างอิง API {#translating-the-web-surfaces}

การรองรับ 21 ภาษาข้างต้นครอบคลุม **แอป** เว็บไซต์สาธารณะ
(snapotter.com) เว็บไซต์เอกสารนี้ และการอ้างอิง REST API ก็ได้รับการ
แปลเป็นทั้ง 21 ภาษาเช่นกัน โดยไปป์ไลน์ที่กำกับด้วยแฮชแยกต่างหากซึ่งนำ
ชื่อและคำอธิบายเครื่องมือชุดเดียวกันจาก `packages/shared/src/i18n` มาใช้ซ้ำ ดังนั้น
คำศัพท์จึงสอดคล้องกันทุกที่

### แปลด้วยเครื่องเป็นค่าเริ่มต้น {#machine-translated-by-default}

ทุกหน้าที่ไม่ใช่ภาษาอังกฤษบนเว็บไซต์และเอกสารจะได้รับการ **แปลด้วยเครื่อง** ใน
รอบแรก (โดยเซสชัน Claude Code ไม่ใช่บริการภายนอก) และมี
แบนเนอร์เล็กๆ ที่ปิดได้แจ้งเรื่องนี้ พร้อมลิงก์กลับมาที่นี่ นั่นเป็นความตั้งใจ:
มันจัดส่งทั้ง 21 ภาษาอย่างรวดเร็วและตรงไปตรงมา จากนั้นเชิญชวนชุมชนให้
ปรับปรุงหน้าที่สำคัญที่สุด การแปลด้วยเครื่องสื่อความหมายได้ครบถ้วน
การตรวจทานโดยมนุษย์ทำให้อ่านได้เป็นธรรมชาติ

### ไปป์ไลน์ตัดสินใจว่าจะแปลอะไรอย่างไร {#how-the-web-pipeline-decides}

แต่ละหน่วยของต้นฉบับภาษาอังกฤษที่แปลได้จะถูกแฮช และแฮชจะถูกจัดเก็บ
ไว้ข้างคำแปลของมัน ในการรันแต่ละครั้ง ไปป์ไลน์จะ:

- แปลหน่วยใดๆ ที่ยังไม่มีคำแปล
- ข้ามหน่วยใดๆ ที่แฮชที่จัดเก็บไว้ยังตรงกับต้นฉบับภาษาอังกฤษ
- แปลใหม่สำหรับหน่วยที่เป็น **machine** เมื่อต้นฉบับภาษาอังกฤษเปลี่ยนแปลง
- และตั้งค่าสถานะหน่วยที่ผ่านการปรับปรุงโดย **human** เป็น `stale` (ต้องตรวจทาน) เมื่อต้นฉบับ
  ภาษาอังกฤษเปลี่ยนแปลง แทนที่จะเขียนทับงานของคุณ

### การปรับปรุงคำแปลเว็บด้วย PR {#refining-a-web-translation-by-pr}

คุณปรับปรุงคำแปลของเว็บไซต์ เอกสาร หรือการอ้างอิง API ด้วยวิธีเดียวกับที่คุณ
ปรับปรุง locale ของแอป: โดยแก้ไขไฟล์ที่ถูกสร้างขึ้นและเปิด PR

1. ค้นหาคำแปลที่ถูกสร้างขึ้นสำหรับภาษาของคุณ:
   - สตริง UI ของเว็บไซต์: `apps/landing/src/i18n/<locale>.json`
   - หน้าเอกสาร: `apps/docs/<locale>/**.md`
   - การอ้างอิง API: `apps/api/src/openapi.<locale>.yaml`
2. แก้ไขข้อความ คงโค้ด ลิงก์ `{placeholders}` และเครื่องหมาย `⸤I18N…⸥` ใดๆ
   ไว้ตามเดิมทุกประการ ตัวตรวจสอบของไปป์ไลน์จะปฏิเสธคำแปลที่ทำ
   เครื่องหมายเหล่านั้นหายไปหรือสลับลำดับ
3. เปิด PR การแก้ไขหน่วยจะพลิกที่มาของมันจาก `machine` เป็น `human` ดังนั้น
   ไปป์ไลน์จะ **ไม่มีวันเขียนทับมัน** ในการรันครั้งต่อไป หากต้นฉบับภาษาอังกฤษ
   เปลี่ยนแปลงในภายหลัง หน่วยของคุณจะถูกตั้งค่าสถานะเป็น `stale` เพื่อตรวจทานแทนที่จะถูก
   แทนที่อย่างเงียบๆ

หากต้องการรายงานคำแปลที่ผิดโดยไม่ส่งโค้ด ให้เปิด
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) พร้อมระบุ
URL ของหน้า ภาษา ข้อความที่ไม่ถูกต้อง และการแก้ไขที่คุณแนะนำ

::: tip 
ผู้ดูแลจะรันไปป์ไลน์การแปล คุณไม่จำเป็นต้องมี API key เพื่อ
มีส่วนร่วม เพียงแก้ไขไฟล์ที่ถูกสร้างขึ้นและเปิด PR ดู
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
สำหรับวิธีการทำงานของไปป์ไลน์
:::
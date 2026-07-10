---
description: "21 підтримувана мова та як створити чи покращити переклади для SnapOtter за допомогою системи i18n із контролем через TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: f2b78c50853d
---

# Посібник із перекладу {#translation-guide}

SnapOtter постачається з 21 мовою одразу з коробки. Система i18n використовує легкий власний рантайм із контролем повноти локалей на рівні TypeScript та динамічним розбиттям коду.

## Підтримувані мови {#supported-languages}

| Код | Мова | Рідна назва | Напрямок |
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

## Як працює визначення мови {#how-language-detection-works}

SnapOtter використовує трирівневий порядок визначення:

1. **Налаштування користувача** - зберігається в `localStorage("snapotter-locale")` та синхронізується з налаштуваннями користувача після автентифікації
2. **Автовизначення браузера** - проходить масив `navigator.languages` із зіставленням префіксів за BCP 47
3. **Типове значення екземпляра** - змінна середовища `DEFAULT_LOCALE` адміністратора (отримується з `GET /api/v1/config/locale`)
4. **Резервний варіант англійською** - завжди доступний

Користувачі можуть змінити мову з:
- **Селектора Globe у футері** (десктоп, завжди видимий)
- Селектора мови на **сторінці входу** (до автентифікації)
- Розділу **Settings > General** (налаштування для кожного користувача)
- Випадаючого списку мов у **мобільній бічній панелі**
- Розділ **Settings > System** задає типове значення для всього екземпляра (лише адміністратор)

## Як працюють переклади {#how-translations-work}

Усі рядки інтерфейсу зберігаються в `packages/shared/src/i18n/`. Еталонний файл - це `en.ts`, який експортує типізований об'єкт із кожним рядком, який використовує застосунок (~1500 ключів). Інші мови - це окремі файли (наприклад, `de.ts`, `fr.ts`), які експортують ту саму структуру.

Тип `TranslationKeys` використовує `DeepStringRecord`, щоб приймати будь-яке рядкове значення, водночас забезпечуючи структуру ключів. TypeScript виявляє відсутні ключі в будь-якому файлі перекладу під час компіляції.

Під час виконання завантажується лише активна локаль через динамічний `import()`, що зберігає основний бандл невеликим.

## Використання перекладів у компонентах {#using-translations-in-components}

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

## Внесення перекладу {#contributing-a-translation}

Ми вітаємо PR із перекладами напряму. Ви можете покращити наявну локаль або додати нову.

Щоб повідомити про помилку перекладу без надсилання коду, відкрийте [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) із зазначенням мови, некоректного рядка та запропонованого виправлення.

::: tip 
PR із перекладами не потребують попереднього схвалення. Створіть форк репозиторію, внесіть зміни та відкрийте PR. Повний процес PR та вимогу щодо CLA дивіться в [Посібнику для контриб'юторів](/uk/guide/contributing).
:::

## Як створити або оновити переклад {#how-to-create-or-update-a-translation}

### 1. Форк і клонування {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Скопіюйте еталонний файл (лише для нової мови) {#_2-copy-the-reference-file-new-language-only}

Пропустіть цей крок, якщо ви покращуєте наявний переклад.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Перекладіть рядки {#_3-translate-the-strings}

Відкрийте свій новий файл і перекладіть кожне значення рядка. Зберігайте структуру об'єкта та ключі точно такими самими.

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

Правила:
- Не перекладайте ключі об'єкта, лише значення рядків
- Зберігайте `as const` в кінці
- Імпортуйте `TranslationKeys` з `./en.js` і типізуйте свій експорт
- Зберігайте плейсхолдери `{variable}` точно як є
- Масиви (`rotatingPhrases`, `progressMessages`) повинні мати ту саму кількість записів
- Не перекладайте: SnapOtter, JPEG, PNG, WebP, EXIF, API та інші технічні терміни

### 4. Зареєструйте локаль (лише для нової мови) {#_4-register-the-locale-new-language-only}

Додайте свою локаль до `SUPPORTED_LOCALES` у `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Перевірте {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Надішліть {#_6-submit}

Відкрийте PR проти `main` із заголовком на кшталт `feat(i18n): add Swedish translation` або `fix(i18n): correct German typos`. Бот CLA попросить вас підписати угоду під час першого внеску.

## Додавання нових ключів перекладу {#adding-new-translation-keys}

Коли ви додаєте нову функцію, якій потрібні нові рядки інтерфейсу:

1. Спочатку додайте нові ключі до `en.ts` (еталонний файл)
2. Запустіть `pnpm typecheck` - кожен файл локалі впаде, якщо в ньому бракує нового ключа
3. Додайте новий ключ до всіх файлів локалей (використовуйте англійську як тимчасовий резервний варіант)

## Конфігурація {#configuration}

Задайте типову мову екземпляра через змінну середовища:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Довідник файлів {#file-reference}

| Файл | Призначення |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Англійські рядки (еталонна локаль, ~1500 ключів) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, експорти типів |
| `packages/shared/src/i18n/<locale>.ts` | Файли перекладу для кожної мови |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, хук `useTranslation()` |
| `apps/web/src/lib/format.ts` | Помічники `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Публічна кінцева точка `GET /api/v1/config/locale` |

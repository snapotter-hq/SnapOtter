---
description: "21 поддерживаемый язык и способы создания или улучшения переводов для SnapOtter с помощью системы i18n, контролируемой средствами TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 38cb6092d61b
---

# Руководство по переводу {#translation-guide}

SnapOtter поставляется с 21 языком из коробки. Система i18n использует лёгкий собственный рантайм с проверкой полноты локалей средствами TypeScript и динамическим разделением кода.

## Поддерживаемые языки {#supported-languages}

| Код | Язык | Название на языке оригинала | Направление |
|------|----------|-------------|-----------|
| `en` | Английский | English | LTR |
| `zh-CN` | Китайский (упрощённый) | 简体中文 | LTR |
| `zh-TW` | Китайский (традиционный) | 繁體中文 | LTR |
| `ja` | Японский | 日本語 | LTR |
| `ko` | Корейский | 한국어 | LTR |
| `es` | Испанский | Español | LTR |
| `fr` | Французский | Français | LTR |
| `it` | Итальянский | Italiano | LTR |
| `pt-BR` | Португальский (Бразилия) | Português (Brasil) | LTR |
| `de` | Немецкий | Deutsch | LTR |
| `nl` | Нидерландский | Nederlands | LTR |
| `sv` | Шведский | Svenska | LTR |
| `ru` | Русский | Русский | LTR |
| `pl` | Польский | Polski | LTR |
| `uk` | Украинский | Українська | LTR |
| `ar` | Арабский | العربية | RTL |
| `tr` | Турецкий | Türkçe | LTR |
| `hi` | Хинди | हिन्दी | LTR |
| `vi` | Вьетнамский | Tiếng Việt | LTR |
| `id` | Индонезийский | Bahasa Indonesia | LTR |
| `th` | Тайский | ไทย | LTR |

## Как работает определение языка {#how-language-detection-works}

SnapOtter использует трёхуровневый порядок разрешения:

1. **Предпочтение пользователя** — хранится в `localStorage("snapotter-locale")` и синхронизируется с настройками пользователя при аутентификации
2. **Автоопределение браузера** — обходит массив `navigator.languages` с сопоставлением префиксов по BCP 47
3. **Значение по умолчанию для экземпляра** — переменная окружения `DEFAULT_LOCALE` администратора (запрашивается из `GET /api/v1/config/locale`)
4. **Резервный английский** — доступен всегда

Пользователи могут менять язык через:
- **Селектор с глобусом в футере** (десктоп, всегда виден)
- Селектор языка на **странице входа** (до аутентификации)
- Раздел **Настройки > Общие** (предпочтение конкретного пользователя)
- Выпадающий список языков в **мобильной боковой панели**
- Раздел **Настройки > Система** задаёт значение по умолчанию для всего экземпляра (только для администратора)

## Как работают переводы {#how-translations-work}

Все строки интерфейса находятся в `packages/shared/src/i18n/`. Эталонный файл — `en.ts`, который экспортирует типизированный объект со всеми строками, используемыми приложением (~1500 ключей). Другие языки — это отдельные файлы (например, `de.ts`, `fr.ts`), экспортирующие ту же структуру.

Тип `TranslationKeys` использует `DeepStringRecord`, чтобы принимать любое строковое значение, обеспечивая при этом структуру ключей. TypeScript обнаруживает отсутствующие ключи в любом файле перевода на этапе компиляции.

В рантайме через динамический `import()` загружается только активная локаль, что позволяет держать основной бандл небольшим.

## Использование переводов в компонентах {#using-translations-in-components}

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

## Как внести перевод {#contributing-a-translation}

Мы приветствуем PR с переводами напрямую. Вы можете улучшить существующую локаль или добавить новую.

Чтобы сообщить о неточном переводе без отправки кода, откройте [задачу на GitHub](https://github.com/snapotter-hq/SnapOtter/issues), указав язык, неверную строку и предлагаемое исправление.

::: tip 
PR с переводами не требуют предварительного одобрения. Сделайте форк репозитория, внесите изменения и откройте PR. Полный процесс работы с PR и требование CLA см. в [Руководстве для контрибьюторов](/ru/guide/contributing).
:::

## Как создать или обновить перевод {#how-to-create-or-update-a-translation}

### 1. Форк и клонирование {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Скопируйте эталонный файл (только для нового языка) {#_2-copy-the-reference-file-new-language-only}

Пропустите этот шаг, если вы улучшаете существующий перевод.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Переведите строки {#_3-translate-the-strings}

Откройте новый файл и переведите значение каждой строки. Сохраняйте структуру объекта и ключи в точности такими же.

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
- Не переводите ключи объекта, только строковые значения
- Оставляйте `as const` в конце
- Импортируйте `TranslationKeys` из `./en.js` и типизируйте экспорт
- Сохраняйте плейсхолдеры `{variable}` в точности как есть
- Массивы (`rotatingPhrases`, `progressMessages`) должны иметь одинаковое число элементов
- Не переводите: SnapOtter, JPEG, PNG, WebP, EXIF, API и другие технические термины

### 4. Зарегистрируйте локаль (только для нового языка) {#_4-register-the-locale-new-language-only}

Добавьте свою локаль в `SUPPORTED_LOCALES` в `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Проверка {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Отправка {#_6-submit}

Откройте PR против `main` с заголовком вроде `feat(i18n): add Swedish translation` или `fix(i18n): correct German typos`. При первом вкладе бот CLA попросит вас подписать соглашение.

## Добавление новых ключей перевода {#adding-new-translation-keys}

При добавлении новой функции, которой нужны новые строки интерфейса:

1. Сначала добавьте новые ключи в `en.ts` (эталонный файл)
2. Запустите `pnpm typecheck` — каждый файл локали упадёт с ошибкой, если в нём отсутствует новый ключ
3. Добавьте новый ключ во все файлы локалей (используйте английский как временный запасной вариант)

## Конфигурация {#configuration}

Задайте язык экземпляра по умолчанию через переменную окружения:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Справочник по файлам {#file-reference}

| Файл | Назначение |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Английские строки (эталонная локаль, ~1500 ключей) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, экспорт типов |
| `packages/shared/src/i18n/<locale>.ts` | Файлы переводов по языкам |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, хук `useTranslation()` |
| `apps/web/src/lib/format.ts` | Вспомогательные функции `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Публичная конечная точка `GET /api/v1/config/locale` |

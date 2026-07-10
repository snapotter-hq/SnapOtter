---
description: "SnapOtter의 TypeScript로 강제되는 i18n 시스템을 사용해 번역을 생성하거나 개선하는 방법과 지원되는 21개 언어입니다."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 41ee929a10d6
---

# 번역 가이드 {#translation-guide}

SnapOtter는 기본적으로 21개 언어를 제공합니다. i18n 시스템은 TypeScript로 로케일 완결성을 강제하고 동적 코드 분할을 지원하는 가벼운 커스텀 런타임을 사용합니다.

## 지원 언어 {#supported-languages}

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

## 언어 감지 동작 방식 {#how-language-detection-works}

SnapOtter는 3단계 해석 순서를 사용합니다:

1. **사용자 기본 설정** - `localStorage("snapotter-locale")`에 저장되며 인증된 경우 사용자 설정에 동기화됩니다
2. **브라우저 자동 감지** - BCP 47 접두사 매칭으로 `navigator.languages` 배열을 순회합니다
3. **인스턴스 기본값** - 관리자의 `DEFAULT_LOCALE` 환경 변수(`GET /api/v1/config/locale`에서 가져옴)
4. **영어 폴백** - 항상 사용 가능

사용자는 다음에서 언어를 변경할 수 있습니다:
- **푸터의 지구본 선택기**(데스크톱, 항상 표시)
- **로그인 페이지** 언어 선택기(인증 전)
- **Settings > General** 섹션(사용자별 기본 설정)
- **모바일 사이드바** 언어 드롭다운
- **Settings > System** 섹션에서 인스턴스 전체 기본값 설정(관리자 전용)

## 번역 동작 방식 {#how-translations-work}

모든 UI 문자열은 `packages/shared/src/i18n/`에 있습니다. 참조 파일은 `en.ts`이며, 앱이 사용하는 모든 문자열(약 1500개 키)을 담은 타입 지정 객체를 내보냅니다. 다른 언어는 동일한 형태를 내보내는 별도 파일입니다(예: `de.ts`, `fr.ts`).

`TranslationKeys` 타입은 `DeepStringRecord`을 사용해 임의의 문자열 값을 허용하면서 키 구조를 강제합니다. TypeScript는 컴파일 시점에 어떤 번역 파일에서든 누락된 키를 잡아냅니다.

런타임에는 동적 `import()`을 통해 활성 로케일만 로드되어 메인 번들을 작게 유지합니다.

## 컴포넌트에서 번역 사용하기 {#using-translations-in-components}

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

## 번역 기여하기 {#contributing-a-translation}

번역 PR을 직접 환영합니다. 기존 로케일을 개선하거나 새 로케일을 추가할 수 있습니다.

코드를 제출하지 않고 오역을 신고하려면, 언어, 잘못된 문자열, 제안하는 수정 내용을 담아 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)를 열어 주세요.

::: tip 
번역 PR은 사전 승인이 필요하지 않습니다. 저장소를 포크하고, 변경을 적용한 뒤 PR을 여세요. 전체 PR 절차와 CLA 요건은 [기여 가이드](/ko/guide/contributing)를 참고하세요.
:::

## 번역을 생성하거나 업데이트하는 방법 {#how-to-create-or-update-a-translation}

### 1. 포크 및 클론 {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 참조 파일 복사(새 언어에 한함) {#_2-copy-the-reference-file-new-language-only}

기존 번역을 개선하는 경우 이 단계를 건너뛰세요.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 문자열 번역 {#_3-translate-the-strings}

새 파일을 열고 모든 문자열 값을 번역하세요. 객체 구조와 키는 정확히 동일하게 유지하세요.

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

규칙:
- 객체 키는 번역하지 말고, 문자열 값만 번역하세요
- `as const`는 끝에 그대로 두세요
- `./en.js`에서 `TranslationKeys`을 임포트하고 내보내기에 타입을 지정하세요
- `{variable}` 플레이스홀더는 있는 그대로 유지하세요
- 배열(`rotatingPhrases`, `progressMessages`)은 항목 수가 동일해야 합니다
- SnapOtter, JPEG, PNG, WebP, EXIF, API 및 기타 기술 용어는 번역하지 마세요

### 4. 로케일 등록(새 언어에 한함) {#_4-register-the-locale-new-language-only}

`packages/shared/src/i18n/index.ts`의 `SUPPORTED_LOCALES`에 로케일을 추가하세요:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 검증 {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 제출 {#_6-submit}

`feat(i18n): add Swedish translation` 또는 `fix(i18n): correct German typos`와 같은 제목으로 `main`에 PR을 여세요. 첫 기여 시 CLA 봇이 서명을 요청합니다.

## 새 번역 키 추가하기 {#adding-new-translation-keys}

새 UI 문자열이 필요한 기능을 추가할 때:

1. 먼저 `en.ts`(참조 파일)에 새 키를 추가하세요
2. `pnpm typecheck`을 실행하세요 - 새 키가 누락된 모든 로케일 파일이 실패합니다
3. 모든 로케일 파일에 새 키를 추가하세요(임시 폴백으로 영어를 사용)

## 구성 {#configuration}

환경 변수로 인스턴스 기본 언어를 설정하세요:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 파일 참조 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 영어 문자열(참조 로케일, 약 1500개 키) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, 타입 내보내기 |
| `packages/shared/src/i18n/<locale>.ts` | 언어별 번역 파일 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` 훅 |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` 헬퍼 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 공개 엔드포인트 |

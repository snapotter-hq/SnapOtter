---
description: "SnapOtter의 TypeScript로 강제되는 i18n 시스템을 사용해 지원되는 21개 언어와 번역을 만들거나 개선하는 방법."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 330b656dc65f
---

# 번역 가이드 {#translation-guide}

SnapOtter는 기본적으로 21개 언어를 제공합니다. i18n 시스템은 TypeScript로 로케일 완전성을 강제하고 동적 코드 분할을 지원하는 가볍고 자체 제작한 런타임을 사용합니다.

## 지원 언어 {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | 영어 | English | LTR |
| `zh-CN` | 중국어(간체) | 简体中文 | LTR |
| `zh-TW` | 중국어(번체) | 繁體中文 | LTR |
| `ja` | 일본어 | 日本語 | LTR |
| `ko` | 한국어 | 한국어 | LTR |
| `es` | 스페인어 | Español | LTR |
| `fr` | 프랑스어 | Français | LTR |
| `it` | 이탈리아어 | Italiano | LTR |
| `pt-BR` | 포르투갈어(브라질) | Português (Brasil) | LTR |
| `de` | 독일어 | Deutsch | LTR |
| `nl` | 네덜란드어 | Nederlands | LTR |
| `sv` | 스웨덴어 | Svenska | LTR |
| `ru` | 러시아어 | Русский | LTR |
| `pl` | 폴란드어 | Polski | LTR |
| `uk` | 우크라이나어 | Українська | LTR |
| `ar` | 아랍어 | العربية | RTL |
| `tr` | 터키어 | Türkçe | LTR |
| `hi` | 힌디어 | हिन्दी | LTR |
| `vi` | 베트남어 | Tiếng Việt | LTR |
| `id` | 인도네시아어 | Bahasa Indonesia | LTR |
| `th` | 태국어 | ไทย | LTR |

## 언어 감지가 작동하는 방식 {#how-language-detection-works}

SnapOtter는 3단계 해석 순서를 사용합니다:

1. **사용자 환경설정** - `localStorage("snapotter-locale")`에 저장되며, 인증된 경우 사용자 설정과 동기화됩니다
2. **브라우저 자동 감지** - BCP 47 접두사 매칭으로 `navigator.languages` 배열을 순회합니다
3. **인스턴스 기본값** - 관리자의 `DEFAULT_LOCALE` 환경 변수(`GET /api/v1/config/locale`에서 가져옴)
4. **영어 폴백** - 항상 사용 가능

사용자는 다음에서 언어를 변경할 수 있습니다:
- **푸터 지구본 선택기**(데스크톱, 항상 표시)
- **로그인 페이지** 언어 선택기(인증 전)
- **설정 > 일반** 섹션(사용자별 환경설정)
- **모바일 사이드바** 언어 드롭다운
- **설정 > 시스템** 섹션에서 인스턴스 전체 기본값 설정(관리자 전용)

## 번역이 작동하는 방식 {#how-translations-work}

모든 UI 문자열은 `packages/shared/src/i18n/`에 있습니다. 참조 파일은 `en.ts`이며, 앱이 사용하는 모든 문자열(~1500개 키)을 담은 타입이 지정된 객체를 내보냅니다. 다른 언어는 동일한 형태를 내보내는 별도 파일(예: `de.ts`, `fr.ts`)입니다.

`TranslationKeys` 타입은 `DeepStringRecord`을 사용해 키 구조를 강제하면서 임의의 문자열 값을 허용합니다. TypeScript는 어떤 번역 파일에서든 누락된 키를 컴파일 타임에 잡아냅니다.

런타임에는 활성 로케일만 동적 `import()`을 통해 로드되어 메인 번들을 작게 유지합니다.

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

코드를 제출하지 않고 오역을 신고하려면, 언어와 잘못된 문자열, 제안하는 수정안을 담아 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)를 열어 주세요.

::: tip 
번역 PR은 사전 승인이 필요하지 않습니다. 저장소를 포크하고 변경한 뒤 PR을 여세요. 전체 PR 절차와 CLA 요구 사항은 [기여 가이드](/ko/guide/contributing)를 참고하세요.
:::

## 번역을 만들거나 업데이트하는 방법 {#how-to-create-or-update-a-translation}

### 1. 포크 및 클론 {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 참조 파일 복사(새 언어만) {#_2-copy-the-reference-file-new-language-only}

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
- 객체 키는 번역하지 말고 문자열 값만 번역하세요
- `as const`를 끝에 유지하세요
- `./en.js`에서 `TranslationKeys`을 임포트하고 내보내기에 타입을 지정하세요
- `{variable}` 플레이스홀더는 정확히 그대로 유지하세요
- 배열(`rotatingPhrases`, `progressMessages`)은 항목 수가 동일해야 합니다
- SnapOtter, JPEG, PNG, WebP, EXIF, API 및 기타 기술 용어는 번역하지 마세요

### 4. 로케일 등록(새 언어만) {#_4-register-the-locale-new-language-only}

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

`feat(i18n): add Swedish translation` 또는 `fix(i18n): correct German typos` 같은 제목으로 `main`에 PR을 여세요. 첫 기여 시 CLA 봇이 서명을 요청합니다.

## 새 번역 키 추가하기 {#adding-new-translation-keys}

새 UI 문자열이 필요한 새 기능을 추가할 때:

1. 먼저 `en.ts`(참조 파일)에 새 키를 추가하세요
2. `pnpm typecheck`을 실행하세요 - 새 키가 누락된 모든 로케일 파일이 실패합니다
3. 모든 로케일 파일에 새 키를 추가하세요(영어를 임시 폴백으로 사용)

## 구성 {#configuration}

환경 변수로 인스턴스 기본 언어를 설정하세요:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 파일 참조 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 영어 문자열(참조 로케일, ~1500개 키) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, 타입 내보내기 |
| `packages/shared/src/i18n/<locale>.ts` | 언어별 번역 파일 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, `useTranslation()` 훅 |
| `apps/web/src/lib/format.ts` | `format()`, `plural()`, `formatFileSize()` 헬퍼 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 공개 엔드포인트 |

## 웹사이트, 문서, API 레퍼런스 번역하기 {#translating-the-web-surfaces}

위의 21개 언어 지원은 **앱**을 다룹니다. 공개 웹사이트(snapotter.com), 이 문서 사이트, REST API 레퍼런스도 별도의 해시 게이트 파이프라인으로 21개 언어 전체로 번역되며, 이 파이프라인은 `packages/shared/src/i18n`의 동일한 도구 이름과 설명을 재사용하므로 용어가 어디서나 일관되게 유지됩니다.

### 기본적으로 기계 번역됨 {#machine-translated-by-default}

웹사이트와 문서의 모든 비영어 페이지는 첫 번역에서 **기계 번역**되며(제3자 서비스가 아니라 Claude Code 세션으로), 그 사실을 알리는 작고 닫을 수 있는 배너와 여기로 돌아오는 링크가 함께 표시됩니다. 이는 의도적입니다: 21개 언어를 빠르고 정직하게 제공한 다음, 가장 중요한 페이지를 다듬도록 커뮤니티를 초대합니다. 기계 번역은 의미를 전달하고, 사람의 검토는 자연스럽게 읽히도록 만듭니다.

### 파이프라인이 무엇을 번역할지 결정하는 방식 {#how-the-web-pipeline-decides}

영어 원본의 번역 가능한 각 단위는 해시로 처리되고, 그 해시는 번역 옆에 저장됩니다. 실행할 때마다 파이프라인은:

- 아직 번역이 없는 단위를 번역하고,
- 저장된 해시가 여전히 영어 원본과 일치하는 단위는 건너뛰며,
- 영어 원본이 변경되면 **machine** 단위를 다시 번역하고,
- **human**이 다듬은 단위는 영어 원본이 변경되면 작업을 덮어쓰지 않고 `stale`(검토 필요)으로 표시합니다.

### PR로 웹 번역 다듬기 {#refining-a-web-translation-by-pr}

웹사이트, 문서, API 레퍼런스 번역을 개선하는 방법은 앱 로케일을 개선하는 방법과 같습니다: 생성된 파일을 편집하고 PR을 엽니다.

1. 해당 언어에 대해 생성된 번역을 찾으세요:
   - 웹사이트 UI 문자열: `apps/landing/src/i18n/<locale>.json`
   - 문서 페이지: `apps/docs/<locale>/**.md`
   - API 레퍼런스: `apps/api/src/openapi.<locale>.yaml`
2. 텍스트를 편집하세요. 코드, 링크, `{placeholders}`, 그리고 모든 `⸤I18N…⸥` 마커는 정확히 그대로 유지하세요; 파이프라인의 검증기는 이를 누락하거나 순서를 바꾼 번역을 거부합니다.
3. PR을 여세요. 단위를 편집하면 그 출처가 `machine`에서 `human`로 바뀌므로, 파이프라인은 이후 실행에서 **절대 덮어쓰지 않습니다**. 이후 영어 원본이 변경되면, 해당 단위는 조용히 교체되지 않고 검토를 위해 `stale`로 표시됩니다.

코드를 제출하지 않고 오역을 신고하려면, 페이지 URL과 언어, 잘못된 텍스트, 제안하는 수정안을 담아 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)를 열어 주세요.

::: tip 
번역 파이프라인은 메인테이너가 실행하므로, 기여하는 데 API 키가 필요하지 않습니다. 생성된 파일을 편집하고 PR만 열면 됩니다. 파이프라인이 실행되는 방식은 [`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)를 참고하세요.
:::
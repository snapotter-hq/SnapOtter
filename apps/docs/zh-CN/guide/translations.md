---
description: SnapOtter 支持的 21 种语言，以及如何使用 TypeScript 强制约束的 i18n 系统创建或改进翻译。
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: be2027b68f1d
---

# 翻译指南 {#translation-guide}

SnapOtter 开箱即支持 21 种语言。i18n 系统采用轻量级的自定义运行时，配合 TypeScript 强制的语言完整性校验和动态代码分割。

## 支持的语言 {#supported-languages}

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

## 语言检测的工作原理 {#how-language-detection-works}

SnapOtter 采用三层解析顺序：

1. **用户偏好** - 存储在 `localStorage("snapotter-locale")` 中，登录后会同步到用户设置
2. **浏览器自动检测** - 遍历 `navigator.languages` 数组，使用 BCP 47 前缀匹配
3. **实例默认值** - 管理员的 `DEFAULT_LOCALE` 环境变量（从 `GET /api/v1/config/locale` 获取）
4. **英语兜底** - 始终可用

用户可以从以下位置更改语言：
- **页脚地球图标选择器**（桌面端，始终可见）
- **登录页**的语言选择器（登录前）
- **设置 > 常规** 部分（按用户设置的偏好）
- **移动端侧边栏**的语言下拉菜单
- **设置 > 系统** 部分设置实例级默认值（仅限管理员）

## 翻译的工作原理 {#how-translations-work}

所有 UI 字符串都放在 `packages/shared/src/i18n/` 中。参考文件是 `en.ts`，它导出一个带类型的对象，包含应用使用的每一条字符串（约 1500 个键）。其他语言是各自独立的文件（例如 `de.ts`、`fr.ts`），导出相同的结构。

`TranslationKeys` 类型使用 `DeepStringRecord` 来接受任意字符串值，同时强制约束键结构。TypeScript 会在编译时捕获任何翻译文件中缺失的键。

运行时仅通过动态 `import()` 加载当前激活的语言，从而保持主包体积精简。

## 在组件中使用翻译 {#using-translations-in-components}

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

## 贡献一份翻译 {#contributing-a-translation}

我们欢迎直接提交翻译 PR。你可以改进现有语言，也可以新增一门语言。

如果只想反馈错误翻译而不提交代码，可以打开一个 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，附上语言、错误的字符串以及建议的修正。

::: tip 
翻译 PR 无需事先审批。Fork 仓库，做出你的修改，然后开一个 PR。完整的 PR 流程和 CLA 要求请参见 [贡献指南](/zh-CN/guide/contributing)。
:::

## 如何创建或更新翻译 {#how-to-create-or-update-a-translation}

### 1. Fork 并克隆 {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 复制参考文件（仅限新语言） {#_2-copy-the-reference-file-new-language-only}

如果你是在改进现有翻译，请跳过此步。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 翻译字符串 {#_3-translate-the-strings}

打开你的新文件，翻译每一个字符串值。保持对象结构和键完全不变。

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

规则：
- 不要翻译对象的键，只翻译字符串值
- 保持 `as const` 在末尾
- 从 `./en.js` 导入 `TranslationKeys`，并为你的导出标注类型
- 保持 `{variable}` 占位符原样不变
- 数组（`rotatingPhrases`、`progressMessages`）必须具有相同数量的条目
- 不要翻译：SnapOtter、JPEG、PNG、WebP、EXIF、API 以及其他技术术语

### 4. 注册语言（仅限新语言） {#_4-register-the-locale-new-language-only}

将你的语言添加到 `packages/shared/src/i18n/index.ts` 中的 `SUPPORTED_LOCALES`：

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 校验 {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 提交 {#_6-submit}

针对 `main` 开一个 PR，标题形如 `feat(i18n): add Swedish translation` 或 `fix(i18n): correct German typos`。你首次贡献时，CLA 机器人会要求你签署。

## 添加新的翻译键 {#adding-new-translation-keys}

当新增一项需要新 UI 字符串的功能时：

1. 先将新键添加到 `en.ts`（参考文件）
2. 运行 `pnpm typecheck` - 任何缺少新键的语言文件都会失败
3. 将新键添加到所有语言文件中（可暂时用英语作为兜底）

## 配置 {#configuration}

通过环境变量设置实例的默认语言：

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 文件参考 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英语字符串（参考语言，约 1500 个键） |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、类型导出 |
| `packages/shared/src/i18n/<locale>.ts` | 各语言的翻译文件 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` hook |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` 辅助函数 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公开端点 |

---
description: "SnapOtter 支持的 21 种语言，以及如何使用受 TypeScript 强制约束的 i18n 系统创建或改进翻译。"
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: b82813334f15
---

# 翻译指南 {#translation-guide}

SnapOtter 开箱即支持 21 种语言。i18n 系统采用轻量级自定义运行时，具备受 TypeScript 强制约束的语言完整性和动态代码拆分能力。

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

1. **用户偏好** - 存储在 `localStorage("snapotter-locale")` 中，并在用户已登录时同步到用户设置
2. **浏览器自动检测** - 遍历 `navigator.languages` 数组，采用 BCP 47 前缀匹配
3. **实例默认值** - 管理员的 `DEFAULT_LOCALE` 环境变量（从 `GET /api/v1/config/locale` 获取）
4. **英语回退** - 始终可用

用户可以通过以下方式更改语言：
- **页脚地球图标选择器**（桌面端，始终可见）
- **登录页**语言选择器（登录前）
- **设置 > 通用**部分（每位用户的偏好）
- **移动端侧边栏**语言下拉菜单
- **设置 > 系统**部分设置全实例范围的默认值（仅限管理员）

## 翻译的工作原理 {#how-translations-work}

所有 UI 字符串都位于 `packages/shared/src/i18n/` 中。参考文件是 `en.ts`，它导出一个带类型的对象，包含应用使用的每个字符串（约 1500 个键）。其他语言是导出相同结构的独立文件（例如 `de.ts`、`fr.ts`）。

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

## 贡献翻译 {#contributing-a-translation}

我们欢迎直接提交翻译 PR。你可以改进现有语言，也可以添加新语言。

若要在不提交代码的情况下报告误译，请提交一个 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，附上语言、错误的字符串以及建议的修正。

::: tip 
翻译 PR 无需事先批准。Fork 仓库、进行修改并提交 PR 即可。完整的 PR 流程和 CLA 要求参见 [贡献指南](/zh-CN/guide/contributing)。
:::

## 如何创建或更新翻译 {#how-to-create-or-update-a-translation}

### 1. Fork 并克隆 {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. 复制参考文件（仅限新语言）{#_2-copy-the-reference-file-new-language-only}

如果你是在改进现有翻译，请跳过此步骤。

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. 翻译字符串 {#_3-translate-the-strings}

打开新文件并翻译每个字符串值。保持对象结构和键完全不变。

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
- 不要翻译对象键，只翻译字符串值
- 将 `as const` 保留在末尾
- 从 `./en.js` 导入 `TranslationKeys` 并为你的导出添加类型
- 将 `{variable}` 占位符原样保留
- 数组（`rotatingPhrases`、`progressMessages`）必须有相同数量的条目
- 不要翻译：SnapOtter、JPEG、PNG、WebP、EXIF、API 及其他技术术语

### 4. 注册语言（仅限新语言）{#_4-register-the-locale-new-language-only}

将你的语言添加到 `packages/shared/src/i18n/index.ts` 中的 `SUPPORTED_LOCALES`：

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. 验证 {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. 提交 {#_6-submit}

针对 `main` 提交一个 PR，标题类似 `feat(i18n): add Swedish translation` 或 `fix(i18n): correct German typos`。CLA 机器人会在你首次贡献时要求你签署。

## 添加新的翻译键 {#adding-new-translation-keys}

当添加需要新 UI 字符串的新功能时：

1. 首先将新键添加到 `en.ts`（参考文件）
2. 运行 `pnpm typecheck` - 缺少新键的每个语言文件都会失败
3. 将新键添加到所有语言文件（使用英语作为临时回退）

## 配置 {#configuration}

通过环境变量设置实例默认语言：

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## 文件参考 {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | 英语字符串（参考语言，约 1500 个键）|
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`、`loadTranslations()`、类型导出 |
| `packages/shared/src/i18n/<locale>.ts` | 各语言翻译文件 |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`、`useTranslation()` 钩子 |
| `apps/web/src/lib/format.ts` | `format()`、`plural()`、`formatFileSize()` 辅助函数 |
| `apps/api/src/routes/config.ts` | `GET /api/v1/config/locale` 公共端点 |

## 翻译网站、文档和 API 参考 {#translating-the-web-surfaces}

上述 21 种语言支持涵盖的是**应用**。公共网站（snapotter.com）、本文档站点以及 REST API 参考也都被翻译成全部 21 种语言，由一条独立的哈希门控流水线完成，它复用了来自 `packages/shared/src/i18n` 的相同工具名称和描述，因此术语在各处保持一致。

### 默认采用机器翻译 {#machine-translated-by-default}

网站和文档中的每个非英语页面在首轮都是**机器翻译**的（由 Claude Code 会话完成，而非第三方服务），并带有一条小巧、可关闭的横幅进行说明，附有返回本页的链接。这是有意为之：它能快速而诚实地交付全部 21 种语言，然后邀请社区去精修最重要的页面。机器翻译能传达含义；人工审阅让文字读起来更自然。

### 流水线如何决定翻译内容 {#how-the-web-pipeline-decides}

每个可翻译的英语源单元都会被哈希，哈希值与其翻译存放在一起。每次运行时，流水线会：

- 翻译任何尚无翻译的单元，
- 跳过任何存储哈希仍与英语源匹配的单元，
- 当**机器**单元的英语源发生变化时重新翻译它，
- 并在经过**人工**精修的单元其英语源发生变化时将其标记为 `stale`（需要审阅），而不是覆盖你的成果。

### 通过 PR 精修网页翻译 {#refining-a-web-translation-by-pr}

改进网站、文档或 API 参考翻译的方式，与改进应用语言相同：编辑生成的文件并提交 PR。

1. 找到你所用语言的生成翻译：
   - 网站 UI 字符串：`apps/landing/src/i18n/<locale>.json`
   - 文档页面：`apps/docs/<locale>/**.md`
   - API 参考：`apps/api/src/openapi.<locale>.yaml`
2. 编辑文本。将代码、链接、`{placeholders}` 以及任何 `⸤I18N…⸥` 标记完全原样保留；流水线的验证器会拒绝丢弃或重新排序它们的翻译。
3. 提交 PR。编辑一个单元会将其来源从 `machine` 翻转为 `human`，因此流水线在后续运行时**绝不会覆盖它**。如果之后英语源发生变化，你的单元会被标记为 `stale` 以待审阅，而不是被悄悄替换。

若要在不提交代码的情况下报告误译，请提交一个 [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues)，附上页面 URL、语言、错误的文本以及你建议的修正。

::: tip 
维护者会运行翻译流水线；你无需 API 密钥即可贡献。只需编辑生成的文件并提交 PR。流水线的运行方式参见 [`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)。
:::

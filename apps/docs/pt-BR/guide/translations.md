---
description: "21 idiomas suportados e como criar ou melhorar traduções para o SnapOtter usando o sistema de i18n reforçado por TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 4c6929c0aa00
---

# Guia de tradução {#translation-guide}

O SnapOtter já vem com 21 idiomas prontos para uso. O sistema de i18n usa um runtime personalizado leve, com completude de locale reforçada por TypeScript e divisão dinâmica de código.

## Idiomas suportados {#supported-languages}

| Código | Idioma | Nome nativo | Direção |
|------|----------|-------------|-----------|
| `en` | Inglês | English | LTR |
| `zh-CN` | Chinês (Simplificado) | 简体中文 | LTR |
| `zh-TW` | Chinês (Tradicional) | 繁體中文 | LTR |
| `ja` | Japonês | 日本語 | LTR |
| `ko` | Coreano | 한국어 | LTR |
| `es` | Espanhol | Español | LTR |
| `fr` | Francês | Français | LTR |
| `it` | Italiano | Italiano | LTR |
| `pt-BR` | Português (Brasil) | Português (Brasil) | LTR |
| `de` | Alemão | Deutsch | LTR |
| `nl` | Holandês | Nederlands | LTR |
| `sv` | Sueco | Svenska | LTR |
| `ru` | Russo | Русский | LTR |
| `pl` | Polonês | Polski | LTR |
| `uk` | Ucraniano | Українська | LTR |
| `ar` | Árabe | العربية | RTL |
| `tr` | Turco | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamita | Tiếng Việt | LTR |
| `id` | Indonésio | Bahasa Indonesia | LTR |
| `th` | Tailandês | ไทย | LTR |

## Como funciona a detecção de idioma {#how-language-detection-works}

O SnapOtter usa uma ordem de resolução em três níveis:

1. **Preferência do usuário** - armazenada em `localStorage("snapotter-locale")` e sincronizada com as configurações do usuário quando autenticado
2. **Detecção automática do navegador** - percorre o array `navigator.languages` com correspondência de prefixo BCP 47
3. **Padrão da instância** - a variável de ambiente `DEFAULT_LOCALE` do administrador (obtida de `GET /api/v1/config/locale`)
4. **Fallback para o inglês** - sempre disponível

Os usuários podem alterar o idioma em:
- O **seletor de globo no rodapé** (desktop, sempre visível)
- O seletor de idioma da **página de login** (pré-autenticação)
- A seção **Configurações > Geral** (preferência por usuário)
- O menu suspenso de idioma da **barra lateral no celular**
- A seção **Configurações > Sistema** define o padrão de toda a instância (somente administrador)

## Como funcionam as traduções {#how-translations-work}

Todas as strings da interface ficam em `packages/shared/src/i18n/`. O arquivo de referência é `en.ts`, que exporta um objeto tipado com todas as strings que o app utiliza (~1500 chaves). Outros idiomas são arquivos separados (por exemplo, `de.ts`, `fr.ts`) que exportam o mesmo formato.

O tipo `TranslationKeys` usa `DeepStringRecord` para aceitar qualquer valor de string enquanto impõe a estrutura de chaves. O TypeScript detecta chaves ausentes em qualquer arquivo de tradução em tempo de compilação.

Apenas o locale ativo é carregado em tempo de execução via `import()` dinâmico, mantendo o bundle principal pequeno.

## Usando traduções em componentes {#using-translations-in-components}

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

## Contribuindo com uma tradução {#contributing-a-translation}

Aceitamos PRs de tradução diretamente. Você pode melhorar um locale existente ou adicionar um novo.

Para relatar uma tradução incorreta sem enviar código, abra uma [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) com o idioma, a string incorreta e a correção sugerida.

::: tip 
PRs de tradução não exigem aprovação prévia. Faça um fork do repositório, faça suas alterações e abra um PR. Consulte o [Guia de Contribuição](/pt-BR/guide/contributing) para conhecer todo o processo de PR e o requisito de CLA.
:::

## Como criar ou atualizar uma tradução {#how-to-create-or-update-a-translation}

### 1. Faça o fork e clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copie o arquivo de referência (somente para novo idioma) {#_2-copy-the-reference-file-new-language-only}

Pule esta etapa se você estiver melhorando uma tradução existente.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Traduza as strings {#_3-translate-the-strings}

Abra seu novo arquivo e traduza cada valor de string. Mantenha a estrutura do objeto e as chaves exatamente iguais.

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

Regras:
- Não traduza as chaves do objeto, apenas os valores de string
- Mantenha `as const` ao final
- Importe `TranslationKeys` de `./en.js` e tipe sua exportação
- Mantenha os marcadores `{variable}` exatamente como estão
- Os arrays (`rotatingPhrases`, `progressMessages`) devem ter o mesmo número de entradas
- Não traduza: SnapOtter, JPEG, PNG, WebP, EXIF, API e outros termos técnicos

### 4. Registre o locale (somente para novo idioma) {#_4-register-the-locale-new-language-only}

Adicione seu locale a `SUPPORTED_LOCALES` em `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifique {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Envie {#_6-submit}

Abra um PR contra `main` com um título como `feat(i18n): add Swedish translation` ou `fix(i18n): correct German typos`. O bot de CLA pedirá que você assine na sua primeira contribuição.

## Adicionando novas chaves de tradução {#adding-new-translation-keys}

Ao adicionar um novo recurso que precisa de novas strings de interface:

1. Adicione as novas chaves a `en.ts` primeiro (o arquivo de referência)
2. Execute `pnpm typecheck` - cada arquivo de locale falhará se a nova chave estiver ausente
3. Adicione a nova chave a todos os arquivos de locale (use o inglês como fallback temporário)

## Configuração {#configuration}

Defina o idioma padrão da instância por meio de uma variável de ambiente:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referência de arquivos {#file-reference}

| Arquivo | Finalidade |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Strings em inglês (locale de referência, ~1500 chaves) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, exportações de tipos |
| `packages/shared/src/i18n/<locale>.ts` | Arquivos de tradução por idioma |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helpers `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint público `GET /api/v1/config/locale` |

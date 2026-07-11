---
description: "21 idiomas suportados e como criar ou aprimorar traduções para o SnapOtter usando o sistema de i18n reforçado por TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 06674d601ead
---

# Guia de tradução {#translation-guide}

O SnapOtter já vem com 21 idiomas prontos para uso. O sistema de i18n usa um runtime próprio e leve, com completude de locale garantida pelo TypeScript e code-splitting dinâmico.

## Idiomas suportados {#supported-languages}

| Code | Language | Native Name | Direction |
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
| `hi` | Híndi | हिन्दी | LTR |
| `vi` | Vietnamita | Tiếng Việt | LTR |
| `id` | Indonésio | Bahasa Indonesia | LTR |
| `th` | Tailandês | ไทย | LTR |

## Como funciona a detecção de idioma {#how-language-detection-works}

O SnapOtter usa uma ordem de resolução em três camadas:

1. **Preferência do usuário** - armazenada em `localStorage("snapotter-locale")` e sincronizada com as configurações do usuário quando autenticado
2. **Detecção automática do navegador** - percorre o array `navigator.languages` com correspondência de prefixo BCP 47
3. **Padrão da instância** - a variável de ambiente `DEFAULT_LOCALE` do administrador (obtida de `GET /api/v1/config/locale`)
4. **Fallback para inglês** - sempre disponível

Os usuários podem alterar o idioma a partir de:
- O **seletor Globo no rodapé** (desktop, sempre visível)
- O seletor de idioma da **página de login** (pré-autenticação)
- A seção **Configurações > Geral** (preferência por usuário)
- O menu suspenso de idioma da **barra lateral móvel**
- A seção **Configurações > Sistema** define o padrão para toda a instância (somente administrador)

## Como funcionam as traduções {#how-translations-work}

Todas as strings da interface ficam em `packages/shared/src/i18n/`. O arquivo de referência é `en.ts`, que exporta um objeto tipado com todas as strings que o app usa (~1500 chaves). Os demais idiomas são arquivos separados (por exemplo, `de.ts`, `fr.ts`) que exportam a mesma estrutura.

O tipo `TranslationKeys` usa `DeepStringRecord` para aceitar qualquer valor de string enquanto impõe a estrutura das chaves. O TypeScript detecta chaves faltantes em qualquer arquivo de tradução em tempo de compilação.

Apenas o locale ativo é carregado em runtime via `import()` dinâmico, mantendo o bundle principal pequeno.

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

Aceitamos PRs de tradução diretamente. Você pode aprimorar um locale existente ou adicionar um novo.

Para relatar uma tradução incorreta sem enviar código, abra uma [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) com o idioma, a string incorreta e a correção sugerida.

::: tip 
PRs de tradução não exigem aprovação prévia. Faça um fork do repositório, faça suas alterações e abra um PR. Consulte o [Guia de Contribuição](/pt-BR/guide/contributing) para o processo completo de PR e o requisito de CLA.
:::

## Como criar ou atualizar uma tradução {#how-to-create-or-update-a-translation}

### 1. Faça o fork e clone {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copie o arquivo de referência (apenas novo idioma) {#_2-copy-the-reference-file-new-language-only}

Pule esta etapa se você estiver aprimorando uma tradução existente.

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
- Mantenha `as const` no final
- Importe `TranslationKeys` de `./en.js` e tipe sua exportação
- Mantenha os placeholders `{variable}` exatamente como estão
- Os arrays (`rotatingPhrases`, `progressMessages`) devem ter o mesmo número de entradas
- Não traduza: SnapOtter, JPEG, PNG, WebP, EXIF, API e outros termos técnicos

### 4. Registre o locale (apenas novo idioma) {#_4-register-the-locale-new-language-only}

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

Abra um PR contra `main` com um título como `feat(i18n): add Swedish translation` ou `fix(i18n): correct German typos`. O bot do CLA pedirá que você assine na sua primeira contribuição.

## Adicionando novas chaves de tradução {#adding-new-translation-keys}

Ao adicionar um novo recurso que precise de novas strings de interface:

1. Adicione as novas chaves a `en.ts` primeiro (o arquivo de referência)
2. Execute `pnpm typecheck` - cada arquivo de locale falhará se estiver sem a nova chave
3. Adicione a nova chave a todos os arquivos de locale (use o inglês como fallback temporário)

## Configuração {#configuration}

Defina o idioma padrão da instância por meio de variável de ambiente:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referência de arquivos {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Strings em inglês (locale de referência, ~1500 chaves) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, exportações de tipos |
| `packages/shared/src/i18n/<locale>.ts` | Arquivos de tradução por idioma |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helpers `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint público `GET /api/v1/config/locale` |

## Traduzindo o site, a documentação e a referência da API {#translating-the-web-surfaces}

O suporte a 21 idiomas descrito acima cobre o **app**. O site público
(snapotter.com), este site de documentação e a referência da API REST também são
traduzidos para todos os 21 idiomas, por um pipeline separado protegido por hash que reutiliza
os mesmos nomes e descrições de ferramentas de `packages/shared/src/i18n`, de modo que
a terminologia permaneça consistente em toda parte.

### Traduzido por máquina por padrão {#machine-translated-by-default}

Toda página que não seja em inglês no site e na documentação é **traduzida por máquina** na
primeira passagem (por uma sessão do Claude Code, não por um serviço de terceiros) e traz um
pequeno banner dispensável dizendo isso, com um link de volta para cá. Isso é deliberado:
entrega todos os 21 idiomas com rapidez e honestidade e, então, convida a comunidade a
refinar as páginas que mais importam. A tradução por máquina transmite o significado;
a revisão humana faz o texto soar natural.

### Como o pipeline decide o que traduzir {#how-the-web-pipeline-decides}

Cada unidade traduzível do texto-fonte em inglês é submetida a hash, e o hash é armazenado ao lado
de sua tradução. A cada execução, o pipeline:

- traduz qualquer unidade que ainda não tenha tradução,
- pula qualquer unidade cujo hash armazenado ainda corresponda ao texto-fonte em inglês,
- retraduz uma unidade de **máquina** quando seu texto-fonte em inglês muda,
- e sinaliza uma unidade refinada por **humano** como `stale` (precisa de revisão) quando seu texto-fonte
  em inglês muda, em vez de sobrescrever seu trabalho.

### Refinando uma tradução da web por PR {#refining-a-web-translation-by-pr}

Você aprimora uma tradução do site, da documentação ou da referência da API da mesma forma que
aprimora um locale do app: editando o arquivo gerado e abrindo um PR.

1. Encontre a tradução gerada para o seu idioma:
   - strings de interface do site: `apps/landing/src/i18n/<locale>.json`
   - uma página da documentação: `apps/docs/<locale>/**.md`
   - a referência da API: `apps/api/src/openapi.<locale>.yaml`
2. Edite o texto. Mantenha código, links, `{placeholders}` e quaisquer marcadores `⸤I18N…⸥`
   exatamente como estão; o validador do pipeline rejeita uma tradução que remova
   ou reordene esses elementos.
3. Abra um PR. Editar uma unidade muda sua proveniência de `machine` para `human`, de modo que
   o pipeline **nunca a sobrescreverá** em uma execução posterior. Se o texto-fonte em inglês
   mudar depois, sua unidade é sinalizada como `stale` para revisão, em vez de ser
   substituída silenciosamente.

Para relatar uma tradução incorreta sem enviar código, abra uma
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) com a URL da
página, o idioma, o texto incorreto e sua correção sugerida.

::: tip 
Os mantenedores executam o pipeline de tradução; você não precisa de uma chave de API para
contribuir. Basta editar o arquivo gerado e abrir um PR. Consulte
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
para saber como o pipeline funciona.
:::
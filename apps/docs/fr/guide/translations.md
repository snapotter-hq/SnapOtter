---
description: "21 langues prises en charge et comment créer ou améliorer les traductions de SnapOtter grâce au système i18n renforcé par TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 41ea72d752c0
---

# Guide de traduction {#translation-guide}

SnapOtter est livré avec 21 langues prêtes à l'emploi. Le système i18n s'appuie sur un moteur d'exécution personnalisé et léger, avec une complétude des locales garantie par TypeScript et un découpage dynamique du code.

## Langues prises en charge {#supported-languages}

| Code | Langue | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Anglais | English | LTR |
| `zh-CN` | Chinois (simplifié) | 简体中文 | LTR |
| `zh-TW` | Chinois (traditionnel) | 繁體中文 | LTR |
| `ja` | Japonais | 日本語 | LTR |
| `ko` | Coréen | 한국어 | LTR |
| `es` | Espagnol | Español | LTR |
| `fr` | Français | Français | LTR |
| `it` | Italien | Italiano | LTR |
| `pt-BR` | Portugais (Brésil) | Português (Brasil) | LTR |
| `de` | Allemand | Deutsch | LTR |
| `nl` | Néerlandais | Nederlands | LTR |
| `sv` | Suédois | Svenska | LTR |
| `ru` | Russe | Русский | LTR |
| `pl` | Polonais | Polski | LTR |
| `uk` | Ukrainien | Українська | LTR |
| `ar` | Arabe | العربية | RTL |
| `tr` | Turc | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamien | Tiếng Việt | LTR |
| `id` | Indonésien | Bahasa Indonesia | LTR |
| `th` | Thaï | ไทย | LTR |

## Fonctionnement de la détection de langue {#how-language-detection-works}

SnapOtter utilise un ordre de résolution à trois niveaux :

1. **Préférence de l'utilisateur** - stockée dans `localStorage("snapotter-locale")` et synchronisée avec les paramètres de l'utilisateur une fois authentifié
2. **Détection automatique du navigateur** - parcourt le tableau `navigator.languages` avec une correspondance de préfixe BCP 47
3. **Valeur par défaut de l'instance** - la variable d'environnement `DEFAULT_LOCALE` de l'administrateur (récupérée depuis `GET /api/v1/config/locale`)
4. **Repli sur l'anglais** - toujours disponible

Les utilisateurs peuvent changer de langue depuis :
- Le **sélecteur Globe du pied de page** (bureau, toujours visible)
- Le sélecteur de langue de la **page de connexion** (avant l'authentification)
- La section **Paramètres > Général** (préférence par utilisateur)
- La liste déroulante de langue de la **barre latérale mobile**
- La section **Paramètres > Système** définit la valeur par défaut à l'échelle de l'instance (administrateur uniquement)

## Fonctionnement des traductions {#how-translations-work}

Toutes les chaînes de l'interface se trouvent dans `packages/shared/src/i18n/`. Le fichier de référence est `en.ts`, qui exporte un objet typé contenant chaque chaîne utilisée par l'application (~1500 clés). Les autres langues sont des fichiers distincts (par ex. `de.ts`, `fr.ts`) qui exportent la même structure.

Le type `TranslationKeys` utilise `DeepStringRecord` pour accepter n'importe quelle valeur de chaîne tout en imposant la structure des clés. TypeScript détecte les clés manquantes dans n'importe quel fichier de traduction au moment de la compilation.

Seule la locale active est chargée à l'exécution via un `import()` dynamique, ce qui maintient le bundle principal petit.

## Utiliser les traductions dans les composants {#using-translations-in-components}

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

## Contribuer à une traduction {#contributing-a-translation}

Nous accueillons directement les PR de traduction. Vous pouvez améliorer une locale existante ou en ajouter une nouvelle.

Pour signaler une erreur de traduction sans soumettre de code, ouvrez une [issue GitHub](https://github.com/snapotter-hq/SnapOtter/issues) en indiquant la langue, la chaîne incorrecte et la correction suggérée.

::: tip 
Les PR de traduction ne nécessitent pas d'approbation préalable. Forkez le dépôt, apportez vos modifications et ouvrez une PR. Consultez le [guide de contribution](/fr/guide/contributing) pour le processus complet de PR et l'exigence de CLA.
:::

## Comment créer ou mettre à jour une traduction {#how-to-create-or-update-a-translation}

### 1. Forker et cloner {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copier le fichier de référence (nouvelle langue uniquement) {#_2-copy-the-reference-file-new-language-only}

Ignorez cette étape si vous améliorez une traduction existante.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Traduire les chaînes {#_3-translate-the-strings}

Ouvrez votre nouveau fichier et traduisez chaque valeur de chaîne. Conservez exactement la même structure d'objet et les mêmes clés.

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

Règles :
- Ne traduisez pas les clés d'objet, uniquement les valeurs de chaîne
- Conservez `as const` à la fin
- Importez `TranslationKeys` depuis `./en.js` et typez votre export
- Conservez les espaces réservés `{variable}` exactement tels quels
- Les tableaux (`rotatingPhrases`, `progressMessages`) doivent comporter le même nombre d'entrées
- Ne traduisez pas : SnapOtter, JPEG, PNG, WebP, EXIF, API et autres termes techniques

### 4. Enregistrer la locale (nouvelle langue uniquement) {#_4-register-the-locale-new-language-only}

Ajoutez votre locale à `SUPPORTED_LOCALES` dans `packages/shared/src/i18n/index.ts` :

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Vérifier {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Soumettre {#_6-submit}

Ouvrez une PR sur `main` avec un titre du type `feat(i18n): add Swedish translation` ou `fix(i18n): correct German typos`. Le bot CLA vous demandera de signer lors de votre première contribution.

## Ajouter de nouvelles clés de traduction {#adding-new-translation-keys}

Lorsque vous ajoutez une nouvelle fonctionnalité qui nécessite de nouvelles chaînes d'interface :

1. Ajoutez d'abord les nouvelles clés à `en.ts` (le fichier de référence)
2. Exécutez `pnpm typecheck` - chaque fichier de locale échouera s'il manque la nouvelle clé
3. Ajoutez la nouvelle clé à tous les fichiers de locale (utilisez l'anglais comme repli temporaire)

## Configuration {#configuration}

Définissez la langue par défaut de l'instance via une variable d'environnement :

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Référence des fichiers {#file-reference}

| Fichier | Rôle |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Chaînes anglaises (locale de référence, ~1500 clés) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, exports de types |
| `packages/shared/src/i18n/<locale>.ts` | Fichiers de traduction par langue |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Fonctions utilitaires `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Point de terminaison public `GET /api/v1/config/locale` |

## Traduire le site web, la documentation et la référence de l'API {#translating-the-web-surfaces}

La prise en charge de 21 langues décrite ci-dessus couvre l'**application**. Le site web public
(snapotter.com), ce site de documentation et la référence de l'API REST sont également
traduits dans les 21 langues, par un pipeline distinct verrouillé par hachage qui réutilise
les mêmes noms et descriptions d'outils issus de `packages/shared/src/i18n`, afin que
la terminologie reste cohérente partout.

### Traduction automatique par défaut {#machine-translated-by-default}

Chaque page non anglaise du site web et de la documentation est **traduite automatiquement** lors du
premier passage (par une session Claude Code, et non un service tiers) et porte une
petite bannière fermable qui l'indique, avec un lien renvoyant ici. C'est délibéré :
cela permet de livrer les 21 langues rapidement et honnêtement, puis d'inviter la communauté à
affiner les pages qui comptent le plus. La traduction automatique fait passer le sens ;
la relecture humaine la rend naturelle à lire.

### Comment le pipeline décide de ce qu'il faut traduire {#how-the-web-pipeline-decides}

Chaque unité traduisible de la source anglaise est hachée, et le hachage est stocké à côté
de sa traduction. À chaque exécution, le pipeline :

- traduit toute unité qui n'a pas encore de traduction,
- ignore toute unité dont le hachage stocké correspond toujours à la source anglaise,
- retraduit une unité **machine** lorsque sa source anglaise change,
- et signale une unité affinée par un **humain** comme `stale` (à relire) lorsque sa source
  anglaise change, au lieu d'écraser votre travail.

### Affiner une traduction web par PR {#refining-a-web-translation-by-pr}

Vous améliorez une traduction du site web, de la documentation ou de la référence de l'API de la même manière que vous
améliorez une locale de l'application : en modifiant le fichier généré et en ouvrant une PR.

1. Trouvez la traduction générée pour votre langue :
   - chaînes d'interface du site web : `apps/landing/src/i18n/<locale>.json`
   - une page de documentation : `apps/docs/<locale>/**.md`
   - la référence de l'API : `apps/api/src/openapi.<locale>.yaml`
2. Modifiez le texte. Conservez le code, les liens, `{placeholders}` et tous les marqueurs `⸤I18N…⸥`
   exactement tels quels ; le validateur du pipeline rejette une traduction qui les supprime
   ou les réordonne.
3. Ouvrez une PR. La modification d'une unité fait passer sa provenance de `machine` à `human`, de sorte que
   le pipeline ne l'**écrasera jamais** lors d'une exécution ultérieure. Si la source anglaise
   change par la suite, votre unité est signalée `stale` pour relecture plutôt que
   remplacée silencieusement.

Pour signaler une erreur de traduction sans soumettre de code, ouvrez une
[issue GitHub](https://github.com/snapotter-hq/SnapOtter/issues) en indiquant l'URL de la page,
la langue, le texte incorrect et votre correction suggérée.

::: tip 
Les mainteneurs exécutent le pipeline de traduction ; vous n'avez pas besoin de clé API pour
contribuer. Modifiez simplement le fichier généré et ouvrez une PR. Consultez
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
pour savoir comment le pipeline s'exécute.
:::
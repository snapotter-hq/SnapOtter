---
description: "21 idiomas admitidos y cómo crear o mejorar traducciones para SnapOtter usando el sistema i18n reforzado con TypeScript."
i18n_source_hash: 55837d9fdaef
i18n_provenance: human
i18n_output_hash: 4dffadc0da66
---

# Guía de traducción {#translation-guide}

SnapOtter incluye 21 idiomas de fábrica. El sistema i18n usa un runtime propio y ligero, con integridad de locales reforzada por TypeScript y división dinámica del código.

## Idiomas admitidos {#supported-languages}

| Code | Language | Native Name | Direction |
|------|----------|-------------|-----------|
| `en` | Inglés | English | LTR |
| `zh-CN` | Chino (simplificado) | 简体中文 | LTR |
| `zh-TW` | Chino (tradicional) | 繁體中文 | LTR |
| `ja` | Japonés | 日本語 | LTR |
| `ko` | Coreano | 한국어 | LTR |
| `es` | Español | Español | LTR |
| `fr` | Francés | Français | LTR |
| `it` | Italiano | Italiano | LTR |
| `pt-BR` | Portugués (Brasil) | Português (Brasil) | LTR |
| `de` | Alemán | Deutsch | LTR |
| `nl` | Neerlandés | Nederlands | LTR |
| `sv` | Sueco | Svenska | LTR |
| `ru` | Ruso | Русский | LTR |
| `pl` | Polaco | Polski | LTR |
| `uk` | Ucraniano | Українська | LTR |
| `ar` | Árabe | العربية | RTL |
| `tr` | Turco | Türkçe | LTR |
| `hi` | Hindi | हिन्दी | LTR |
| `vi` | Vietnamita | Tiếng Việt | LTR |
| `id` | Indonesio | Bahasa Indonesia | LTR |
| `th` | Tailandés | ไทย | LTR |

## Cómo funciona la detección de idioma {#how-language-detection-works}

SnapOtter usa un orden de resolución de tres niveles:

1. **Preferencia del usuario**: almacenada en `localStorage("snapotter-locale")` y sincronizada con los ajustes del usuario cuando ha iniciado sesión
2. **Detección automática del navegador**: recorre el array `navigator.languages` con coincidencia de prefijos BCP 47
3. **Predeterminado de la instancia**: la variable de entorno `DEFAULT_LOCALE` del administrador (obtenida de `GET /api/v1/config/locale`)
4. **Respaldo en inglés**: siempre disponible

Los usuarios pueden cambiar el idioma desde:
- El **selector del globo terráqueo del pie de página** (escritorio, siempre visible)
- El selector de idioma de la **página de inicio de sesión** (previo a la autenticación)
- La sección **Ajustes > General** (preferencia por usuario)
- El menú desplegable de idioma de la **barra lateral móvil**
- La sección **Ajustes > Sistema**, que fija el idioma predeterminado de toda la instancia (solo administradores)

## Cómo funcionan las traducciones {#how-translations-work}

Todas las cadenas de la interfaz viven en `packages/shared/src/i18n/`. El archivo de referencia es `en.ts`, que exporta un objeto tipado con todas las cadenas que usa la aplicación (~1500 claves). Los demás idiomas son archivos independientes (por ejemplo, `de.ts`, `fr.ts`) que exportan la misma forma.

El tipo `TranslationKeys` usa `DeepStringRecord` para aceptar cualquier valor de cadena a la vez que refuerza la estructura de claves. TypeScript detecta las claves que falten en cualquier archivo de traducción en tiempo de compilación.

En tiempo de ejecución solo se carga el locale activo mediante `import()` dinámico, lo que mantiene pequeño el bundle principal.

## Uso de traducciones en los componentes {#using-translations-in-components}

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

## Contribuir con una traducción {#contributing-a-translation}

Recibimos con gusto PRs de traducción directamente. Puedes mejorar un locale existente o añadir uno nuevo.

Para informar de una traducción incorrecta sin enviar código, abre un [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) con el idioma, la cadena incorrecta y la corrección sugerida.

::: tip 
Los PRs de traducción no requieren aprobación previa. Haz un fork del repositorio, realiza tus cambios y abre un PR. Consulta la [Guía de contribución](/es/guide/contributing) para conocer el proceso completo de PR y el requisito del CLA.
:::

## Cómo crear o actualizar una traducción {#how-to-create-or-update-a-translation}

### 1. Fork y clonado {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copiar el archivo de referencia (solo para un idioma nuevo) {#_2-copy-the-reference-file-new-language-only}

Omite este paso si estás mejorando una traducción existente.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Traducir las cadenas {#_3-translate-the-strings}

Abre tu nuevo archivo y traduce cada valor de cadena. Mantén exactamente igual la estructura del objeto y las claves.

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

Reglas:
- No traduzcas las claves del objeto, solo los valores de cadena
- Mantén `as const` al final
- Importa `TranslationKeys` desde `./en.js` y tipa tu exportación
- Mantén los marcadores `{variable}` exactamente como están
- Los arrays (`rotatingPhrases`, `progressMessages`) deben tener el mismo número de entradas
- No traduzcas: SnapOtter, JPEG, PNG, WebP, EXIF, API y otros términos técnicos

### 4. Registrar el locale (solo para un idioma nuevo) {#_4-register-the-locale-new-language-only}

Añade tu locale a `SUPPORTED_LOCALES` en `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verificar {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Enviar {#_6-submit}

Abre un PR contra `main` con un título como `feat(i18n): add Swedish translation` o `fix(i18n): correct German typos`. El bot del CLA te pedirá que firmes en tu primera contribución.

## Añadir nuevas claves de traducción {#adding-new-translation-keys}

Al añadir una nueva función que necesita cadenas nuevas en la interfaz:

1. Añade primero las nuevas claves a `en.ts` (el archivo de referencia)
2. Ejecuta `pnpm typecheck`: cada archivo de locale fallará si le falta la nueva clave
3. Añade la nueva clave a todos los archivos de locale (usa el inglés como respaldo temporal)

## Configuración {#configuration}

Establece el idioma predeterminado de la instancia mediante una variable de entorno:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referencia de archivos {#file-reference}

| File | Purpose |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Cadenas en inglés (locale de referencia, ~1500 claves) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, exportaciones de tipos |
| `packages/shared/src/i18n/<locale>.ts` | Archivos de traducción por idioma |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helpers `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint público `GET /api/v1/config/locale` |

## Traducir el sitio web, la documentación y la referencia de la API {#translating-the-web-surfaces}

El soporte de 21 idiomas descrito arriba cubre la **aplicación**. El sitio web público
(snapotter.com), este sitio de documentación y la referencia de la API REST también se
traducen a los 21 idiomas, mediante una canalización independiente controlada por hash que reutiliza
los mismos nombres y descripciones de herramientas de `packages/shared/src/i18n`, de modo que
la terminología se mantenga coherente en todas partes.

### Traducción automática de forma predeterminada {#machine-translated-by-default}

Cada página que no está en inglés del sitio web y de la documentación se **traduce automáticamente** en la
primera pasada (por una sesión de Claude Code, no por un servicio de terceros) y lleva un
banner pequeño y descartable que así lo indica, con un enlace de vuelta aquí. Es intencional:
así se publican los 21 idiomas de forma rápida y honesta, y luego se invita a la comunidad a
refinar las páginas más importantes. La traducción automática transmite el significado; la
revisión humana hace que se lea con naturalidad.

### Cómo decide la canalización qué traducir {#how-the-web-pipeline-decides}

Cada unidad traducible del texto original en inglés se somete a hash, y ese hash se almacena junto
a su traducción. En cada ejecución, la canalización:

- traduce cualquier unidad que todavía no tenga traducción,
- omite cualquier unidad cuyo hash almacenado siga coincidiendo con el texto original en inglés,
- vuelve a traducir una unidad **automática** cuando su texto original en inglés cambia,
- y marca una unidad refinada por un **humano** como `stale` (necesita revisión) cuando su texto
  original en inglés cambia, en lugar de sobrescribir tu trabajo.

### Refinar una traducción del sitio web mediante un PR {#refining-a-web-translation-by-pr}

Mejoras una traducción del sitio web, de la documentación o de la referencia de la API igual que
mejoras un locale de la aplicación: editando el archivo generado y abriendo un PR.

1. Encuentra la traducción generada para tu idioma:
   - cadenas de la interfaz del sitio web: `apps/landing/src/i18n/<locale>.json`
   - una página de documentación: `apps/docs/<locale>/**.md`
   - la referencia de la API: `apps/api/src/openapi.<locale>.yaml`
2. Edita el texto. Mantén el código, los enlaces, `{placeholders}` y cualquier marcador `⸤I18N…⸥`
   exactamente como están; el validador de la canalización rechaza una traducción que los omita
   o reordene.
3. Abre un PR. Editar una unidad cambia su procedencia de `machine` a `human`, de modo que
   la canalización **nunca la sobrescribirá** en una ejecución posterior. Si el texto original en inglés
   cambia después, tu unidad se marca como `stale` para revisión en lugar de
   reemplazarse en silencio.

Para informar de una traducción incorrecta sin enviar código, abre un
[GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) con la
URL de la página, el idioma, el texto incorrecto y tu corrección sugerida.

::: tip 
Los mantenedores ejecutan la canalización de traducción; no necesitas una clave de API para
contribuir. Solo edita el archivo generado y abre un PR. Consulta
[`scripts/i18n/README.md`](https://github.com/snapotter-hq/SnapOtter/blob/main/scripts/i18n/README.md)
para saber cómo se ejecuta la canalización.
:::
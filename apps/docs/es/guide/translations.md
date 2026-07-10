---
description: "21 idiomas admitidos y cómo crear o mejorar traducciones de SnapOtter usando el sistema i18n con validación de TypeScript."
i18n_source_hash: 0fdac8be0c98
i18n_provenance: human
i18n_output_hash: 89b068e77738
---

# Guía de traducción {#translation-guide}

SnapOtter incluye 21 idiomas de fábrica. El sistema i18n usa un runtime propio ligero con validación de integridad de locales por TypeScript y división dinámica de código.

## Idiomas admitidos {#supported-languages}

| Código | Idioma | Nombre nativo | Dirección |
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

1. **Preferencia del usuario**: almacenada en `localStorage("snapotter-locale")` y sincronizada con la configuración del usuario cuando hay sesión iniciada
2. **Detección automática del navegador**: recorre el array `navigator.languages` con coincidencia de prefijo BCP 47
3. **Predeterminado de la instancia**: la variable de entorno `DEFAULT_LOCALE` del administrador (obtenida de `GET /api/v1/config/locale`)
4. **Respaldo en inglés**: siempre disponible

Los usuarios pueden cambiar de idioma desde:
- El **selector de globo del pie de página** (escritorio, siempre visible)
- El selector de idioma de la **página de inicio de sesión** (antes de autenticarse)
- La sección **Configuración > General** (preferencia por usuario)
- El menú desplegable de idioma de la **barra lateral móvil**
- La sección **Configuración > Sistema** establece el predeterminado de toda la instancia (solo administradores)

## Cómo funcionan las traducciones {#how-translations-work}

Todas las cadenas de la interfaz viven en `packages/shared/src/i18n/`. El archivo de referencia es `en.ts`, que exporta un objeto tipado con cada cadena que usa la aplicación (~1500 claves). Los demás idiomas son archivos independientes (por ejemplo, `de.ts`, `fr.ts`) que exportan la misma forma.

El tipo `TranslationKeys` usa `DeepStringRecord` para aceptar cualquier valor de cadena mientras impone la estructura de claves. TypeScript detecta claves faltantes en cualquier archivo de traducción en tiempo de compilación.

En tiempo de ejecución solo se carga el locale activo mediante `import()` dinámico, lo que mantiene pequeño el bundle principal.

## Uso de traducciones en componentes {#using-translations-in-components}

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

Aceptamos con gusto PR de traducción directamente. Puedes mejorar un locale existente o añadir uno nuevo.

Para informar de una traducción incorrecta sin enviar código, abre un [GitHub Issue](https://github.com/snapotter-hq/SnapOtter/issues) con el idioma, la cadena incorrecta y la corrección sugerida.

::: tip 
Los PR de traducción no requieren aprobación previa. Bifurca el repositorio, haz tus cambios y abre un PR. Consulta la [Guía de contribución](/es/guide/contributing) para conocer el proceso completo de PR y el requisito del CLA.
:::

## Cómo crear o actualizar una traducción {#how-to-create-or-update-a-translation}

### 1. Bifurca y clona {#_1-fork-and-clone}

```bash
git clone https://github.com/<your-username>/snapotter.git
cd snapotter
pnpm install
```

### 2. Copia el archivo de referencia (solo para idiomas nuevos) {#_2-copy-the-reference-file-new-language-only}

Omite este paso si estás mejorando una traducción existente.

```bash
cp packages/shared/src/i18n/en.ts packages/shared/src/i18n/XX.ts
```

### 3. Traduce las cadenas {#_3-translate-the-strings}

Abre tu nuevo archivo y traduce cada valor de cadena. Mantén la estructura del objeto y las claves exactamente iguales.

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
- Mantén los marcadores de posición `{variable}` exactamente como están
- Los arrays (`rotatingPhrases`, `progressMessages`) deben tener el mismo número de entradas
- No traduzcas: SnapOtter, JPEG, PNG, WebP, EXIF, API ni otros términos técnicos

### 4. Registra el locale (solo para idiomas nuevos) {#_4-register-the-locale-new-language-only}

Añade tu locale a `SUPPORTED_LOCALES` en `packages/shared/src/i18n/index.ts`:

```ts
{ code: "xx", name: "Language Name", nativeName: "Native Name", dir: "ltr" },
```

### 5. Verifica {#_5-verify}

```bash
pnpm typecheck    # catches missing or mistyped keys
pnpm lint         # formatting check
pnpm dev          # manually verify strings appear correctly
```

### 6. Envía {#_6-submit}

Abre un PR contra `main` con un título como `feat(i18n): add Swedish translation` o `fix(i18n): correct German typos`. El bot del CLA te pedirá que firmes en tu primera contribución.

## Añadir nuevas claves de traducción {#adding-new-translation-keys}

Al añadir una nueva función que necesita nuevas cadenas de interfaz:

1. Añade primero las nuevas claves a `en.ts` (el archivo de referencia)
2. Ejecuta `pnpm typecheck`: cada archivo de locale fallará si le falta la nueva clave
3. Añade la nueva clave a todos los archivos de locale (usa el inglés como respaldo temporal)

## Configuración {#configuration}

Establece el idioma predeterminado de la instancia mediante una variable de entorno:

```yaml
DEFAULT_LOCALE: "de"  # German as the default for all new users
```

## Referencia de archivos {#file-reference}

| Archivo | Propósito |
|------|---------|
| `packages/shared/src/i18n/en.ts` | Cadenas en inglés (locale de referencia, ~1500 claves) |
| `packages/shared/src/i18n/index.ts` | `SUPPORTED_LOCALES`, `loadTranslations()`, exportaciones de tipos |
| `packages/shared/src/i18n/<locale>.ts` | Archivos de traducción por idioma |
| `apps/web/src/contexts/i18n-context.tsx` | `I18nProvider`, hook `useTranslation()` |
| `apps/web/src/lib/format.ts` | Helpers `format()`, `plural()`, `formatFileSize()` |
| `apps/api/src/routes/config.ts` | Endpoint público `GET /api/v1/config/locale` |

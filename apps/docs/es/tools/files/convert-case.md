---
description: "Cambia el texto a MAYÚSCULAS, minúsculas, tipo título, tipo oración y más."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 77b556f917ec
i18n_hash_version: 2
---

# Convertir mayúsculas y minúsculas {#convert-case}

Pega texto, elige un formato y copia el resultado. El texto va a tu propio servidor de SnapOtter y a ningún otro sitio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Acepta un cuerpo JSON, no datos de formulario multipart, y responde con el texto convertido en lugar de un archivo para descargar.

## Parámetros {#parameters}

| Nombre | Tipo | Predeterminado | Descripción |
|------|------|---------|-------------|
| `text` | string | (obligatorio) | Texto que convertir. Hasta 1.000.000 de caracteres. |
| `mode` | string | (obligatorio) | Uno de los modos de abajo. |
| `locale` | string | (ninguno) | Etiqueta de idioma BCP 47, como `tr` o `de`, para las letras cuya capitalización depende del idioma. Sin ella, la capitalización es la misma para todos los idiomas. |

| Modo | Entrada | Salida |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notas {#notes}

- `title` deja en minúscula las palabras cortas en inglés (a, an, and, of, the, to y similares), salvo que empiecen o terminen la línea. `capitalized` pone en mayúscula cada palabra.
- `sentence` empieza una oración nueva al principio del texto, después de un salto de línea y después de `.`, `!`, `?` o `…` seguido de un espacio, así que el punto en `snapotter.com` o `3.5` no cuenta.
- `camel`, `pascal`, `snake` y `kebab` dividen por espacios, signos de puntuación y cambios de mayúsculas existentes (`XMLHttpRequest` pasa a `xml_http_request`), y convierten cada línea por separado.
- Con `locale` establecido en `tr`, `i` pasa a mayúsculas como `İ` y `I` pasa a minúsculas como `ı`. La `ß` alemana pasa a mayúsculas como `SS` en cualquier configuración regional.
- La aplicación web envía su idioma de interfaz actual como `locale`.

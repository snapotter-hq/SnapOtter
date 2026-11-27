---
description: "Resuelve la regla de tres y halla X a partir de tres valores conocidos."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 4712c25d1ca4
i18n_hash_version: 2
---

# Calculadora de proporciones {#proportion-calculator}

Resuelve la regla de tres (multiplicación cruzada). Escribe tres valores, elige directa o inversa y obtén el cuarto. Los valores se quedan en el formulario después de cada respuesta, así que puedes cambiar un número y pulsar Intro para probar el siguiente.

Este es el solucionador matemático de proporciones, no la cuadrícula de la regla de los tercios para componer fotos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Acepta un cuerpo JSON, no datos de formulario multipart, y responde con un número en lugar de un archivo para descargar.

## Parámetros {#parameters}

| Nombre | Tipo | Predeterminado | Descripción |
|------|------|---------|-------------|
| `a` | number | (obligatorio) | Primer valor conocido. |
| `b` | number | (obligatorio) | El valor que va con `a`. |
| `c` | number | (obligatorio) | Tercer valor conocido. X es el valor que va con él. |
| `mode` | string | `direct` | `direct` o `inverse`. |

| Modo | Se lee | Fórmula | Ejemplo |
|------|----------|---------|---------|
| `direct` | A es a B como C es a X | X = B × C ÷ A | 3 manzanas cuestan 6, así que 10 manzanas cuestan 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 obreros tardan 6 días, así que 8 obreros tardan 3 días |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notas {#notes}

- La respuesta se redondea a 15 cifras significativas, por lo que `0.1 × 3 ÷ 3` devuelve `0.1` en lugar de `0.10000000000000002`.
- `a` no puede ser `0` en una proporción directa ni `c` puede ser `0` en una inversa, porque cada uno es el divisor. Ambos casos devuelven un 400.
- Una respuesta fuera del rango que admite un double (por encima de aproximadamente `1.8e308`, o tan cerca de cero que pierde precisión) devuelve un 400.
- En la aplicación web puedes escribir `1,5` o `1.5`, y también funcionan los dígitos arabigoíndicos o devanagari. No se aceptan separadores de millares.

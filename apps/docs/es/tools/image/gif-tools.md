---
description: "Redimensiona, optimiza, cambia la velocidad, invierte, gira y extrae fotogramas de GIF animados en una sola herramienta."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: ace1fecc82eb
---

# Herramientas de GIF {#gif-tools}

Redimensiona, optimiza, cambia la velocidad, invierte, extrae fotogramas y gira GIF animados. Ofrece varios modos de operación en una sola herramienta.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parámetros {#parameters}

### Parámetros comunes {#common-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"resize"` | Modo de operación: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | No | 0 | Número de repeticiones del GIF de salida (0 = infinito, 1-100 = repeticiones finitas) |

### Parámetros del modo Redimensionar {#resize-mode-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Ancho objetivo en píxeles (1 a 16384) |
| height | integer | No | - | Alto objetivo en píxeles (1 a 16384) |
| percentage | number | No | - | Escalar por porcentaje (1 a 500). Anula width/height si se define. |

### Parámetros del modo Optimizar {#optimize-mode-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| colors | number | No | 256 | Número máximo de colores en la paleta (2 a 256) |
| dither | number | No | 1.0 | Intensidad del difuminado (0 a 1, donde 0 desactiva el difuminado) |
| effort | number | No | 7 | Nivel de esfuerzo de optimización (1 a 10, mayor = más lento pero más pequeño) |

### Parámetros del modo Velocidad {#speed-mode-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| speedFactor | number | No | 1.0 | Multiplicador de velocidad (0.1 a 10). Los valores > 1 aceleran, < 1 ralentizan. |

### Parámetros del modo Extraer {#extract-mode-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| extractMode | string | No | `"single"` | Modo de extracción: `single`, `range`, `all` |
| frameNumber | number | No | 0 | Índice del fotograma a extraer en el modo `single` (basado en 0) |
| frameStart | number | No | 0 | Índice del fotograma inicial para el modo `range` (basado en 0) |
| frameEnd | number | No | - | Índice del fotograma final para el modo `range` (basado en 0, inclusive) |
| extractFormat | string | No | `"png"` | Formato de los fotogramas extraídos: `png`, `webp` |

### Parámetros del modo Girar {#rotate-mode-parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| angle | number | No | - | Ángulo de rotación: `90`, `180` o `270` grados |
| flipH | boolean | No | `false` | Voltear horizontalmente |
| flipV | boolean | No | `false` | Voltear verticalmente |

## Ejemplos de solicitud {#example-requests}

### Redimensionar {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimizar {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Acelerar {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extraer un solo fotograma {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Subruta de información {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Devuelve metadatos sobre un GIF animado sin procesarlo.

### Solicitud de información {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Respuesta de información {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notas {#notes}

- Usa la fábrica estándar `createToolRoute` para el endpoint de procesamiento principal.
- El endpoint de información solo requiere subir un archivo (no se necesita configuración).
- En el modo `resize`, si se proporciona `percentage` tiene prioridad sobre `width`/`height`. El redimensionado usa `fit: inside` para mantener la relación de aspecto.
- En el modo `speed`, los retardos de los fotogramas se dividen por el factor de velocidad. El retardo mínimo por fotograma es de 20 ms (limitación de la especificación GIF).
- En el modo `reverse`, el parámetro `speedFactor` también está disponible para ajustar simultáneamente la velocidad mientras se invierte.
- En el modo `extract` con `range` o `all`, la salida es un archivo ZIP que contiene fotogramas individuales.
- En el modo `rotate`, cada fotograma se procesa individualmente y se vuelve a ensamblar en una animación.
- El parámetro `loop` controla cuántas veces se repite el GIF de salida. Usa 0 para repetición infinita.
- El campo `duration` de la respuesta de información es la duración total de la animación en milisegundos.

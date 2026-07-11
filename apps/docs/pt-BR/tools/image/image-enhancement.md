---
description: "Aprimoramento automático de um clique que analisa uma imagem e corrige exposição, contraste, balanço de branco, saturação e nitidez."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: bb80682efdc4
---

# Aprimoramento de Imagem {#image-enhancement}

Melhoria automática de um clique com análise inteligente. Analisa a imagem e aplica correções de exposição, contraste, balanço de branco, saturação, nitidez e redução de ruído.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Processamento:** Síncrono (usa a fábrica `createToolRoute`, retorna o resultado diretamente)

**Pacote de modelo:** Nenhum necessário para o aprimoramento básico. O pacote `upscale-enhance` (5-6 GB) é usado apenas quando `deepEnhance` está ativado (para remoção de ruído por IA via SCUNet).

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| mode | string | Não | `"auto"` | Modo de aprimoramento: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Não | `50` | Intensidade geral do aprimoramento (0-100) |
| corrections | object | Não | todas `true` | Correções seletivas a aplicar (veja abaixo) |
| deepEnhance | boolean | Não | `false` | Ativa a remoção de ruído com IA (requer a ferramenta `noise-removal` instalada) |

### Objeto de Correções {#corrections-object}

| Campo | Tipo | Padrão | Descrição |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Correção automática de exposição |
| contrast | boolean | `true` | Correção automática de contraste |
| whiteBalance | boolean | `true` | Correção automática de balanço de branco |
| saturation | boolean | `true` | Correção automática de saturação |
| sharpness | boolean | `true` | Nitidez automática |
| denoise | boolean | `true` | Redução leve de ruído |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Resposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Endpoint de Análise {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analisa uma imagem e retorna recomendações de correção sem aplicá-las.

### Parâmetros {#parameters-1}

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|----------|-------------|
| file | file | Sim | Arquivo de imagem (multipart) |

### Exemplo de Requisição {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Resposta (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Observações {#notes}

- Esta ferramenta usa a fábrica síncrona `createToolRoute`, então retorna uma resposta padrão (não 202 assíncrona).
- O parâmetro `mode` ajusta como as correções são ponderadas (por exemplo, o modo retrato é mais suave com tons de pele, o modo paisagem aumenta a saturação).
- Quando `deepEnhance` está ativado e a ferramenta `noise-removal` (SCUNet) está instalada, uma passagem adicional de redução de ruído por IA é aplicada após as correções padrão.
- O endpoint de análise é útil para pré-visualizar quais correções seriam aplicadas antes de confirmar.
- Suporta formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.

---
description: "Repare arranhões, rasgos e danos em fotos antigas com um pipeline de IA para restauração, aprimoramento de rosto e cor."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 51bfb0f6c87b
---

# Restauração de Fotos {#photo-restoration}

Corrija arranhões, rasgos e danos em fotos antigas usando um pipeline de IA de múltiplas etapas. Combina reparo de arranhões, aprimoramento de rosto, remoção de ruído e colorização opcional.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para status via SSE)

**Pacote de modelo:** `photo-restoration` (4-5 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| scratchRemoval | boolean | Não | `true` | Remover arranhões e danos de superfície |
| faceEnhancement | boolean | Não | `true` | Aprimorar rostos na foto restaurada |
| fidelity | number | Não | `0.7` | Fidelidade do aprimoramento de rosto (0-1). Valores mais altos preservam mais as características originais |
| denoise | boolean | Não | `true` | Aplicar remoção de ruído ao resultado restaurado |
| denoiseStrength | number | Não | `25` | Intensidade da remoção de ruído (0-100) |
| colorize | boolean | Não | `false` | Colorizar a foto restaurada (para imagens em tons de cinza) |
| colorizeStrength | number | Não | `85` | Intensidade da colorização (0-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## Resposta {#response}

### Resposta Inicial (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progresso (SSE em `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notas {#notes}

- Requer que o pacote de modelo `photo-restoration` esteja instalado (4-5 GB).
- O pipeline executa várias etapas de IA sequencialmente: reparo de arranhões, aprimoramento de rosto (GFPGAN), remoção de ruído e, opcionalmente, colorização.
- O array `steps` no resultado mostra quais etapas de processamento foram de fato executadas.
- `scratchCoverage` é uma porcentagem estimada da área da imagem que tinha danos de arranhão.
- `fidelity` controla o quão fortemente os rostos são aprimorados em relação à preservação da aparência original. Valores mais baixos produzem aprimoramento mais agressivo; valores mais altos são mais conservadores.
- A opção `colorize` detecta automaticamente se a imagem está em tons de cinza. O sinalizador `isGrayscale` no resultado confirma essa detecção.
- O formato de saída corresponde automaticamente ao formato de entrada.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR, HDR e AVIF via decodificação automática.

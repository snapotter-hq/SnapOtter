---
description: "Detecte e desfoque rostos em imagens automaticamente com detecção de rostos por IA para privacidade e anonimização em conformidade com o GDPR."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 62a67ea12e80
---

# Desfoque de Rosto / PII {#face-pii-blur}

Detecte e desfoque rostos em imagens automaticamente usando detecção de rostos por IA (MediaPipe).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para o status via SSE)

**Pacote de modelo:** `face-detection` (200-300 MB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| blurRadius | number | Não | `30` | Raio de desfoque aplicado aos rostos detectados (1-100) |
| sensitivity | number | Não | `0.5` | Sensibilidade da detecção de rostos (0-1). Valores mais baixos detectam menos rostos com maior confiança |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Nenhum Rosto Detectado {#no-faces-detected}

Se nenhum rosto for encontrado, o resultado inclui um aviso:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Observações {#notes}

- Requer que o pacote de modelo `face-detection` esteja instalado (200-300 MB).
- O formato de saída corresponde automaticamente ao formato de entrada.
- O array `faces` contém as coordenadas da caixa delimitadora (x, y, largura, altura) para cada rosto detectado.
- Aumente `sensitivity` (mais próximo de 1.0) para detectar mais rostos, incluindo os parcialmente ocultos.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR por meio de decodificação automática.

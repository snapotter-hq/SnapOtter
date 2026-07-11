---
description: "Ajusta brilho, contraste, saturação e gama de um vídeo."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 51a76e6634a6
---

# Video Color {#video-color}

Ajusta o brilho, contraste, saturação e correção de gama em um vídeo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| brightness | number | Não | `0` | Ajuste de brilho (-1 a 1) |
| contrast | number | Não | `1` | Multiplicador de contraste (0-4) |
| saturation | number | Não | `1` | Multiplicador de saturação (0-3). Defina como 0 para escala de cinza |
| gamma | number | Não | `1` | Correção de gama (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Todos os valores nos seus padrões (brilho 0, contraste 1, saturação 1, gama 1) não produzem nenhuma alteração.
- Definir a saturação como `0` converte o vídeo para escala de cinza.
- Valores de gama abaixo de 1 clareiam as sombras, enquanto valores acima de 1 as escurecem.

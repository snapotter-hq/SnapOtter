---
description: "Gire imagens em qualquer ângulo e espelhe na horizontal ou na vertical."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 064aa90129d1
---

# Girar e Espelhar {#rotate-flip}

Gire imagens em um ângulo arbitrário e/ou espelhe-as na horizontal ou na vertical. As operações de rotação e espelhamento podem ser combinadas em uma única requisição.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| angle | number | Não | `0` | Ângulo de rotação em graus (sentido horário). Aceita qualquer valor numérico. |
| horizontal | boolean | Não | `false` | Espelhar a imagem na horizontal (espelho) |
| vertical | boolean | Não | `false` | Espelhar a imagem na vertical |

## Exemplo de Requisição {#example-request}

Girar 90 graus no sentido horário:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Espelhar na horizontal:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Girar e espelhar juntos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notas {#notes}

- A rotação é aplicada primeiro, depois as operações de espelhamento.
- Rotações que não são de 90 graus (por exemplo, 45 graus) ampliarão a tela para acomodar a imagem girada, com preenchimento transparente ou preto dependendo do formato de saída.
- Valores comuns: 90, 180, 270 para rotações de um quarto de volta.
- A orientação EXIF é aplicada automaticamente antes do processamento, então a rotação é relativa à orientação visual.

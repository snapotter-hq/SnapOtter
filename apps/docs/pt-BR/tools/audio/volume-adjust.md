---
description: "Aumente ou diminua o volume do áudio por um ganho fixo em decibéis."
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: 8d205884bf96
---

# Ajustar Volume {#volume-adjust}

Aumente ou diminua o volume de um arquivo de áudio aplicando um ganho fixo em decibéis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| gainDb | number | Não | `3` | Ajuste de volume em decibéis (-30 a 30) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notas {#notes}

- Valores positivos aumentam o volume; valores negativos o diminuem.
- Ganhos positivos grandes podem causar clipping. Use normalize-audio para nivelamento de volume seguro.
- A saída geralmente mantém o contêiner de entrada. Entradas AAC são gravadas como M4A, e entradas somente de decodificação sem suporte recorrem a MP3.

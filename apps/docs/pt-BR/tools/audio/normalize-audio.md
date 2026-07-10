---
description: "Nivele o volume para níveis padrão de broadcast (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 3cd9c4ebc050
---

# Normalizar Áudio {#normalize-audio}

Nivele o volume do áudio para níveis padrão de broadcast usando a normalização EBU R128 (-16 LUFS).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Ela aplica a normalização de volume EBU R128 automaticamente.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Usa o padrão de volume EBU R128, com alvo de -16 LUFS.
- Ideal para podcasts, audiolivros e conteúdo de broadcast, onde o volume consistente é importante.
- A taxa de amostragem de origem é preservada na saída.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.

---
description: "Inverta um arquivo de áudio para que ele toque de trás para frente."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: ece184fd1685
---

# Inverter Áudio {#reverse-audio}

Inverta um arquivo de áudio para que ele toque de trás para frente.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. O arquivo de áudio inteiro é invertido.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
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

- A trilha de áudio completa é invertida do fim para o início.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.

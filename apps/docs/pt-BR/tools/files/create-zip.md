---
description: "Agrupe vários arquivos em um único arquivo ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: 4cd215cde1e5
---

# Criar ZIP {#create-zip}

Agrupe vários arquivos de qualquer tipo em um único arquivo ZIP. Nomes de arquivo duplicados são automaticamente diferenciados.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Aceita dados de formulário multipart com dois ou mais arquivos. Nenhum campo de configurações é necessário.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie de 2 a 50 arquivos de qualquer tipo para agrupar.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notas {#notes}

- Requer entre 2 e 50 arquivos de entrada.
- Qualquer tipo de arquivo é aceito; não há restrições quanto ao formato de entrada.
- Se vários arquivos compartilharem o mesmo nome, eles são automaticamente diferenciados com sufixos numéricos.
- O arquivo de saída usa compressão ZIP padrão (deflate).

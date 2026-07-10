---
description: "Convierte entre los formatos de presentación de PowerPoint y OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: bf2d2ba53a44
---

# Convertir presentación {#convert-presentation}

Convierte presentaciones entre los formatos PowerPoint (PPTX) y OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Acepta datos de formulario multipart con un archivo PowerPoint/ODP y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | Sí | - | Formato de salida: `pptx`, `odp` |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Ejemplo de respuesta {#example-response}

Devuelve `202 Accepted`. Sigue el progreso mediante SSE en `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceptados: `.pptx`, `.ppt`, `.odp`.
- La conversión la gestiona LibreOffice ejecutándose sin interfaz gráfica en el servidor.
- Es posible que las animaciones y los efectos de transición no se conserven entre formatos.
- El formato de salida debe ser distinto del formato de entrada.

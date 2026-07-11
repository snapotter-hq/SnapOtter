---
description: "Штампування завантажених зображень підписів на PDF за допомогою нормалізованих розміщень на сторінці."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 5e1f1f1f28f6
---

# Sign PDF {#sign-pdf}

Штампуйте одне або кілька завантажених зображень підписів PNG на будь-яку сторінку PDF. Цей маршрут використовує власний багаточастинний (multipart) контракт, оскільки йому потрібні PDF, одне або кілька зображень підписів та координати розміщення.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Приймає багаточастинні (multipart) дані форми. PDF надсилається як `file`; підписи надсилаються як `sig0`, `sig1` і так далі; розміщення надсилаються в полі JSON `placements`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Файл PDF для підписання |
| sig0 | file | Yes | - | Перше зображення підпису. Додаткові зображення використовують `sig1`, `sig2` і так далі |
| placements | JSON string | Yes | - | Масив об'єктів розміщення: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | Необов'язковий UUID для відстеження перебігу через SSE |
| fileId | string | No | - | Необов'язковий ID бібліотеки файлів для збереження підписаного результату як нової версії |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | Індекс зображення підпису. `0` відображається на `sig0` |
| page | integer | Індекс сторінки PDF, що починається з нуля |
| x | number | Позиція зліва як частка сторінки |
| y | number | Позиція зверху як частка сторінки |
| w | number | Ширина підпису як частка сторінки |
| h | number | Висота підпису як частка сторінки |

Координати використовують початок відліку у верхньому лівому куті. Значення можуть дещо виходити за край сторінки; рендерер PDF обрізає підсумковий штамп до розміру сторінки.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Якщо запит не може завершитися в межах синхронного вікна очікування, API повертає:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Підключіться до `/api/v1/jobs/<jobId>/progress` та завантажте результат, коли завдання завершиться.

## Notes {#notes}

- Прийнятний формат вхідного PDF: `.pdf`.
- Зображення підписів мають бути дійсними файлами зображень, зазвичай PNG з прозорістю.
- Приймається до 100 зображень підписів та 100 розміщень.
- `sign-pdf` є власним маршрутом і не використовує стандартне поле JSON `settings` інструмента.

---
description: "Зміна розміру методом швів, що додає або видаляє пікселі вздовж малозначущих шляхів для збереження ключового вмісту та облич."
i18n_source_hash: 16ea4c2778e1
i18n_provenance: human
i18n_output_hash: eebd0546d5d1
---

# Content-Aware Resize {#content-aware-resize}

Зміна розміру методом швів, що інтелектуально видаляє або додає пікселі вздовж шляхів найменшої візуальної значущості, зберігаючи важливий вміст і за бажанням захищаючи обличчя.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Processing:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` для отримання статусу через SSE)

**Model bundle:** Не потрібен для базової роботи. Захист облич використовує пакет `face-detection` (200-300 MB), якщо увімкнено.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Файл зображення (multipart) |
| width | number | No | - | Цільова ширина в пікселях |
| height | number | No | - | Цільова висота в пікселях |
| protectFaces | boolean | No | `false` | Виявляти та захищати обличчя від видалення швів |
| blurRadius | number | No | `4` | Радіус попереднього розмиття для розрахунку енергії (0-20) |
| sobelThreshold | number | No | `2` | Поріг виявлення країв за методом Собеля (1-20). Вищі значення роблять алгоритм агресивнішим |
| square | boolean | No | `false` | Змінити розмір до квадрата (використовує меншу сторону) |

Потрібно вказати принаймні один із `width`, `height` або `square`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## Notes {#notes}

- Використовує бібліотеку швів `caire` для зміни розміру з урахуванням вмісту.
- Лише зменшує розміри (видаляє шви). Не може розширити зображення понад його оригінальний розмір.
- Параметр `protectFaces` використовує AI-виявлення облич, щоб позначити області облич як високоенергетичні, запобігаючи проходженню швів через обличчя.
- `blurRadius` керує згладжуванням перед розрахунком мапи енергії. Вищі значення роблять мапу енергії одноріднішою, що може допомогти із зашумленими зображеннями.
- `sobelThreshold` впливає на те, наскільки агресивно виявляються краї. Нижчі значення зберігають більше тонких країв.
- Вивід завжди у форматі PNG.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.

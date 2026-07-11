---
description: "Зміна розміру методом швів, що додає або видаляє пікселі вздовж малозначущих шляхів для збереження ключового вмісту та облич."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 69e88590877c
---

# Content-Aware Resize {#content-aware-resize}

Зміна розміру методом швів, що інтелектуально видаляє або додає пікселі вздовж шляхів найменшої візуальної значущості, зберігаючи важливий вміст і за бажанням захищаючи обличчя.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Processing:** Синхронна (повертає результат напряму)

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

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- Цей власний маршрут наразі повертає синхронну відповідь 200.
- Використовує бібліотеку швів `caire` для зміни розміру з урахуванням вмісту.
- Лише зменшує розміри (видаляє шви). Не може розширити зображення понад його оригінальний розмір.
- Параметр `protectFaces` використовує AI-виявлення облич, щоб позначити області облич як високоенергетичні, запобігаючи проходженню швів через обличчя.
- `blurRadius` керує згладжуванням перед розрахунком мапи енергії. Вищі значення роблять мапу енергії одноріднішою, що може допомогти із зашумленими зображеннями.
- `sobelThreshold` впливає на те, наскільки агресивно виявляються краї. Нижчі значення зберігають більше тонких країв.
- Вивід завжди у форматі PNG.
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.

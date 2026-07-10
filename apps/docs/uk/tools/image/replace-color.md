---
description: "Замініть певний колір у зображенні іншим кольором або зробіть його прозорим."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 0ba93b0b0b14
---

# Заміна та інверсія кольору {#replace-invert-color}

Замінюйте пікселі, що відповідають вихідному кольору, цільовим кольором або робіть їх прозорими. Використовує евклідову відстань у просторі RGB із налаштовуваним допуском для плавного змішування на межах кольорів.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Приймає дані форми multipart із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Ні | `"#FF0000"` | Hex-колір для пошуку (формат: `#RRGGBB`) |
| targetColor | string | Ні | `"#00FF00"` | Hex-колір для заміни (формат: `#RRGGBB`) |
| makeTransparent | boolean | Ні | `false` | Зробити відповідні пікселі прозорими замість заміни цільовим кольором |
| tolerance | number | Ні | `30` | Допуск відповідності кольору (від 0 до 255). Вищі значення відповідають ширшому діапазону схожих кольорів |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Зробити зелений фон прозорим:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Примітки {#notes}

- Відповідність кольору використовує евклідову відстань у просторі RGB, масштабовану за `tolerance * sqrt(3)`.
- Змішування заміни пропорційне відстані кольору: пікселі, ближчі до вихідного кольору, отримують більше цільового кольору, створюючи плавні переходи.
- Коли `makeTransparent` дорівнює `true`, вихідне зображення примусово встановлюється у PNG (або WebP/AVIF), якщо вхідний формат не підтримує альфа-канали (наприклад, JPEG).
- Допуск 0 відповідає лише точному вихідному кольору. Вищі значення (50+) відповідатимуть ширшому діапазону схожих відтінків.
- Вихідний формат збігається з вхідним, якщо не потрібна прозорість і вхідний формат не має підтримки альфа-каналу.

---
description: "Обрізка з урахуванням об’єкта, обличчя та ентропії, що інтелектуально кадрує зображення за допомогою Sharp та розпізнавання облич ШІ."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: e230987207b9
---

# Розумна обрізка {#smart-crop}

Розумна обрізка з урахуванням об’єкта, обличчя або на основі обтинання. Використовує стратегії уваги/ентропії Sharp та розпізнавання облич ШІ для інтелектуального кадрування.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` щодо стану через SSE)

**Пакет моделі:** `face-detection` (200-300 МБ) - потрібен лише для режиму `face`

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (багаточастинний) |
| mode | string | Ні | `"subject"` | Режим обрізки: `subject`, `face`, `trim`. (Застарілі значення `attention` та `content` відображаються на `subject` та `trim`) |
| strategy | string | Ні | `"attention"` | Стратегія для режиму об’єкта: `attention` або `entropy` |
| width | integer | Ні | - | Цільова ширина у пікселях |
| height | integer | Ні | - | Цільова висота у пікселях |
| padding | integer | Ні | `0` | Відсоток відступу навколо об’єкта (0-50) |
| facePreset | string | Ні | `"head-shoulders"` | Пресет кадрування обличчя: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Ні | `0.5` | Чутливість розпізнавання облич (0-1) |
| threshold | integer | Ні | `30` | Поріг режиму обтинання для розпізнавання фону (0-255) |
| padToSquare | boolean | Ні | `false` | Доповнити обтятий результат до квадрата |
| padColor | string | Ні | `"#ffffff"` | Колір фону для доповнення |
| targetSize | integer | Ні | - | Цільовий розмір для доповненого виводу (пікселі) |
| quality | integer | Ні | - | Якість виводу (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогрес (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Режими {#modes}

### Режим об’єкта {#subject-mode}
Використовує стратегію уваги або ентропії Sharp, щоб знайти найбільш візуально цікаву ділянку, і обрізає навколо неї.

### Режим обличчя {#face-mode}
Розпізнає обличчя за допомогою ШІ, а потім кадрує обрізку навколо виявлених облич, використовуючи вказаний `facePreset`. Повертається до режиму об’єкта (стратегія уваги), якщо обличчя не виявлено.

### Режим обтинання {#trim-mode}
Видаляє однорідні межі/фон із зображення. За бажанням доповнює результат до квадрата з указаним кольором фону та цільовим розміром.

## Примітки {#notes}

- Цей інструмент використовує фабрику `createToolRoute` з `executionHint: "long"`, тому повертає 202 із прогресом SSE.
- Режим обличчя потребує пакета моделі `face-detection` (200-300 МБ).
- Режими об’єкта та обтинання працюють без жодного пакета моделі ШІ.
- `facePreset` визначає, наскільки щільно обрізка кадрує виявлені обличчя: `closeup` — найщільніший, `half-body` — найширший.
- Якщо ширину/висоту не вказано, за замовчуванням береться 1080x1080.

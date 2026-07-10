---
description: "音声ファイルから波形の可視化を PNG 画像として生成します。"
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: dbadcf883796
---

# Waveform Image {#waveform-image}

音声ファイルから波形の可視化を PNG 画像として生成します。寸法と色を設定できます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

音声ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | 画像の幅（ピクセル、256 から 3840） |
| height | integer | No | `256` | 画像の高さ（ピクセル、64 から 1080） |
| color | string | No | `"#4f46e5"` | 波形の 16 進カラー（例: `"#4f46e5"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- 入力の音声形式にかかわらず、出力は常に PNG 画像です。
- 波形は透明な背景の上に描画されます。
- サムネイル、ソーシャルメディアのプレビュー、Web ページへの埋め込みに便利です。

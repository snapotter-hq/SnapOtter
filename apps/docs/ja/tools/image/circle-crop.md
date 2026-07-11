---
description: "画像を中央揃えの円形に切り抜き、四隅を透明にします。"
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: fc42eb0f3f5b
---

# Circle Crop {#circle-crop}

画像を中央揃えの円形に切り抜き、四隅を透明にします。ズーム、オフセット、ボーダー、出力サイズを調整できます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | ズーム係数 (1 ～ 5)。値が大きいほど切り抜きが狭くなります |
| offsetX | number | No | `0.5` | 中心の水平位置 (0 ～ 1) |
| offsetY | number | No | `0.5` | 中心の垂直位置 (0 ～ 1) |
| borderWidth | integer | No | `0` | ボーダーの幅 (ピクセル) (0 ～ 200) |
| borderColor | string | No | `"#ffffff"` | ボーダーの 16 進カラー |
| background | string | No | `"transparent"` | 四隅の塗りつぶし: `"transparent"` または 16 進カラー |
| outputSize | integer | No | - | 最終的な正方形のサイズ (ピクセル) (16 ～ 4096) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- 透明な四隅を保持するため、出力は常に PNG です (`background` が単色に設定されている場合を除く)。
- 円は画像の短い辺の内側に収まります。より狭く切り抜くには `zoom` を、表示領域をずらすには `offsetX`/`offsetY` を使用してください。
- `outputSize` を指定すると、切り抜き後にその正方形のサイズにリサイズされます。
- HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。

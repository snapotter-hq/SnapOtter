---
description: "強度、色、位置を調整できるビネット効果を追加します。"
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: a094923210a6
---

# Vignette {#vignette}

画像の縁を暗くしたり色付けしたりするビネット効果を追加します。強度、色、半径、柔らかさ、丸み、中心位置を調整できます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | ビネットの不透明度（0.1〜1） |
| color | string | No | `"#000000"` | ビネットの16進カラー |
| radius | integer | No | `70` | 半対角線に対する外側半径の割合（0〜100） |
| softness | integer | No | `50` | フェザーの柔らかさ（0〜100）。値が高いほどより緩やかにフェードします |
| roundness | integer | No | `100` | 形状: 100 = 円、0 = 画像のアスペクト比に合わせた楕円 |
| centerX | integer | No | `50` | 水平方向の中心位置の割合（0〜100） |
| centerY | integer | No | `50` | 垂直方向の中心位置の割合（0〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- `radius`を小さくすると画像のより広い範囲が暗くなり、大きくするとビネットが最も外側の縁に限定されます。
- 創造的なビネット効果には、黒以外の`color`（例: 白やセピア調）を使用してください。
- `centerX`と`centerY`を調整すると、クリアな領域を中心からずらして配置できます。フレームの中央にない被写体に注目を集めたい場合に便利です。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVGの入力は処理前に自動的にデコードされます。

---
description: "アダプティブ、アンシャープマスク、ハイパスの各手法で画像をシャープ化し、オプションでノイズ低減も行います。"
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: d5113ae4e40c
---

# 画像をシャープに {#sharpening}

3つの手法を備えた高度なシャープ化ツールです。アダプティブ（スマートなエッジ認識）、アンシャープマスク（従来のradius/amount指定）、ハイパス（テクスチャ強調）に対応します。シャープ化によるアーティファクトを防ぐノイズ低減機能を内蔵しています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | シャープ化アルゴリズム: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | アダプティブ: ガウシアンのsigma（0.5〜10） |
| m1 | number | No | `1.0` | アダプティブ: 平坦領域のシャープ化（0〜10） |
| m2 | number | No | `3.0` | アダプティブ: ギザギザ領域のシャープ化（0〜20） |
| x1 | number | No | `2.0` | アダプティブ: 平坦/ギザギザのしきい値（0〜10） |
| y2 | number | No | `12` | アダプティブ: 平坦領域の最大シャープ化（0〜50） |
| y3 | number | No | `20` | アダプティブ: ギザギザ領域の最大シャープ化（0〜50） |
| amount | number | No | `100` | アンシャープマスク: シャープ化の強さ（0〜1000） |
| radius | number | No | `1.0` | アンシャープマスク: ぼかし半径（ピクセル、0.1〜5） |
| threshold | number | No | `0` | アンシャープマスク: シャープ化する最小の明度差（0〜255） |
| strength | number | No | `50` | ハイパス: フィルター強度（0〜100） |
| kernelSize | number | No | `3` | ハイパス: 畳み込みカーネルサイズ（3または5） |
| denoise | string | No | `"off"` | シャープ化前のノイズ低減: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

しきい値を指定したアンシャープマスクで滑らかな領域を保護する例:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- 選択した手法に関連するパラメータだけが使用されます。たとえば`method`が`adaptive`の場合、`amount`、`radius`、`threshold`は無視されます。
- アダプティブ手法は、平坦/ギザギザ領域の挙動を設定できるSharp組み込みのアダプティブシャープ化を使用します。
- `denoise`オプションは、ノイズや粒状感の増幅を防ぐために、シャープ化の前にノイズ低減を適用します。
- ハイパスシャープ化は、元画像からぼかしたものを差し引いて細部を抽出し、それをブレンドし直すことで細かなディテールを取り出します。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVGの入力は処理前に自動的にデコードされます。

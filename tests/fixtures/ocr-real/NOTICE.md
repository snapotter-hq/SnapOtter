# OCR fixture notices

These fixtures are redistributed only for local OCR regression testing. `manifest.json` pins each
source revision, exact source Parquet shard or original-file identity, image/annotation hashes,
privacy review, and all transformations. The image bytes are unmodified. Annotation records were
extracted or manually transcribed into canonical JSON, and the UTF-8 text files contain annotation
strings joined with LF as described in the manifest. No upstream author or organization endorses
SnapOtter.

## JaWildText

`jawildtext-board-0001`, `jawildtext-board-0049`, `jawildtext-board-0127`, and
`jawildtext-receipt-11120` come from **JaWildText: A
Benchmark for Vision-Language Models on Japanese Scene Text Understanding** by Koki Maeda and
Naoaki Okazaki (LLM-jp), pinned at Hugging Face revision
`627ca7ea7c224ffe1accff8737991fc2240784fa`.

The three board images form one frozen Fast release cohort. They come from distinct Parquet row
groups and cover a dense colored product placard, a mildly skewed monochrome public notice, and a
wide museum display with glare. Every board must independently meet the pre-existing Fast recall,
precision, and F1 floors; aggregate performance cannot hide a failed image.

- Source: <https://huggingface.co/datasets/llm-jp/jawildtext/tree/627ca7ea7c224ffe1accff8737991fc2240784fa>
- License: Apache License 2.0; the pinned dataset card explicitly applies it to images and
  annotations/metadata.
- License text: `licenses/apache-2.0.txt`
- Changes: no pixel changes; annotation extraction and LF-delimited transcription only.

Visible business names, logos, and public-agency marks remain the property of their respective
owners. Apache-2.0 does not grant trademark rights or imply endorsement.

## Wikimedia Commons — Hagye station sign

`commons-hagye-station-715` is the original `Hagye01.jpg` photograph by Wikimedia Commons user
Marcopolis, file page ID 7592246, timestamped `2009-08-18T13:00:50Z`. The file page is pinned at
revision `1234274506`; its original bytes are identified by SHA-1
`fd1f0cc88f931af22576c7404270837916c60d8d` and SHA-256
`a9ae819505be17d87393695bdadd1aaff47b0a8b81faec98b38408397942b3dc`.

The photograph forms the frozen Korean scene-text release cohort. Before any OCR output was
observed, eligible original bitmaps in the Wikimedia Commons category for Seoul Subway Line 7
station signs were sorted by byte size. Public-domain landscape photographs at least 500×400 with
no people or private data and manually legible Hangul, Latin, and Arabic digits were retained;
`Hagye01.jpg` was the smallest eligible file.

- Frozen file page and public-domain declaration: <https://commons.wikimedia.org/w/index.php?title=File:Hagye01.jpg&oldid=1234274506>
- Frozen PD-user-en evidence: <https://commons.wikimedia.org/w/index.php?title=Template:PD-user-en&oldid=358311026>
- Original file: <https://upload.wikimedia.org/wikipedia/commons/c/cb/Hagye01.jpg>
- License: dedicated to the public domain by the author via PD-user-en.
- Changes: no pixel changes; manual visual-order transcription and one terminal LF only. No OCR
  was used to create the transcript.

## CORD v2

`cord-v2-test-0080` comes from **CORD: A Consolidated Receipt Dataset for Post-OCR Parsing** by
Seunghyun Park, Seung Shin, Bado Lee, Junyeop Lee, Jaeheung Surh, Minjoon Seo, and Hwalsuk Lee
(NAVER Clova), test image ID 80, pinned at Hugging Face revision
`7f0115a4b758a71d6473b8d085751692da2fef98`.

- Source: <https://huggingface.co/datasets/naver-clova-ix/cord-v2/tree/7f0115a4b758a71d6473b8d085751692da2fef98>
- Project and attribution: <https://github.com/clovaai/cord/tree/327310ce58c1623255821d062b3a759ff3789e3c>
- License: Creative Commons Attribution 4.0 International.
- License text: `licenses/cc-by-4.0.txt`
- Changes: no pixel changes; the original annotation string is preserved, parsed into canonical
  JSON, and its word strings are emitted LF-delimited.

The identifying header was already blurred in the upstream image; SnapOtter did not perform that
alteration.

## ClinOCR-Bench

`clinocr-poor-t7-s2` comes from **ClinOCR-Bench: A Comprehensive Clinical Scanned Document Dataset
for Optical Character Recognition Model Evaluation** by Enshuo Hsu, Jin Zhou, and Kirk Roberts,
document `poor_t7_s2`, pinned at Hugging Face revision
`cb7c0c48a4f3d1c9054fb6548ccef84768983472`.

- Source: <https://huggingface.co/datasets/ClinOCR-Bench/ClinOCR-Bench/tree/cb7c0c48a4f3d1c9054fb6548ccef84768983472>
- Project: <https://github.com/ClinOCR-Bench/ClinOCR-Bench/tree/3b720a951bb7eec4a4f4fb34a636e7335a19981e>
- License: MIT, copyright 2026 ClinOCR-Bench.
- License text: `licenses/mit-clinocr-bench.txt`
- Changes: no pixel changes; canonical JSON extraction and one terminal LF added to the verbatim
  human-audited transcript.

ClinOCR-Bench describes its data as synthetic and protected-health-information-free. Names,
addresses, identifiers, and clinical details visible in this sample are fictional.

## Deliberately excluded

No TextOCR image is redistributed. TextOCR labels its dataset CC-BY-4.0, but its images come from
Open Images. Open Images states that it makes no warranty about each image's license and requires
users to verify the original image license themselves. We did not include a TextOCR sample without
that image-level chain-of-title verification.

- TextOCR: <https://textvqa.org/textocr/dataset/>
- Open Images licensing notice: <https://github.com/openimages/dataset/blob/master/READMEV3.md>

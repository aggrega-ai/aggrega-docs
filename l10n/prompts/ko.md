# 한국어

Translate into Korean. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- The formal polite 합니다 style throughout, technical and plain, with no emphasis the source does not have.
- Do not address the reader as "당신"; leave the subject out where Korean reads better without it.
- Use the terms established in Korean software documentation (구성, 컴파일러, 플러그인).

## Quotation marks

- A quoted phrase takes “이렇게”, and a quotation inside it takes ‘이렇게’.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never written in hangul. A particle after a kept term follows its English pronunciation: Component를, Release를, Aggregate는.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: 사회 계약.
- `best practice`: 모범 사례; never "규칙" or "필수".
- `escape hatch`: 탈출구; never "허점", which reads as a loophole, nor "뒷문", which reads as a back door.
- `convention`: 관례; never "규칙" or "규약", which read as rules that are enforced.
- `unopinionated`: 주관이 없는; "mathematically unopinionated" is "수학적으로 주관이 없는".
- `content-neutral`: 내용에 중립적인.
- `agnostic to`: ~에 구애받지 않는, as in "관례에 구애받지 않는다".

## Recurring terms

- manifest, the ordinary word the source writes in lowercase (a Kubernetes manifest, an OCI manifest): 매니페스트; never "manifest" left in Latin letters.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

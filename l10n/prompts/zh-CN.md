# 简体中文

Translate into Simplified Chinese, as written in mainland China. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Chinese software documentation is written: precise and concise, with no emphasis the source does not have.
- Address the reader as "你" wherever the English says "you"; leave the subject out where Chinese reads better without it.
- Use the terms established in mainland Chinese software writing (配置, 编译器, 插件), never those particular to Taiwan or Hong Kong.

## Quotation marks

- A quoted phrase takes full-width quotation marks, “这样”, and a quotation inside it takes ‘这样’.
- Chinese text takes full-width punctuation (，。：；？！); inline code, a URL and an English term keep their own punctuation.
- Put a space between Chinese characters and a Latin-letter term or a number: 使用 Component 声明, 共 3 个.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never transliterated: 一个 Component, 该 Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: 社会契约.
- `best practice`: 最佳实践; never "规则" or "要求".
- `escape hatch`: 逃生舱口; never "后门", which reads as a back door, nor "漏洞", which reads as a loophole.
- `convention`: 约定; never "规则" or "规范".
- `unopinionated`: 不预设立场; "mathematically unopinionated" is "在数学意义上不预设立场".
- `mathematically blind`: 在数学意义上是盲的; never "盲目", which reads as reckless.
- `dumb`: 笨: it does what it is given and nothing more; never "简单".
- `blind to`: 看不见, as in "看不见约定".

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

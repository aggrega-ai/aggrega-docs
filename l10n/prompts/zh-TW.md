# 繁體中文

Translate into Traditional Chinese, as written in Taiwan. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Technical and plain, as Taiwan software documentation is written: precise and concise, with no emphasis the source does not have.
- Address the reader as "你" wherever the English says "you"; leave the subject out where Chinese reads better without it.
- Use the terms established in Taiwan's software writing (設定, 編譯器, 外掛程式): Taiwan's established term, never the mainland one, and never a character conversion of Simplified Chinese text.

## Punctuation, digits and quotation marks

- Chinese text takes full-width punctuation (，。：；？！、); inline code, a URL and an English term keep their own punctuation.
- A quoted phrase takes corner brackets, 「這樣」, and a quotation inside it takes 『這樣』.
- Put a space between Chinese characters and a Latin-letter term or a number: 使用 Component 宣告, 共 3 個.
- Parentheses in Chinese text are full-width, （這樣）, with no space around them; an English name given in parentheses takes them too: 幽靈基礎架構（Ghost Infrastructure）.
- Numbers take Western digits (0–9).
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never transliterated: 一個 Component, 該 Release.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: 社會契約.
- `best practice`: 最佳做法; never "規則" or "要求".
- `escape hatch`: 逃生艙口; never "後門", which reads as a back door, nor "漏洞", which reads as a loophole.
- `convention`: 慣例, as in 命名慣例; never "規則" or "規範".
- `unopinionated`: 不預設立場.
- `content-neutral`: 對內容保持中立.
- `agnostic to`: 與……無關, as in "與慣例無關".

## Vocabulary

Where English has two senses, the list names both: catalog and directory are both 目錄; a document and the documentation are both 文件, and a file is 檔案.

- Files and data: file 檔案; folder 資料夾; directory 目錄; catalog 目錄; documentation, document 文件; data 資料; database 資料庫; information 資訊; message 訊息; path 路徑; log 記錄; cache 快取; binary 二進位檔; envelope, a document's outer wrapper, 封套 (an envelope error is 封套錯誤（envelope error）at a page's first occurrence); bucket, a group of annotations, 類別.
- Code: software 軟體; hardware 硬體; program 程式; code 程式碼; source code 原始碼; string 字串; character 字元; variable 變數; function 函式; parameter 參數; argument 引數; type 型別; array 陣列; object 物件; module 模組; package 套件; library 程式庫; value 值; schema 結構描述; entity 實體; entity kind 實體種類; to implement 實作; to optimize 最佳化; thread 執行緒; process 處理程序; queue 佇列; dependency 相依性; version 版本; primitive 基本元素; invariant 不變式; a YAML map 對應表, a dictionary 字典; principle 準則 (policy stays 原則); an instance of a component or feature 實例, a cloud machine instance 執行個體; a lockfile 鎖定檔; type (plain) 型別, while a media type and a content type are 媒體類型 and 內容類型; context (template, execution, Release context) 情境; capability 能力 (a lowercase feature stays 功能); the Wasm guest 客體 and its host 主機.
- Build and run: to run, to execute 執行; to call 呼叫; to create 建立; to build, a build 建置; to compile 編譯; to render 渲染; to deploy 部署; to publish 發布; cluster 叢集; container image 映像檔; repository 存放庫; workspace 工作區; local machine 本機; remote 遠端; command line 命令列; terminal 終端機; command 命令; flag 旗標; option 選項; default 預設; to configure, settings 設定; configuration file 設定檔; template 範本; example 範例; project 專案; user 使用者; to support 支援; interface 介面; artifact 成品; registry 登錄庫; greenfield 綠地, brownfield 棕地; Day-0, Day-1 and Day-2 stay in English as the source writes them; operational 運作 (運作特性); operations, the discipline, 維運; to halt, a halt 中止; to draft 草擬, a draft 草稿; to author, authoring 撰寫, an authoring surface 撰寫介面; to bind, a binding 繫結 (a bind mount 綁定掛載); to wire, wiring 連接, a connection 連線, an edge 邊 (never 邊緣); to pin (a lockfile pin) 固定; provenance 出處; compile time 編譯時期, runtime as a phase 執行階段, a runtime as an engine 執行環境; to scaffold, a scaffold 鷹架; to ship (a product or catalog ships with) 隨附 or 發布; a walkthrough 逐步說明; a fatal error 致命錯誤; discipline (publishing discipline) 紀律, 發布紀律.
- Network: server 伺服器; client 用戶端; network 網路; network address 位址; port 連接埠; protocol 通訊協定; request 請求; response 回應; a network socket 通訊端; a plugin or topology socket 插槽; slot 槽位, so "attachment slots, topology sockets" is 附加槽位、拓撲插槽; consumer 使用端; caller 呼叫端; a loopback address 回送位址; a URL scheme 通訊協定 (配置 is never a scheme or a setting).
- Security: cryptographic key 金鑰; map key 鍵; signature 簽章; certificate 憑證; credential 認證; secret 機密; token 權杖; identity 身分; digest 摘要; hash 雜湊; policy 原則; a credential or bearer token 權杖, while an LLM token (billing, budget, count) and a lexical token stay `token` in Latin letters: token 數, token 預算.
Each of these is the ordinary word, written in lowercase in the source; the same word capitalized (Workload, Feature, Manifest, Provider, Component, Plugin, Release) is the glossary's term and stays in Latin letters.

- The product's nouns: a plugin in plain text 外掛程式; an editor extension 擴充功能; a provider in plain text 提供者; a component in plain text 元件; a release of the product 發行版本; annotation 註記; label 標籤; comment 註解; AI assistant AI 助理; lowercase workload 工作負載; lowercase feature 功能; lowercase manifest 資訊清單; lowercase operator 操作員; an Aggrega workspace in prose is Aggrega 工作區; sidecar and vendored stay in Latin letters, a vendor is 廠商; a Kubernetes operator (a controller) is Operator in Latin letters, a person is 操作員, a programming operator 運算子; a Kong consumer stays consumer in Latin letters, the Aggrega consumer is 使用端; VS Code's Command Palette is 命令選擇區 in prose (English only where the text quotes the English screen).

## Tables

- A table row is 列 and a column is 欄, never 行 for a row; a line of text or code is 行.

## Markdown

- A hard line break inside a segment stays a line break, exactly where the source has it.

## Recurring terms

- A kept term keeps the source's number inside a compound too.
- The four domains are always translated, with the English in parentheses at a page's first occurrence: Developer 開發者, Platform Architect 平台架構師, Platform Ops 平台維運, Platform Operator 平台操作員.
- The named mechanisms are written the same way: Ghost Infrastructure 幽靈基礎架構, Loud Guardrails 明示護欄, String Pipe 字串管道, Parameter Hoisting 參數提升.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Chinese in parentheses: "Ghost Infrastructure Tracker（幽靈基礎架構追蹤器）".
- Bare Ops, an Ops team and an Ops engineer are 維運, 維運團隊, 維運工程師, and an Ops Recipe is 維運 Recipe; 平台維運 is the Platform Ops domain only.
- To pipe, the String Pipe's verb, is 傳遞; a pipe is 管道.
- `agnostic to` is the qualifier above; X-agnostic is 與 X 無關; agnostic with no object is 保持中立, and never gains an object the source does not name.
- More named mechanisms are translated with the English at a page's first occurrence: Naked Base 裸基底, Enterprise Exception 企業例外, Flavored Edges 風味邊, Zero-Port 零連接埠, Injection Contract 注入契約, Separation of Concerns 關注點分離, Cascading Annotations 串接註記.
- Loud Guardrails 明示護欄 only where the source says Loud; a plain guardrail is 護欄.
- operational is 運作; 維運 is the Ops discipline only; 營運 is neither.
- A kept term keeps its plural after a Chinese numeral or measure word: 四個 Releases, 多個 Recipes, 兩個 Features.
- A heading is translated, and every link to it uses that translation word for word.
- A label an editor or a client shows on screen stays in English exactly as the screen shows it.
- A status label in inline code stays as it is; in plain text it is translated.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

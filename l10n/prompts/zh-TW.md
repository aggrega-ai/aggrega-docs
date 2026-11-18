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

- Files and data: file 檔案; folder 資料夾; directory 目錄; catalog 目錄; documentation, document 文件; data 資料; database 資料庫; information 資訊; message 訊息; path 路徑; log 記錄; cache 快取; binary 二進位檔.
- Code: software 軟體; hardware 硬體; program 程式; code 程式碼; source code 原始碼; string 字串; character 字元; variable 變數; function 函式; parameter 參數; argument 引數; type 型別; array 陣列; object 物件; module 模組; package 套件; library 程式庫; value 值; schema 結構描述; entity 實體; entity kind 實體種類; to implement 實作; to optimize 最佳化; thread 執行緒; process 處理程序; queue 佇列; dependency 相依性; version 版本.
- Build and run: to run, to execute 執行; to call 呼叫; to create 建立; to build, a build 建置; to compile 編譯; to render 渲染; to deploy 部署; to publish 發布; cluster 叢集; container image 映像檔; repository 存放庫; workspace 工作區; local machine 本機; remote 遠端; command line 命令列; terminal 終端機; command 命令; flag 旗標; option 選項; default 預設; to configure, settings 設定; configuration file 設定檔; template 範本; example 範例; project 專案; user 使用者; to support 支援; interface 介面.
- Network: server 伺服器; client 用戶端; network 網路; network address 位址; port 連接埠; protocol 通訊協定; request 請求; response 回應; socket 插槽.
- Security: cryptographic key 金鑰; map key 鍵; signature 簽章; certificate 憑證; credential 認證; secret 機密; token 權杖; identity 身分; digest 摘要; hash 雜湊; policy 原則.
- The product's nouns: a plugin in plain text 外掛程式; an editor extension 擴充功能; a provider in plain text 提供者; a component in plain text 元件; a release of the product 發行版本; annotation 註記; label 標籤; comment 註解; AI assistant AI 助理.

## Tables

- A table row is 列 and a column is 欄, never 行 for a row; a line of text or code is 行.

## Recurring terms

- A kept term keeps the source's number inside a compound too.
- The four domains are always translated, with the English in parentheses at a page's first occurrence: Developer 開發者, Platform Architect 平台架構師, Platform Ops 平台維運, Platform Operator 平台操作員.
- The named mechanisms are written the same way: Ghost Infrastructure 幽靈基礎架構, Loud Guardrails 明示護欄, String Pipe 字串管道, Parameter Hoisting 參數提升.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Chinese in parentheses: "Ghost Infrastructure Tracker（幽靈基礎架構追蹤器）".
- The text of a link to a heading is that heading's own translation, word for word.
- A label an editor or a client shows on screen stays in English exactly as the screen shows it.
- A status label in inline code stays as it is; in plain text it is translated.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

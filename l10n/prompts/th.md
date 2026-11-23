# ไทย

Translate into standard written Thai, the language of Thai technical documentation. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Plain, neutral written Thai, as Thai software documentation is written: precise and concise, with no emphasis the source does not have.
- No polite particle: never ครับ, ค่ะ, คะ, นะ or จ้ะ, at the end of a sentence or anywhere else.
- The second person, คุณ, only where the sentence needs a subject. Where Thai reads clearly without one, leave the subject out: "you can set the flag" is “ตั้งค่าแฟล็กนี้ได้” or, where the subject is needed, “คุณตั้งค่าแฟล็กนี้ได้”.
- An instruction takes the plain imperative, the verb first: “รันคำสั่ง”, “เพิ่มคีย์”. Never กรุณา, โปรด or ให้ before the verb of an instruction.
- No colloquial form: no เยอะ for many (write หลาย or จำนวนมาก), no แบบนี้ for "like this" in running text (write ดังนี้), and never มัน for "it": repeat the noun, or leave it out where Thai reads clearly without it.
- Write the active voice where Thai allows it. The passive with ถูก stands only where the source says something is done to the subject and the sentence needs that: “Release ถูกปฏิเสธ”. Never turn every English passive into ถูก or “ได้รับการ”.

## Punctuation, spacing and digits

- A sentence ends with no full stop. A single space separates two sentences, and a single space separates two clauses where English puts a comma or a semicolon: no comma and no semicolon stands between Thai clauses. A heading, a list item and a table cell end with no full stop either. Never two spaces in a row.
- The words of one Thai clause are written together, with no space between them.
- A space stands before and after a Latin term, a number, an inline code span and link text in Latin letters, unless punctuation stands there: “ประกาศใน Component แต่ละรายการ”, “มีไฟล์ 3 ไฟล์”, “รัน `aggrega build` ก่อน”. A Thai word joined to a Latin term is still separated from it by that space: “การ pull”, “ไฟล์ YAML”, “ของ Release”.
- Parentheses are the ordinary ( ), with a space before the opening one and after the closing one, and none inside; an English name given in parentheses takes them too: “คอมไพเลอร์ป้องกันโครงสร้างพื้นฐานผี (Ghost Infrastructure) ด้วยการหยุดการบิลด์”.
- A list separates its items with a space and joins the last one with และ or หรือ: “ไฟล์ โฟลเดอร์ และไดเรกทอรี”. Where every item is a Latin term or inline code, a comma follows each item but the last, so that a name of two words stays readable: “Components, Features และ Recipes”, “`values`, `parameters` และ `provides`”.
- A quoted phrase takes the quotation marks “ ”, and a quotation inside it takes ‘ ’. A heading name quoted in running Thai text takes “ ” too. The straight double quotes that belong to a quoted English message stay as the source writes them.
- The repetition mark ๆ is joined to the word it repeats and followed by a space: “ไฟล์ต่างๆ ในไดเรกทอรี”.
- A question keeps its `?`.
- A colon follows its word directly and takes a space after it.
- Numbers take Western digits (0–9), always: never the Thai digits (the ten Thai digit characters, code points U+0E50 to U+0E59), in a count, a version, a date, a heading or a table. A number keeps the decimal point `.`, the thousands separator `,` and the percent sign `%` the source writes (21,867 and 99.9%).
- A year and a date stay in the calendar the source writes, never converted to the Buddhist Era.
- No Thai abbreviation written with full stops: write the word in full. "Etc." and "and so on" are “เป็นต้น”, "e.g." is “เช่น”, and "i.e." is “กล่าวคือ”.
- Inline code is never put in quotation marks: it keeps its backticks.
- No invisible character of any kind: no zero-width space, zero-width joiner or non-joiner, word joiner, soft hyphen, byte order mark, direction mark or direction control. Thai writes no space between words, and the sites decide where a line breaks; a character put in to steer a line break is a defect.
- Sara am is the single character U+0E33, as in “คำ”: never nikhahit U+0E4D followed by sara aa U+0E32, which looks the same on screen and is a different string to search.
- A consonant's marks are stored in one order: the consonant, then its vowel mark above or below, then its tone mark (U+0E48 to U+0E4B), as “ที่” and “ปลั๊กอิน” are written. A tone mark typed before its vowel mark looks the same on some screens and breaks search. A mark always follows its consonant: never a mark at the start of a word, after a space or after a Latin letter.
- Thai and Latin letters only: no letter of another script.

## Can, must and counting

- "Can", "may" in the sense of being allowed to, and "is able to" are the verb phrase followed by ได้: “คุณระบุแฟล็กนี้ได้”, “Release แทนที่ค่านี้ได้”. Do not add สามารถ; "cannot" is the verb phrase followed by ไม่ได้: “Release ใช้ `values:` ไม่ได้”.
- "Must" is ต้อง, "must not" is ต้องไม่, and "need not" or "does not have to" is “ไม่จำเป็นต้อง”. "Should" is ควร and "should not" is “ไม่ควร”. "May" in the sense of possibility is “อาจ”.
- "Never", said of what the compiler or a command does, is ไม่ with เลย after the verb phrase: “คอมไพเลอร์ไม่ดึงข้อมูลลับเลย”. "Always" is “เสมอ”. Never soften "never" to ไม่ค่อย, which means seldom.
- "Required", in a schema or a flag table, is จำเป็น, and "optional" is “ไม่บังคับ”.
- Thai counts with the noun first, then the number, then a classifier: “ไฟล์ 3 ไฟล์”. Use these classifiers:
  - a noun that is its own classifier repeats itself: ไฟล์, คำสั่ง, ค่า, พอร์ต, หน้า, บรรทัด, แถว, คอลัมน์, ขั้นตอน, ภาษา, อักขระ, as in “คำสั่ง 2 คำสั่ง” and “อย่างน้อย 1 อักขระ”
  - a kept term in Latin letters (Component, Release, Recipe), an entity, an entry and an item of a list take รายการ: “Releases 3 รายการ”
  - a program, a plugin, a variable, a parameter, a function, a container and a letter take ตัว: “ตัวแปร 2 ตัว”
  - a machine and a server take เครื่อง, a provider, a vendor and a company take ราย, a person takes คน, a set takes ชุด, a kind takes ประเภท, and a run or a pass takes รอบ
- "A" or "one" that only marks a single thing takes no number and no classifier: "a file" is “ไฟล์”, never “ไฟล์ 1 ไฟล์”. "Each" is แต่ละ before the noun or its classifier: “แต่ละไฟล์”, “Component แต่ละรายการ”. "Every" is ทุก: “ทุกไฟล์”, “Release ทุกรายการ”.
- A number the source writes in digits stays in digits; a number the source writes as a word becomes the Thai number word: "two files" is “ไฟล์สองไฟล์”. An ordinal is ที่ before the number: "Domain 2" is “ส่วนงานที่ 2”.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never written in Thai letters: “Component แต่ละรายการ”, “ไฟล์ Release”.
- Thai has no plural, so a kept term keeps the source's form: `Component` and `Components`, `Release` and `Releases` are two distinct terms. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, also after a number: “Releases 3 รายการ”.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind, file name and path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.
- These stay in Latin letters, as the source writes them:
  - pull and push, the `aggrega pull` and `aggrega push` operations, and a person or a step that pulls or pushes an entity, in prose too; a server pushing diagnostics is the ordinary verb ส่ง
  - sync, the import send mode (ordinary synchronising is ซิงค์)
  - lint, the check, and linter
  - sentinel, an error sentinel
  - chart, a Helm chart, in every phrase; never แผนภูมิ
  - shell
  - sidecar
  - vendored, vendors and to vendor, in the form the source writes (a vendor, a company, is ผู้จำหน่าย)
  - pod, webhook, span, rail and jailbreak, and a headless Service
  - hub, the hub written lowercase: the official hub is “hub อย่างเป็นทางการ”
  - referrer, in the OCI sense
  - runner, a CI runner
  - daemon, the long-running `aggrega serve` process, in every phrase: “daemon หยุดทำงาน”; never บริการเบื้องหลัง nor เซิร์ฟเวอร์เบื้องหลัง
  - release, lowercase, for a Helm release (a deployed chart instance, a release name)
  - consumer, a Kong consumer (the Aggrega consumer is ผู้บริโภค)
  - invalid-params, the protocol's error name (an invalid parameter is พารามิเตอร์ที่ไม่ถูกต้อง)
  - Day-0, Day-1 and Day-2
  - stdin, stdout and stderr where the source writes them so (standard input, output and error written out are อินพุตมาตรฐาน, เอาต์พุตมาตรฐาน and ข้อผิดพลาดมาตรฐาน)
  - an SSH agent, as written
- A verb kept in Latin letters stands as the verb itself, with no ทำ or สั่ง before it: “pull Recipe จาก hub”, “push อาร์ติแฟกต์ไปยังรีจิสทรี”, “lint ไฟล์ทั้งหมด”. Used as a noun, it takes การ, separated by a space: “การ pull”. The pull step of a build is “ขั้นตอน pull”, and `--auto-pull` and `auto_pull` stay as written.
- A registry, in every sense, is รีจิสทรี, and a tag, an OCI tag, an image tag, a git tag or a tag on a cloud resource, is แท็ก: Thai technical writing reads both in Thai letters, as the vocabulary gives them.

## The qualifiers

| Qualifier | Thai | Note |
|---|---|---|
| `social contract` | สัญญาประชาคม | |
| `best practice` | แนวปฏิบัติที่ดีที่สุด | Never กฎ (a rule) nor ข้อกำหนด (a requirement). |
| `escape hatch` | ทางออกฉุกเฉิน | Never ประตูหลัง (it reads as a back door) nor ช่องโหว่ (it reads as a loophole or a vulnerability). |
| `convention` | ธรรมเนียม | As in “ธรรมเนียมการตั้งชื่อ”. Never กฎ, ข้อบังคับ nor “มาตรฐาน”. |
| `unopinionated` | ไม่กำหนดจุดยืน | |
| `content-neutral` | เป็นกลางต่อเนื้อหา | |
| `agnostic to` | ไม่ขึ้นกับ | As in “ไม่ขึ้นกับธรรมเนียม” and “ไม่ขึ้นกับผู้ให้บริการรายใด”. |

## Vocabulary

One rendering for each word, on every page.

A rendering followed by † is a transliterated loanword. The marker lets these words be listed mechanically, for the list of words a Thai line break keeps whole. The marker belongs to this guide alone: a translation writes the word without it. A rendering of more than one word carries no marker, and each loanword in it has a row of its own. Write each loanword letter for letter as it is spelled here: a second spelling, such as one with a tone mark added (ฟังก์ชั่น for ฟังก์ชัน, เวอร์ชั่น for เวอร์ชัน), is a different word to search and to line breaking. A loanword this guide does not list keeps the spelling Thai technical writing gives it, with no tone mark added; where Thai documentation keeps the English word, keep it in Latin letters. In this guide, quotation marks around Thai only set off an example or a rendering: a translation writes quotation marks only where the source quotes.

Files and data:

| English | Thai |
|---|---|
| file | ไฟล์† |
| folder | โฟลเดอร์† |
| directory | ไดเรกทอรี† |
| catalog | แค็ตตาล็อก† |
| documentation | เอกสารประกอบ |
| document | เอกสาร |
| data | ข้อมูล |
| database | ฐานข้อมูล |
| information | ข้อมูล (the same word as data) |
| message | ข้อความ |
| table | ตาราง |
| row (of a table) | แถว |
| column (of a table) | คอลัมน์† |
| line (of text or code) | บรรทัด |
| path (a file path, the route through a provider) | เส้นทาง |
| log | บันทึก |
| cache | แคช† |
| semantic cache | แคชเชิงความหมาย |
| binary | ไบนารี† |
| configuration file | ไฟล์การกำหนดค่า |
| artifact | อาร์ติแฟกต์† |
| output, outputs (what a command, a build or a render writes) | เอาต์พุต† |
| lock, short for a lockfile | ล็อก† |
| lockfile | ไฟล์ล็อก |
| entry (a row of a list, a map, a catalog or a lockfile) | รายการ |
| input (what a build, a step or a template reads) | อินพุต† |
| mode | โหมด† |
| input mode | โหมดอินพุต |
| source (a Recipe's source, in plain text) | ซอร์ส† |
| sourced (an input kind, an input mode, a path, a template) | แบบอิงซอร์ส |
| synthesized (an input kind) | แบบสังเคราะห์ |
| fact (what a provider reports or a template reads) | ข้อเท็จจริง |
| declare, declaration | ประกาศ, การประกาศ |
| declarative | เชิงประกาศ |
| condition (documented by an error or warnings page) | เงื่อนไข |
| remedy (an error entry's way out) | ทางแก้ |
| link | ลิงก์† |
| symbolic link, link on disk | ลิงก์สัญลักษณ์, ลิงก์ |
| plugin trust record | บันทึกความเชื่อถือ |

An artifact is อาร์ติแฟกต์ and output is เอาต์พุต: the two stay apart, and output is never อาร์ติแฟกต์ nor “ผลลัพธ์”. Output stays เอาต์พุต in every phrase: the output of a verdict is “เอาต์พุตของคำตัดสิน”. What a compiler, a Recipe or a plugin writes is emitted, ส่งออก, and an emitted file is “ไฟล์ที่ส่งออก”. Log is บันทึก, and lock is ล็อก, so ล็อก never stands for a log.

Code:

| English | Thai |
|---|---|
| software | ซอฟต์แวร์† |
| hardware | ฮาร์ดแวร์† |
| program | โปรแกรม† |
| code | โค้ด† |
| source code | ซอร์สโค้ด |
| string | สตริง† |
| character | อักขระ |
| variable | ตัวแปร |
| function | ฟังก์ชัน† |
| parameter | พารามิเตอร์† |
| argument | อาร์กิวเมนต์† |
| type | ชนิด |
| array | อาร์เรย์† |
| object | ออบเจ็กต์† |
| map (a YAML map, the type) | แมป† |
| boolean, bool (the type) | บูลีน† |
| module | โมดูล† |
| package | แพ็กเกจ† |
| library | ไลบรารี† |
| value | ค่า |
| field | ฟิลด์† |
| property (a schema property) | คุณสมบัติ |
| schema | สคีมา† |
| entity | เอนทิตี† |
| entity kind | ประเภทเอนทิตี |
| instance | อินสแตนซ์† |
| mapping | การแมป |
| severity | ระดับความรุนแรง |
| metadata | เมทาดาทา† |
| provenance | ที่มา |
| head of a printed diagnostic | ส่วนหัว |
| HTTP header, header of a file | เฮดเดอร์† |
| error | ข้อผิดพลาด |
| warning | คำเตือน |
| diagnostic | การวินิจฉัย |
| short code (an error's) | รหัสย่อ |
| finding (what a check or a build reports) | ข้อค้นพบ |
| advisory (a finding a build raises without halting) | ข้อแนะนำ; the adjective: เชิงแนะนำ |
| failure, as a noun | ความล้มเหลว; to fail: ล้มเหลว |
| structured (a tree, an object, a map, a value) | ที่มีโครงสร้าง |
| opaque (a body, a patch target, metadata or a map the compiler does not read) | ทึบ |
| pillar (`values`, `infra`, `parameters`, `provides`) | เสาหลัก |
| scalar (a single value) | สเกลาร์† |
| block (a YAML block, a code block) | บล็อก† |
| patch (a JSON-Patch operation, a patch target) | แพตช์† |
| hydration (the inject pipe) | ไฮเดรชัน† |
| Semantic Versioning | การกำหนดเวอร์ชันเชิงความหมาย |
| callback (a source callback) | คอลแบ็ก† |
| export (a plugin's ABI export) | เอ็กซ์พอร์ต† |
| kit (the plugin development kit, a language's kit) | ชุดเครื่องมือ |
| controller (a process that reconciles a resource) | คอนโทรลเลอร์† |
| wire (a plugin's wire types, shapes and encodings) | wire, in Latin letters |
| hyphen (the character) | ยัติภังค์ |
| tag (an OCI, image or git tag, a tag on a cloud resource) | แท็ก† |
| tagging (the built-in tagging plugins, the selector tagger) | การติดแท็ก |
| markings (what a sensitivity declaration puts on a value) | การทำเครื่องหมาย (marked: ที่ทำเครื่องหมายแล้ว) |
| to implement | อิมพลีเมนต์† |
| to optimize | ปรับให้เหมาะสม |
| thread | เธรด† |
| process | กระบวนการ |
| queue | คิว† |
| dependency | การพึ่งพา |
| node (of a graph or a Release) | โหนด† |
| edge (of a graph, a `uses` edge) | เส้นเชื่อม |
| version | เวอร์ชัน† |
| a release of the product | รุ่น |

Build and run:

| English | Thai |
|---|---|
| to run, to execute | รัน† |
| to synchronise (ordinary synchronising, not the `sync` send mode) | ซิงค์† |
| to call, to invoke | เรียก |
| computed (what a host calculates) | คำนวณ |
| to create | สร้าง |
| to build, a build | บิลด์† |
| to compile | คอมไพล์† |
| compilation (the noun) | การคอมไพล์ |
| compiled | ที่คอมไพล์แล้ว |
| compile time | ขณะคอมไพล์ (runtime, the phase it is set against, is ขณะรัน) |
| a runtime (an engine that runs code) | รันไทม์† |
| compiler | คอมไพเลอร์† |
| to render | เรนเดอร์† |
| walkthrough (a page that builds an example step by step) | บทแนะนำทีละขั้นตอน |
| walkthrough (the explain output for one condition) | คำอธิบายโดยละเอียด |
| to generate | สร้างขึ้น (generated: ที่สร้างขึ้น) |
| to emit | ส่งออก |
| to stamp (what the host or a guest puts on an output) | ประทับ |
| contributor (what contributes files or units to an assembled output) | ผู้มีส่วนร่วม |
| prompt (what is sent to a model) | พรอมต์† |
| model (a language model, the onion model) | โมเดล† |
| to deploy | ปรับใช้ (the act of deploying: การปรับใช้) |
| to publish | เผยแพร่ |
| to apply | นำไปใช้ |
| to resolve, resolution (dependencies, references, a Release, a catalog) | หาค่า, การหาค่า |
| to parse, parsing | แยกวิเคราะห์, การแยกวิเคราะห์ |
| to evaluate (an expression, a local) | ประเมินค่า |
| a pass (one run through a check or a build) | รอบ |
| dry run | การทดลองรัน |
| exit code | รหัสการออก |
| exit status | สถานะการออก |
| to halt, a halt | หยุด, การหยุด |
| to check | ตรวจสอบ |
| to validate, validation | ตรวจสอบความถูกต้อง, การตรวจสอบความถูกต้อง |
| to verify (a signature, a digest) | ยืนยัน |
| attachment (the entity attached, and the act) | การแนบ |
| to attach | แนบ |
| stack (a search stack, a CloudFormation stack, a Docker Compose stack) | สแตก† |
| gate (a check that halts a build) | ด่านตรวจ |
| publish gate | ด่านตรวจการเผยแพร่ |
| gateway (an AI gateway, an API gateway) | เกตเวย์† |
| cluster | คลัสเตอร์† |
| container | คอนเทนเนอร์† |
| image (an OCI image, a container image) | อิมเมจ† |
| container image | อิมเมจคอนเทนเนอร์ |
| repository | ที่เก็บ |
| registry | รีจิสทรี† |
| workspace | พื้นที่ทำงาน |
| local (a local file, catalog, entity) | ภายในเครื่อง |
| local machine | เครื่องภายใน |
| remote | ระยะไกล |
| cloud | คลาวด์† |
| platform | แพลตฟอร์ม† |
| native (provider-native) | เนทีฟ† |
| environment | สภาพแวดล้อม |
| service (in plain text) | บริการ |
| application | แอปพลิเคชัน† |
| command line | บรรทัดคำสั่ง |
| terminal | เทอร์มินัล† |
| editor | ตัวแก้ไข |
| command | คำสั่ง |
| flag | แฟล็ก† |
| option | ตัวเลือก |
| selector | ตัวคัดเลือก |
| default | ค่าเริ่มต้น |
| to configure, configuration | กำหนดค่า, การกำหนดค่า |
| template | เทมเพลต† |
| example | ตัวอย่าง |
| project | โปรเจกต์† |
| user | ผู้ใช้ |
| to author, authoring | เขียน, การเขียน (an author: ผู้เขียน) |
| to support | รองรับ |
| marker (a deprecation marker, a withdrawal marker, a marker file) | เครื่องหมาย |
| deprecation notice | ประกาศการเลิกใช้ |
| deprecation, deprecated | การเลิกใช้, เลิกใช้แล้ว |
| withdrawal, retracted | การถอน, ถูกถอนแล้ว |
| interface | อินเทอร์เฟซ† |
| router | เราเตอร์† |
| pipeline | ไปป์ไลน์† |
| proxy | พร็อกซี† |
| agent | เอเจนต์† |
| middleware | มิดเดิลแวร์† |
| to wire, wiring | เชื่อมโยง, การเชื่อมโยง |
| to bind, binding | ผูก, การผูก |
| physical | เชิงกายภาพ |
| hardcoded | ฮาร์ดโค้ด† |
| graph | กราฟ† |
| limit (a resource limit, a rate or concurrency limit) | ขีดจำกัด |
| cap (a ceiling on a count, a size or a number of results) | เพดาน |
| boundary (a Release's `boundaries`) | แนวเขต |
| scope | ขอบเขต |
| mandate (a presence mandate) | ข้อบังคับ |
| cascade (a layered lookup) | การไล่ลำดับชั้น |
| drift | ความคลาดเคลื่อน |
| to fill | เติม |
| sandbox | แซนด์บ็อกซ์† |
| setting | การตั้งค่า |
| configuration key | คีย์การกำหนดค่า |

A registry, as a noun of any kind (a registry's index, a plugin registry, the Higress plugin registry), is รีจิสทรี, as Thai technical writing names it: “ดัชนีของรีจิสทรีภายในเครื่อง”. ที่เก็บ is a repository and บันทึก is a log, so neither is ever a registry. The official hub is “hub อย่างเป็นทางการ”: hub stays in Latin letters.

To deploy is ปรับใช้ and to publish is เผยแพร่: two verbs, never one for the other. What a server or a run makes available (the language server publishes diagnostics, findings or advisories) is published too: “เซิร์ฟเวอร์เผยแพร่การวินิจฉัย”. "Publishes but never deploys" is “เผยแพร่แต่ไม่ปรับใช้เลย”. ปรับใช้ is only to deploy: to adjust is ปรับ, to customise is ปรับแต่ง, and to apply is “นำไปใช้”.

To build is บิลด์ and to create is สร้าง: a build is never สร้าง, so "builds the Release" is “บิลด์ Release” and "creates a file" is “สร้างไฟล์”. To compile is คอมไพล์ and the compiler is คอมไพเลอร์: the two are distinct words. A release of the product, such as the compiler's, is รุ่น (“รุ่น 0.10.0”, a patch release “รุ่นแพตช์”); a `Release` entity stays Release, and a version is “เวอร์ชัน”.

Network:

| English | Thai |
|---|---|
| server | เซิร์ฟเวอร์† |
| client | ไคลเอนต์† |
| network | เครือข่าย |
| network address | ที่อยู่ |
| DNS domain | โดเมน† |
| port | พอร์ต† |
| protocol | โปรโตคอล† |
| request | คำขอ |
| response | การตอบกลับ |
| socket | ซ็อกเก็ต† |
| slot | สล็อต† |
| namespace | เนมสเปซ† |
| collision | การชนกัน (to collide: ชนกัน) |
| surface (the places a command or a tool reaches) | พื้นผิว |
| connection, between two nodes of a Release | การเชื่อมต่อ |
| to connect (a client to a server) | เชื่อมต่อ |

Security:

| English | Thai |
|---|---|
| key (a cryptographic key, a map key) | คีย์† |
| signature | ลายเซ็น |
| certificate | ใบรับรอง |
| credential | ข้อมูลรับรอง |
| secret | ข้อมูลลับ |
| token | โทเค็น† |
| an access token | โทเค็นการเข้าถึง |
| identity | ตัวตน |
| digest | ไดเจสต์† |
| hash | แฮช† |
| policy | นโยบาย |

Every token is โทเค็น: an access token (a credential or bearer token) is “โทเค็นการเข้าถึง”, and an LLM token (billing, budget, count), a lexical token and a lowercase kind or schema token are โทเค็น too. A word in inline code (`token`) stays as written.

The product's nouns:

| English | Thai |
|---|---|
| a plugin, in plain text | ปลั๊กอิน† |
| an editor extension | ส่วนขยาย |
| a provider, in plain text | ผู้ให้บริการ |
| a component, in plain text | ส่วนประกอบ |
| a workload, in plain text | เวิร์กโหลด† |
| a feature, in plain text | ฟีเจอร์† |
| a manifest, in plain text (a Kubernetes or OCI manifest) | แมนิเฟสต์† |
| the Wasm host | โฮสต์† |
| the Wasm guest | เกสต์† |
| annotation | คำอธิบายประกอบ |
| comment | ความคิดเห็น |
| label | ป้ายกำกับ |
| AI assistant | ผู้ช่วย AI |

Each of these is the ordinary word, written in lowercase in the source; the same word capitalized (Workload, Feature, Manifest, Provider, Component, Plugin, Release) is the glossary's term and stays in Latin letters.

## Tables

- A table row is แถว and a column is “คอลัมน์”. A line of text or code is บรรทัด, never “แถว”.
- A table keeps its columns in the source's order.

## Markdown

- A segment keeps every line of its source, each on its own line, exactly where the source breaks it. A hard line break stays a line break.
- Lines of a plain paragraph that the source merely wraps (no Markdown marker) may be joined into one line. The rule above applies to lines that start with a marker.
- A line that starts with a Markdown marker (`>`, `-`, `|`, a number) stays its own line and keeps that marker. A quoted message over several lines keeps each line with its leading `>`; joining the lines into one sentence is a defect, because the page then shows the markers as text.
- A link's target, the part in parentheses after the link text, stays exactly as the source writes it, its `#` anchor included: only the link text is translated.

## Recurring terms

- A kept term keeps the source's number inside a compound too, a hyphenated one included: “อินสแตนซ์ของ Component” for Component instances, “การผูก Feature” for Feature binding, “ชนิดของ Feature” for Feature types, “ข้าม Recipe” for cross-Recipe and “การนำกลับมาใช้ใหม่ข้าม Component” for cross-Component reuse. “การผูก Features” is only for Features bindings.
- The four domains are always translated, with the English in parentheses at a page's first occurrence, as in “นักพัฒนา (Developer)”:
  - Developer: นักพัฒนา
  - Platform Architect: สถาปนิกแพลตฟอร์ม (the Architect alone, and the architect role: สถาปนิก)
  - Platform Ops: ฝ่ายปฏิบัติการแพลตฟอร์ม
  - Platform Operator: ผู้ดำเนินการแพลตฟอร์ม
- The named mechanisms are written the same way:
  - Ghost Infrastructure: โครงสร้างพื้นฐานผี
  - Loud Guardrails: ราวกั้นเสียงดัง
  - String Pipe: ท่อสตริง
  - Parameter Hoisting: การยกพารามิเตอร์
- More named mechanisms are translated with the English at a page's first occurrence:
  - Naked Base: ฐานเปล่า
  - Flavored Edges: เส้นเชื่อมแบบมีรสชาติ
  - Enterprise Exception: ข้อยกเว้นสำหรับองค์กร
  - Zero-Port: ศูนย์พอร์ต
  - Injection Contract: สัญญาการแทรก
  - Separation of Concerns: การแยกความรับผิดชอบ
  - Cascading Annotations: คำอธิบายประกอบแบบไล่ลำดับชั้น
- The 5-Tier Onion Model is “โมเดลหัวหอม 5 ชั้น (5-Tier Onion Model)” at a page's first occurrence, with Western digits.
- Loud Guardrails is ราวกั้นเสียงดัง only where the source says Loud; a plain guardrail is “ราวกั้น”.
- Ops outside the Platform Ops domain:
  - bare Ops: ฝ่ายปฏิบัติการ
  - an Ops team: ทีมปฏิบัติการ
  - an Ops engineer: วิศวกรฝ่ายปฏิบัติการ (a person on the Platform Ops team is “วิศวกรฝ่ายปฏิบัติการแพลตฟอร์ม”)
  - an Ops Recipe: “Recipe ของฝ่ายปฏิบัติการ”
- ฝ่ายปฏิบัติการแพลตฟอร์ม is the Platform Ops domain only. Operational is “เชิงปฏิบัติการ”.
- An operator, a person, is ผู้ดำเนินการ; an operator in programming is ตัวดำเนินการ; a Kubernetes operator is Operator, in Latin letters (a controller that is not an Operator is คอนโทรลเลอร์).
- To pipe, the String Pipe's verb, is ส่งผ่าน; a pipe is “ท่อ”.
- To inject, injection, said of the inject pipe, a prompt or what the compiler never adds, is แทรก, การแทรก: “ไม่มีสิ่งใดถูกแทรกเข้ามา”, prompt injection “การแทรกพรอมต์”. `inject` in inline code stays as written.
- A contract (a schema or API contract) is สัญญา: a typed contract is “สัญญาที่ระบุชนิด” and a typed parameter is “พารามิเตอร์ที่ระบุชนิด”.
- `agnostic to` is the qualifier above. X-agnostic is ไม่ขึ้นกับ before X, as in provider-agnostic “ไม่ขึ้นกับผู้ให้บริการรายใด”; agnostic with no object is เป็นกลาง (neutral), and never gains an object the source does not name.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Thai in parentheses: “The provider does not support omits (ผู้ให้บริการไม่รองรับ omits)”. One link text per target. The English keeps its inline code, and a capitalized glossary term inside the Thai in parentheses stays in Latin letters, as anywhere else. The Thai gloss writes every key, field and file the English names in plain text (aggregates, components, value:, from:, in:, function:) in Latin letters as the source writes it, never as a Thai paraphrase of that key.
- A heading on an error page and every quotation of it, in a link, a list of headings or a sentence of another page, carry the same Thai character for character: a quotation copies each heading's Thai as the heading writes it, and a link never translates a heading anew. A link that differs from its heading by one letter or one mark is a defect.
- A link from any page to a heading that is not on an error page, and a link from one page to another page or an example, uses the Thai alone, also in an example README: its text is the target's translated title, never the English title. A command (`aggrega serve`) and a product name (Claude Desktop) in a link text stay as written. The English-first form belongs only to a heading on an error or warnings page and to the links to it; every other link text is translated, even where the source shows the heading verbatim, and also where it is a page title after a path prefix such as `arm →` (the part after the arrow).
- The recurring section titles of an example README take one wording on every page: “สิ่งที่ตัวอย่างนี้แสดง” for "What it shows" and for "What it demonstrates", “ลำดับการสอน” for "the teaching order", “วิธีรัน” for "Run it", “ไฟล์” for "Files".
- A condition, said of what an error page or a warnings page documents (a halting condition, the condition's own sentence, the condition's short code), is เงื่อนไข: “เงื่อนไขนี้”, “รหัสย่อของเงื่อนไข”. A logical condition, as in an `if`, is เงื่อนไข too.
- To declare, and a declaration, said of an entity, a Recipe, a provider or a plugin, are ประกาศ and การประกาศ, and declarative is เชิงประกาศ (“เอเจนต์เชิงประกาศ”). กำหนด is to set or to define and ระบุ is to specify: neither stands for declare.
- A collision, said of two names, two files or two outputs that reach one place, is การชนกัน (“ชื่อชนกัน”). A merge conflict is ความขัดแย้ง, never a collision.
- A namespace, said of a Kubernetes namespace, a prefix namespace, a method namespace or the namespace of a slot, is “เนมสเปซ”. Never ขอบเขต, which is a scope.
- An entry, a row of a list, a map, a catalog or a lockfile, is รายการ: “รายการในไฟล์ล็อก”. An input, what a build, a step or a template reads, is อินพุต, and an input kind is “ประเภทอินพุต”, as an entity kind is “ประเภทเอนทิตี”. The same input, said of a build that gives the same result for the same input, is “อินพุตเดียวกัน”.
- A surface, said of the set of places a command, a tool or a check reaches, is พื้นผิว (“พื้นผิวของเครื่องมือ”). อินเทอร์เฟซ is an interface and never a surface.
- A remedy, the way out an error entry names, is ทางแก้, and the `remediation:` label inside an emitted message's translation is “การแก้ไข”.
- Overview, in a heading or a link, is “ภาพรวม”.
- A field name written in plain text (pluginType) stays as written inside translated error text.
- The label "How to fix:" is **วิธีแก้ไข:** at the start of its paragraph.
- Emitted message, emitted messages: “ข้อความที่ส่งออก”.
- Published, said of a schema, a document, a name, a value, an address, an alias or a port that is made available, is เผยแพร่: “สคีมาที่เผยแพร่”. Never ปรับใช้, which is deploying.
- A router, the Release as "the router" or a text-router, is เราเตอร์ ("deployment router" is “เราเตอร์การปรับใช้”). A prompt, what is sent to a model, and a prompt the assistant pages hand a reader to paste, is “พรอมต์”. Never คำสั่ง for a prompt, which is a command.
- Pipeline, in plain text, is ไปป์ไลน์, also for the compiler's own pipeline and a feature-recipe pipeline: “ไปป์ไลน์ของคอมไพเลอร์”. A CI/CD pipeline is “ไปป์ไลน์ CI/CD”. Never เส้นทาง, which is a path.
- A path, said of the route a Release takes through one provider (the Compose path, the helm path, the Kubernetes path, the synthesized helm path) or of a file path, is เส้นทาง: “เส้นทาง Compose”, “เส้นทาง helm แบบสังเคราะห์”.
- Walkthrough, said of a page that builds an example step by step, is บทแนะนำทีละขั้นตอน; a link to such a page uses the page's own Thai title. Said of what the explain output gives for one condition, it is “คำอธิบายโดยละเอียด”.
- A proxy is พร็อกซี and an agent is เอเจนต์, so the two never share a word. An SSH agent stays as written.
- Wire, wiring and to wire are เชื่อมโยง: Semantic Wiring is “การเชื่อมโยงเชิงความหมาย”. To bind and binding are ผูก: Late Binding is “การผูกภายหลัง”. To connect and a connection are เชื่อมต่อ, for a client reaching a server and for a connection between two nodes of a Release. A plugin's wire types and encodings stay wire, in Latin letters: “ชนิด wire”, “การเข้ารหัส wire”.
- Physical, said of infrastructure, resources and sizing, is เชิงกายภาพ, as in “โครงสร้างพื้นฐานเชิงกายภาพ”; the pair physical and logical is เชิงกายภาพ and “เชิงตรรกะ”.
- Hardcoded is ฮาร์ดโค้ด: “สคีมาที่ฮาร์ดโค้ดไว้”.
- A graph is กราฟ: the IR graph is “กราฟ IR”. Never สคีมา, which is a schema.
- Opaque, said of a body, a patch target, metadata or a map the compiler does not read, is ทึบ: “เนื้อหาที่ทึบ”, “เมทาดาทาที่ทึบ”. Metadata is “เมทาดาทา”.
- A pillar, said of the `values`, `infra`, `parameters` and `provides` pillars of a document, is เสาหลัก: “เสาหลัก `provides:`”. Never คอลัมน์, which is a table column.
- A scalar, said of a single value, is สเกลาร์: “แมปของสเกลาร์ที่ทึบ”. A YAML block scalar is “สเกลาร์แบบบล็อก” only where the source names the YAML construct.
- A patch, said of a JSON-Patch operation, a patch target or the pipeline patch model, is แพตช์: “เป้าหมายของแพตช์”, “การนำแพตช์ไปใช้”. A patch release is “รุ่นแพตช์”.
- Hydration, said of the inject pipe, is ไฮเดรชัน (“ไฮเดรชันของ inject”). เติม is only the fill of a slot, so it never stands for hydration.
- To stamp, said of what the host or a guest puts on an output (a label, an annotation, provenance), is ประทับ: “ประทับเป็นป้ายกำกับ”.
- A contributor, said of what contributes files or units to an assembled output, is “ผู้มีส่วนร่วม”.
- Semantic Versioning is “การกำหนดเวอร์ชันเชิงความหมาย”, in the field descriptions of every schema page alike, never in Latin letters.
- An advisory, said of the findings a build raises without halting, is ข้อแนะนำ, and the adjective is “เชิงแนะนำ”. Advice, in the ordinary sense, is “คำแนะนำ”. Never คำเตือน for an advisory, which is a warning.
- A boundary, in the sense of a Release's `boundaries`, is “แนวเขต”. Scope is “ขอบเขต”. A limit, a resource limit (a CPU limit, a memory limit) or any other (a concurrency limit, a rate limit, a budget limit), is ขีดจำกัด, and a cap, a ceiling on a count, a size or a number of results, is เพดาน (“เพดานของขนาด”). A name inside inline code stays as written.
- A lowercase release or aggregate that names a Release or an Aggregate entity (the release resolves to, a release file, `--release <release>`, a sub-aggregate) is written as the entity's name in Latin letters, Release or Aggregate (“Aggregate ย่อย”). รุ่น is only a release of the product, such as the compiler's.
- A lowercase plural of an entity name keeps its number: releases is Releases, and three releases is “Releases สามรายการ”.
- A plural kept term stays plural wherever the source writes it, also when two are joined: “Components และ Features”.
- Lowercase component, feature, workload, manifest, plugin, provider and operator are ordinary words, translated as the vocabulary gives them, also beside a kept term and inside a compound (“การสังเคราะห์เวิร์กโหลด” for workload synthesis). A provider-native manifest is “แมนิเฟสต์แบบเนทีฟของผู้ให้บริการ”, never “เมทาดาทา”.
- A slot, said of an attachment slot or a slot a Component declares, is สล็อต: “สล็อตการแนบ”. A socket stays “ซ็อกเก็ต”.
- An attachment, the entity a Release or an Aggregate attaches and the act of attaching it, is การแนบ: “การแนบ Feature”, “ชื่อการแนบ”, “การแนบด้านการกำกับดูแล”. To attach is แนบ, and attached is ที่แนบ: “Feature ที่แนบกับโหนด”. Governance is “การกำกับดูแล”.
- An instance, said of an instance name, a Component instance, a database instance, a virtual machine instance or a service instance (a Sigstore instance, a gateway instance), is อินสแตนซ์: “ชื่ออินสแตนซ์”. Never สำเนา, which is a copy.
- A stack, a search stack, a CloudFormation stack or a Docker Compose stack, is สแตก: “สแตก Compose”. Never แพ็กเกจ, which is a package.
- A pass, said of one run through a check or a build, is รอบ: “ในรอบเดียว”.
- Domain, said of the four domains and of Domain 1 to 4, is ส่วนงาน: “ส่วนงานที่ 2”. Domain-specific, and domain intelligence, the knowledge of one field, take เฉพาะทาง: “ตรรกะเฉพาะทาง”. A DNS domain or sub-domain is “โดเมน”. The three never share a word.
- Cache is แคช, and a semantic cache is “แคชเชิงความหมาย”.
- Mapping, a Manifest mapping or a values mapping, is การแมป: never การผูก, which is binding, nor การจับคู่, which is matching.
- To resolve and resolution, said of dependencies, references, a Release or a catalog, are หาค่า and การหาค่า: “การหาค่าการพึ่งพา”, “หาค่า Release”, “การอ้างอิงที่หาค่าแล้ว”. To parse is แยกวิเคราะห์, as in “การแยกวิเคราะห์ YAML”, and to evaluate is ประเมินค่า: the three never share a word.
- Configuration, a configuration file or the workspace configuration, is การกำหนดค่า, and configured is “ที่กำหนดค่าไว้”. A setting is การตั้งค่า, and to seed or to initialise, as `aggrega config init` does, is “เริ่มต้น”.
- A marker in any sense (a deprecation marker, a withdrawal marker, a marker file, the literal marker `schema: inherited`, a root marker) is เครื่องหมาย: “เครื่องหมายการเลิกใช้”. แฟล็ก is only a flag and สัญญาณ is only a signal, so neither is ever a marker. A deprecation notice is “ประกาศการเลิกใช้”, and deprecated is เลิกใช้แล้ว; withdrawal and retracted, in plain text, are การถอน and “ถูกถอนแล้ว”.
- An exit code is รหัสการออก, and an exit status is สถานะการออก: the two stay apart on every page.
- A dry run is “การทดลองรัน”.
- The plugin trust record is บันทึกความเชื่อถือ (“บันทึกความเชื่อถือของปลั๊กอิน”), and a lockfile is “ไฟล์ล็อก”.
- A gate, a check that halts a build (the publish gate, a verdict-role plugin), is ด่านตรวจ, and the publish gate is “ด่านตรวจการเผยแพร่”. A gateway, an AI gateway or an API gateway, is “เกตเวย์”. The two never share a word. A verdict is “คำตัดสิน”.
- The Wasm host is โฮสต์ and the Wasm guest is เกสต์, in the singular and the plural: “โมดูลเกสต์”. Never “แขก”.
- A dispatch group is “กลุ่มการกระจายงาน”.
- Provenance, said of where a value, a label, a file or a key came from, is ที่มา (“ป้ายกำกับที่มา”, “ที่มาของ `publishedAt`”). Never ซอร์ส, which is a source.
- The head of a printed diagnostic, the bracketed part that carries the category and the short code, is ส่วนหัว (“ส่วนหัวของการวินิจฉัย”). An HTTP header or a header of a file is “เฮดเดอร์”. The two never share a word.
- A finding, what a check or a build reports, is ข้อค้นพบ, never หมายเหตุ, which is a note.
- Failure, as a noun, is ความล้มเหลว: “ความล้มเหลวในการหาค่า”. To fail is “ล้มเหลว”.
- A mandate, said of a presence mandate, is ข้อบังคับ: “ข้อบังคับให้มีอยู่”.
- A cascade, said of a layered lookup (the plugin cascade, the catalog cascade, the configuration cascade), is การไล่ลำดับชั้น: “การไล่ลำดับชั้นของปลั๊กอิน”. Cascading Annotations stays as pinned above.
- Drift, said of a lockfile, a convention or a name, is “ความคลาดเคลื่อน”.
- To fill, said of what fills a slot, is “เติม”.
- A template, a Go template or a values template, is เทมเพลต: “เทมเพลต `values`”.
- Structured, said of a tree, an object, a map or a value, is ที่มีโครงสร้าง: “ออบเจ็กต์ที่มีโครงสร้าง”. Structural, as in a structural schema, is “เชิงโครงสร้าง”.
- Sourced, said of an input kind, an input mode, a path or a template, is แบบอิงซอร์ส: “โหมดแบบอิงซอร์ส”, “Recipe แบบอิงซอร์ส”, in a title and in the name of a mode too. The synthesized input kind is แบบสังเคราะห์ in the same sentences, and a synthesized harness, Aggregate or Release that Aggrega builds itself is “ที่สังเคราะห์ขึ้น”.
- A fact, said of what a provider reports or a template reads, is “ข้อเท็จจริง”.
- A kit, said of the plugin development kit and of a language's kit, is ชุดเครื่องมือ; the whole name is “ชุดพัฒนาปลั๊กอิน”: “ตัวอย่างในชุดเครื่องมือ Go”.
- A callback, said of the source callbacks a guest reads through, is คอลแบ็ก (“ฟังก์ชันคอลแบ็ก”).
- An export, said of a plugin's ABI export, is เอ็กซ์พอร์ต: “ชื่อเอ็กซ์พอร์ต”. To emit is ส่งออก, so ส่งออก never stands for an ABI export.
- A controller, said of an ingress controller, a gateway controller or any process that reconciles a resource and is not a Kubernetes Operator, is คอนโทรลเลอร์: “คอนโทรลเลอร์ Ingress”.
- A hyphen, said of the character, is ยัติภังค์; an underscore is ขีดล่าง, a dot is จุด and a slash is “เครื่องหมายทับ”.
- Tagging, said of the built-in tagging plugins and of the selector tagger, is การติดแท็ก: “ปลั๊กอินติดแท็กในตัว”. A label is ป้ายกำกับ, never แท็ก, and a marker is เครื่องหมาย, never “แท็ก”.
- Markings, said of what a declaration of sensitivity puts on a value, is “การทำเครื่องหมาย”.
- A selector is ตัวคัดเลือก, never ตัวเลือก, which is an option.
- A schema page writes its labels the same way on every page: the table header “| คุณสมบัติ | ชนิด | จำเป็น | คำอธิบาย |”, yes and no in the required column “ใช่” and “ไม่”, and in a description “ค่าเริ่มต้น:”, “ค่าที่อนุญาต:”, “รูปแบบ:”, “คีย์:”, “ค่าคงที่:”, “อย่างน้อย 1 รายการ” for at least 1 entry and “อย่างน้อย 1 อักขระ” for at least 1 character. The key rule is “คีย์: ตัวอักษร ตัวเลข ขีดล่าง หรือยัติภังค์ อย่างน้อย 1 ตัว ไม่อนุญาตให้มีจุด”.
- A sandbox is แซนด์บ็อกซ์ in every phrase (“แซนด์บ็อกซ์ปิดกั้นความสามารถนี้”). An air-gapped machine is “เครื่องที่แยกจากเครือข่าย”.
- A type word written in plain text in a type column is translated the same way on every page: string สตริง, boolean and bool บูลีน, object ออบเจ็กต์, array อาร์เรย์, map แมป, integer จำนวนเต็ม, number ตัวเลข; "map of string or object" is “แมปของสตริงหรือออบเจ็กต์”. A type written in inline code (`string[]`) stays as written.
- A bold run-in label that opens a paragraph (such as the heading of a feature list) is translated like any heading, also where it names a language or a tool: its Latin words stay, and the label's own words are Thai.
- A label an editor or a client shows on screen (a setting's name, a button, a menu item) stays in English exactly as the screen shows it, in the source's emphasis. VS Code's Command Palette, named in prose, stays Command Palette too.
- A status label in inline code stays as it is; in plain text it is translated.
- The words kept in Latin letters (pull, push, sync, lint, linter, sentinel, chart, shell, sidecar, vendored and the rest) are listed under English terms kept as they are, with how they stand as verbs.
- Cognitive, said of cognitive logic, cognitive load, a cognitive intent or a cognitive identity, is “ทางความคิด”: “ตรรกะทางความคิด”, “ภาระทางความคิด”. Never เชิงปัญญา nor “การรับรู้”.
- Physical reality, the Physical Reality of the `infra` pillar, is “ความจริงเชิงกายภาพ”. Never ความเป็นจริง as a second rendering.
- A boundary in the general sense (a trust boundary, a security boundary, a domain boundary, the ABI boundary), which is neither a Release's `boundaries` nor a scope, is เส้นแบ่ง: “เส้นแบ่งความไว้วางใจ”, “เส้นแบ่ง ABI”. แนวเขต stays the Release's `boundaries` and ขอบเขต stays scope.
- A primitive (a cloud primitive, a structural primitive, an operational primitive) is พริมิทีฟ†. Never พื้นฐาน, and never “โครงสร้างพื้นฐาน”, which is infrastructure.
- To target, said of a tool or Aggrega aiming at a format, a tool or a platform, is มุ่งเป้า (never เล็ง nor กำหนดเป้าหมาย as renderings).
- To interpolate, interpolation, said of values placed into a template or a string, is “แทนค่า”, “การแทนค่า”: “สตริงการแทนค่าของ Terraform”. Never แทรก, which is to inject.
- Core, said of the compiler's core, is แกน (“แกนของคอมไพเลอร์”); core compiler is “คอมไพเลอร์หลัก”. Never คอร์ nor แกนหลัก as renderings.
- Imperative, set against declarative, is “เชิงคำสั่ง”: “เครื่องมือเชิงคำสั่ง”, “คำสั่งเชิงคำสั่ง” for an imperative command. Never “แบบบังคับ”.
- A source, said in plain text (a Bicep source, a fetched source, source control), is ซอร์ส in Thai letters, never แหล่ง, ต้นทาง nor Latin source; source of truth is “แหล่งความจริง”.
- Control Inversion is “การกลับทิศการควบคุม” and Dependency Inversion is “การกลับทิศการพึ่งพา”, translated everywhere, in running text and in an emphasised phrase alike.
- AOT Purity is “ความบริสุทธิ์แบบ AOT”, translated in a heading too, with the English in parentheses at a page's first occurrence.
- Conway's Law is “กฎของคอนเวย์”, with “(Conway's Law)” in parentheses at a page's first occurrence.
- A persona is “กลุ่มผู้ใช้เชิงหน้าที่”.
- Deterministic is “กำหนดแน่นอน”: “เอาต์พุตที่กำหนดแน่นอน”, “อย่างกำหนดแน่นอน”, “แบบกำหนดแน่นอน”; deterministic as a noun is “ความกำหนดแน่นอน”.
- A source-of-solution label "The Solution:" opening a paragraph is “ทางออก:” and "The Problem:" is “ปัญหา:”.
- Resource Generation, said of the FeatureRecipe section, is “การสร้างทรัพยากร”, with the English at a page's first occurrence.
- A vault, a secret store such as HashiCorp Vault, stays vault in Latin letters, in every phrase.
- A vector store, a store of vectors, is “ที่จัดเก็บเวกเตอร์”, never ที่เก็บ, which is a repository.
- Cloud-native is “คลาวด์เนทีฟ”.
- language server, the editor's language server: language server, in Latin letters, and a bare "server" is เซิร์ฟเวอร์, never เซิร์ฟเวอร์ภาษา for language server
- hover, the editor's hover: การวางเมาส์ for hover
- completion, the editor's code completion: การเติมโค้ดอัตโนมัติ for completion
- tooltip: ทูลทิป for tooltip
- preview build: บิลด์พรีวิว, and preview alone is พรีวิว, never บิลด์ตัวอย่าง for preview build
- flow, said of the buttons of a panel: ลำดับของปุ่ม for the flow of buttons
- shape, said of a schema, an entity or a drawing: รูปทรง, never รูปร่าง for shape
- record, said of registry records, withdrawal records and import records: บันทึก, never ระเบียน for record
- concern, said of a role's concern and of the roles' concerns: ความรับผิดชอบ, the word of Separation of Concerns, never ข้อกังวล for concern
- variant, said of a variant of one entity: แบบ, never ตัวแปร for variant
- caret, the fold arrow of a step or of Build: เครื่องหมายคาเร็ต, and chevron is เชฟรอน for chevron
- credential store, said of the shared store of credentials: ที่จัดเก็บข้อมูลรับรอง, never ที่เก็บ (a repository) for store
- preference, said of a user preference: ค่ากำหนด, and a setting stays การตั้งค่า for setting
- picker or chooser, said of a menu that offers a choice: เมนูเลือก, since ตัวเลือก is an option, for picker
- redraw and re-render, said of a graph or a panel drawn again: วาดใหม่ for redraw
- ending, said of the closing message of an operation: ข้อความตอนจบ for ending
- output channel: ช่องเอาต์พุต for output channel
- status bar: แถบสถานะ for status bar
- notification: การแจ้งเตือน for notification
- welcome page: หน้าต้อนรับ for welcome page
- topology: โทโพโลยี for topology
- subsystem: ระบบย่อย for subsystem
- wave, a sync wave: เวฟ for wave
- applicability, said of a Feature's declared applicability: ขอบข่ายการใช้งาน for applicability
- listener, the process that accepts network connections: ตัวรับฟัง for listener, never the Latin word
- transport, stdio or http, the way a server speaks: ทรานสปอร์ต for transport, never the Latin word
- endpoint, a network address that serves requests: ปลายทาง for endpoint, never the Latin word
- MCP client: ไคลเอนต์ MCP for MCP client, never the Latin words MCP client
- announce, said of a tool a server offers in its tool list: แจ้ง for announce, and an announced tool is เครื่องมือที่แจ้ง
- kind, said of the reach kinds none, workspace, registry and machine, and of entity kinds: ประเภท for kind, never ชนิด, which is type
- reach, the noun for how far an operation's effects travel: ระยะการเข้าถึง for reach, never ขอบเขต, which is scope
- withheld and kept back, said of a value an answer omits: เก็บไว้ไม่บอก for kept back, never กันไว้ nor กักไว้
- list, as a noun: รายการ for list, and to list is ระบุ or แสดงรายการ, never the loanword ลิสต์
- candidate, said of what may fill a slot or attach to a node: รายการที่เข้าเกณฑ์ for candidate
- pin, as a verb or noun (a Release pins content): ปักหมุด for pin
- relative to, said of a path or a name: เทียบกับ for relative to, and a relative path is เส้นทางสัมพัทธ์
- bundle, the desktop bundle: ชุดแอป for desktop bundle, and the documentation bundle is ชุดเอกสารประกอบ
- executable, the `aggrega` program file: ไฟล์ปฏิบัติการ for executable
- challenge, the HTTP authentication challenge: challenge, in Latin letters
- handshake, the protocol initialize exchange: handshake, in Latin letters
- envelope, the error or entity envelope: envelope, in Latin letters
- origin, the browser Origin value: origin, in Latin letters
- issuer, the token issuer address: issuer, in Latin letters
- the number words one, two and three in a count the source writes as a word: the Thai number word (สองกลุ่ม, สามฟิลด์), never a digit, as in two groups
- signing, said of signing an artifact or a reference: การลงลายเซ็น, never การลงนาม, for signing
- keyless, said of keyless signing: keyless, in Latin letters, as in “การลงลายเซ็นแบบ keyless”, and keyed signing is “การลงลายเซ็นแบบมีคีย์” for keyed
- skill, the assistant skill: skill, in Latin letters, never สกิล, for skill
- closure, a Release's dependency closure: closure, in Latin letters, for closure
- assertion, a Recipe or FeatureRecipe assertion: assertion, in Latin letters, for assertion
- harness, the synthesized harness a single entity is validated in: harness, in Latin letters, for harness
- bundle, a Sigstore signature bundle: bundle, in Latin letters, for signature bundle
- frontmatter, the header block of a Markdown file: frontmatter, in Latin letters, for frontmatter
- method, a protocol method of the daemon: เมธอด, never เมท็อด, for method
- schema envelope: “envelope ของสคีมา”, with envelope in Latin letters, for schema envelope
- ambient, said of an ambient OIDC endpoint: ตามสภาพแวดล้อม, never โดยรอบ, for ambient
- exit non-zero: “ออกด้วยรหัสการออกที่ไม่ใช่ศูนย์” for exits non-zero
- held to, said of a plugin held to its recorded digest: กำกับด้วย, never ยึด, for held to
- a closing colon, where a sentence introduces a code block, a list or a table: the colon stays directly after the last Thai word, for closing colon
- fix, said as a noun of what must change to resolve a failure ("the fix is in the Release YAML"): ทางแก้ for fix
- frame, a diagnostic's frame, and framed (a nested context frame, an entity file framed by a check): เฟรม, never ห่อ (wrapped) for framed
- raise, said of a condition or a failure a plugin or a document raises: ยกขึ้น for raised
- ship, said of what a catalog or a build delivers: จัดส่ง, never ส่งออก (emit) nor ส่งผ่าน (pipe) for ship
- overlay, a source overlay as a noun: ส่วนซ้อนทับ, and to overlay is ซ้อนทับ for overlay
- probe, a health probe: โพรบ for probe
- predicate, a `validate:` predicate: predicate in Latin letters, never เพรดิเคต for predicate
- cycle, a loop in a graph or in YAML anchors: วัฏจักร for cycle
- replica, a replica of a workload: เรพลิกา for replica
- placeholder, what stands in for a missing token: ตัวยึดตำแหน่ง for placeholder
- fragment, a piece of a template, a CloudFormation or ARM document: ส่วนย่อย for fragment
- contribute, said of a module that contributes a component or of a stack contributor: มีส่วนร่วม for contribute
- walk, said of a program that walks a tree, a chain or a document: ไล่ for walk
- volume, a container or Compose volume: วอลุ่ม for volume
- peer, a peer container or a peer's address: เพียร์ for peer
- sibling, said of failures at the same level: ระดับเดียวกัน for sibling
- acquisition, said of fetching an artifact from a registry: การได้มาซึ่ง for acquisition
- root, a root of the template render context (`.context`, `.values`, `.workload`) and the output root of a build: รูท for root, never ราก
- allowlist, a variable or field allowlist of a template surface: รายการอนุญาต for allowlist, never รายการที่อนุญาต
- id, a step id or an instance id: id, in Latin letters, as the source writes it, never รหัส for id
- host, said of the component a FeatureRecipe attachment is attached to: ส่วนประกอบที่รับการแนบ for host component, never โฮสต์, which is the Wasm host
- arrangement, said of a way pieces are laid out or combined: การจัดวาง for arrangement
- reproducible, said of images and builds: ที่สร้างซ้ำได้ for reproducible, never ที่ทำซ้ำได้
- backup, as a noun: การสำรอง for backup, never การสำรองข้อมูล
- bridge, said of the compose bridge and of a network bridge: บริดจ์ for bridge, never สะพานเชื่อม nor สะพาน
- checkout, a working copy of a repository: เช็กเอาต์ for checkout, as in "สำเนาที่เช็กเอาต์", never the Latin word checkout
- tree, an output tree or a rendered tree of files: ทรี for tree, never ไดเรกทอรีเอาต์พุต for output tree
- To realize, said of a FeatureRecipe that turns an attachment or a Feature into concrete resources, is ทำให้เป็นรูปธรรม, and realization is “การทำให้เป็นรูปธรรม”. Never ทำให้เป็นจริง nor เรียลไลซ์, and never อิมพลีเมนต์, which is to implement. `realization` in inline code stays as written.
- A guard, said of a guard condition or a guard clause, is guard in Latin letters, as predicate, assertion and closure are. Never “ตัวป้องกัน”; a gate is ด่านตรวจ and a guardrail is “ราวกั้น”.
- An importer, said of an importer plugin, is ตัวนำเข้า (“ตัวนำเข้า MCP”, “ปลั๊กอินตัวนำเข้า”), as a parser is “ตัวแยกวิเคราะห์”. An import, the act, is “การนำเข้า”.
- A draft, as a noun (what an import writes), is ฉบับร่าง, and to draft is ร่าง: “ฉบับร่างของ Release”, “Component ที่ร่างขึ้น”. Never “แบบร่าง”.
- A datastore, said of a store that holds data, is “ที่จัดเก็บข้อมูล”, as a vector store is “ที่จัดเก็บเวกเตอร์” and a credential store is “ที่จัดเก็บข้อมูลรับรอง”. A database is ฐานข้อมูล and a repository is ที่เก็บ, so neither is a datastore.
- A leaf, said of the end value of a dotted path in a payload or a schema, is ลีฟ† (“ลีฟที่ละเอียดอ่อน”, “เส้นทางลีฟ”). Never “ใบ”.
- A payload, said of the document a socket carries, is เพย์โหลด† (“ชนิดเพย์โหลด”, “เอกสารเพย์โหลด”), never the Latin word payload.
- Sensitive, said of a value, a leaf or a slot a declaration marks, is ละเอียดอ่อน (“ค่าที่ประกาศว่าละเอียดอ่อน”, “ความละเอียดอ่อน”). Never “อ่อนไหว”.
- A pointer, said of a memory address a guest passes, is “ตัวชี้”. Never “พอยน์เตอร์”.
- In-band, said of a failure or a reply carried in the same channel, is ในสายหลัก, and out-of-band is “นอกสายหลัก”. Never “ในแบนด์” nor “นอกแถบ”.
- Static analysis is “การวิเคราะห์แบบสถิต”, and statically linked is “ลิงก์แบบสถิต”. Never “การวิเคราะห์สถิต”.
- Verbatim is ตามตัวอักษร (“ส่งให้เกสต์ตามตัวอักษร”); as written is “ตามที่เขียน”. The two never share a rendering.
- Inline, said of a value written in the body of a document, is “แบบอินไลน์”. Never ในบรรทัด, which is in a line.
- A contributor takes the classifier ราย (“ผู้มีส่วนร่วมสองราย”), never “รายการ”. A contribution, the noun, is “ส่วนที่เพิ่มเข้ามา”, and to contribute is “มีส่วนร่วม”.
- A crossing, said of one render call a node makes across the socket (a source render, a workload synthesis, an artifacts placement), is “การเรียกข้ามซ็อกเก็ต”: “เรนเดอร์ได้ในการเรียกข้ามซ็อกเก็ตหลายครั้ง”.
- To encode and to decode, said of CBOR or a payload, are เข้ารหัส and ถอดรหัส, and an entry point is “จุดเข้า”: “จุดเข้าเข้ารหัสและถอดรหัส”. Never the Latin words encode and decode in running text.
- To marshal, said of turning a value into a payload to send, stays marshal in Latin letters.
- A space, said of the name space inside which a guest's derived names must be distinct, and a key space, stay space in Latin letters: “space ของคีย์”. Never “ปริภูมิ”. A namespace is “เนมสเปซ”.
- To dispatch, said of the compiler or the host routing a step or a role to a plugin, is กระจายงาน (“กระจายงานให้ปลั๊กอิน”). Never “ส่งงาน”.
- Fixed, said of an order or a set, is “คงที่”: “ลำดับคงที่”. แน่นอน stays in “กำหนดแน่นอน”, which is deterministic, and is never fixed.
- A core importer, an importer the compiler itself ships, is “ตัวนำเข้าแกน”, built from the pinned importer and core: the compiler's core importers are “ตัวนำเข้าแกนของคอมไพเลอร์”. Never “ตัวนำเข้าหลัก” nor “ตัวนำเข้าคอร์”.
- A mental model is “โมเดลทางความคิด”, from โมเดล and the pinned ทางความคิด for cognitive. Never “แบบจำลอง” nor “โมเดลเชิงปัญญา”.
- Two-Part Plugin Principle, a capitalized named principle, is translated as AOT Purity and Conway's Law are, with the glossary term Plugin in Latin letters: “หลักการ Plugin สองส่วน”, in a heading too, with “(Two-Part Plugin Principle)” in parentheses at a page's first occurrence.
- A boundary of a Release (a boundary attachment, a boundary annotation, a boundary path, a cross-boundary reference, a stack's or a template's boundary, and the word boundary in prose about a Release's `boundaries`) is “แนวเขต”. A boundary in the general sense (an ahead-of-time, trust, security, ABI or domain boundary) is “เส้นแบ่ง”: “เส้นแบ่งของการคอมไพล์ล่วงหน้า (ahead-of-time)”. The two never share a word, ขอบเขต stays scope, and the field name `boundaries` is a code span that stays as written. The spelled-out ahead-of-time is “ล่วงหน้า”.
- A link whose text is a page or heading name (an entity's authoring reference page, an architecture page, a heading) takes that page's Thai title or heading exactly as the guide and notes prescribe: the Thai alone, or on an error or warnings page the English first with the Thai in parentheses. A translator who cannot see that Thai title copies the title the task supplies and never invents a Thai name. A link text that is a file name or a path (`well-known-annotations.md`, `../templates/rendered-resource-names.md`) is not a title and stays as the source writes it.
- A claim, the noun, said of what a provider or a plugin declares about what it supports or serves, is “ข้อกล่าวอ้าง”: “ข้อกล่าวอ้างการรองรับ”. To claim, said of an input kind or a render path, is “อ้างสิทธิ์”. Never “คำกล่าวอ้าง” as a second noun.
- A well-known annotation, said of the platform-native `aggrega.ai/` keys a provider reads, is “คำอธิบายประกอบที่รู้จัก”. Never “ที่รู้จักกันดี”.
- Prose guidance, said of the authoring pages a schema page points to, is “คำแนะนำเชิงบรรยาย”. Never “เชิงอธิบาย”.
- Free-form, said of the free-form pillars and of a free-form description, is “รูปแบบอิสระ”: “เสาหลักรูปแบบอิสระ”, “คำอธิบายรูปแบบอิสระ”. Fixed-shape stays “รูปทรงคงที่”.
- An invariant, in any sense (an architectural invariant, an implementation invariant, the Aggregate-as-Authoring-Surface invariant), is “ข้อคงที่”. Never “ความไม่แปรเปลี่ยน”.
- To derive, derived, said of a value, a name or a set obtained from another, is “ได้มา”: “ตัวระบุที่ได้มา”, “โหนด IR ที่ได้มา”. Never สืบทอด, which is inherit, nor หาค่า, which is resolve.
- A posture, said of a single authoring mode or of opaque metadata, is “ท่าที”. Never จุดยืน, which the guide keeps for stance in unopinionated.
- A knob, said of the sizing knobs the Release supplies, is “ตัวปรับ”: “ตัวปรับขนาด”. Never “ปุ่ม”.
- To supply and supplied, said of what a Release, a lockfile or a file provides, is “จัดหา”: “ที่ Release จัดหา”. Never “จัดให้” nor a bare “ให้”.
- An alias, said of a connection alias, a chart alias or a dependency alias, is “นามแฝง”; a flag's short alias or shorthand is “ชื่อย่อ”. Never the Latin alias.
- A subkey is “คีย์ย่อย”, never the Latin word subkey.
- The sync wave and a sync-wave annotation are “เวฟ” and “คำอธิบายประกอบเวฟ”, never “เวฟการซิงค์” nor “เวฟ sync”.
- A plugin type is “ประเภทปลั๊กอิน”, a plugin of one type is “ปลั๊กอิน” followed by the type's Thai name, “ปลั๊กอินผู้ให้บริการ”, “ปลั๊กอินตัวนำเข้า”, “ปลั๊กอินตัวแยกวิเคราะห์”, “ปลั๊กอินขั้นตอนไปป์ไลน์”, and linter, governance and cli are written in Latin letters after “ปลั๊กอิน”. Never “ปลั๊กอินแบบ pipeline-step” nor the Latin parser. The socket's type is “ชนิดซ็อกเก็ต”.
- Explicit, said of an explicit `null`, a binding or a capability, is “ชัดแจ้ง”; a clear error or diagnostic, meaning one that names what to fix, is “ชัดเจน”. The two never share a word.
- The title of a schema page, “Aggrega X (Kind) schema”, is “สคีมา” followed by the Thai name and then Aggrega: “สคีมาแค็ตตาล็อก Aggrega (Component)”, “สคีมาไฟล์ล็อกการพึ่งพา Aggrega (Manifest)”, “สคีมาแกน Aggrega (Plugin)”, “สคีมาฐานโครงสร้างพื้นฐาน Aggrega (FeatureRecipe)”. The English name is not left in Latin letters.
- A dictionary, said of a flat dictionary the compiler reads, is “แมป”. Never “ดิกชันนารี”.
- A minimum-version floor is “ขั้นต่ำของเวอร์ชัน”, never ขีดล่าง, which is an underscore. To assert a version, said of a consumer naming a minimum, is “ระบุ”, never ยืนยัน, which is to verify.
- A consumer in the Aggrega sense (a component or a Recipe that reads what a producer publishes) is ผู้บริโภค and a producer is ผู้ผลิต; a consuming component is “ส่วนประกอบผู้บริโภค” and the consumer's side is “ฝั่งผู้บริโภค”. Never ผู้ใช้, which is a user, nor “ส่วนประกอบที่บริโภค”.
- A site, said of where a template is evaluated (a template site, an evaluation site), is ตำแหน่ง: “ตำแหน่งเทมเพลต”, “ความพร้อมใช้งานรายตำแหน่ง”. Never ไซต์
- self-inject, the component-level inject, stays in Latin letters: “การหาค่า self-inject”, “เทมเพลต `value:` ของ self-inject”. The inject pipe is “ท่อ inject” and inject mapping is “การแมป inject”, each with inject in Latin letters as in “ไฮเดรชันของ inject”. Never “การแทรกตัวเอง”, “ท่อการแทรก” nor “การแมปการแทรก”.
- A bucket, said of the three annotation buckets, is กลุ่ม (“สามกลุ่ม”). Never the loanword บักเก็ต
- Quotation marks, said of the characters “ ” or " ", are “เครื่องหมายอัญประกาศ”, and double-quoted is “ที่ใช้เครื่องหมายอัญประกาศคู่”. Never “เครื่องหมายคำพูด” nor the bare อัญประกาศ
- Downstream, said of later template surfaces or later stages, is ปลายน้ำ (“พื้นผิวเทมเพลตค่าปลายน้ำ”). Never ด้านล่าง nor “ขั้นถัดไป”.
- A phase, said of the phases of a check or a compilation, is ช่วง (“ทั้งสองช่วงของ assertion”). Never เฟส
- Interception, said of the inject pipe or a mapping that rewrites it, is “การสกัดกั้น” (“ท่อที่กำลังถูกสกัดกั้น”). Never “ดัก”.
- To fold, said of a name folded onto letters and digits or two ids folded onto one name, is พับ (“พับชื่อ”, “พับลงเป็นชื่อเดียวกัน”). Never “ลดเหลือ” nor “แปลง”.
- A worked example, a worked pair, is “ตัวอย่างที่แสดงวิธีทำ”. Never “ตัวอย่างใช้งานจริง” nor “ที่ทำให้ดู”.
- A missing key, said of the missing-key policy and a key a map does not hold, is “คีย์ที่หายไป”. Never “คีย์ที่ขาด”.
- A projection, said of the compiler's join projection and a render-context projection, is “การฉาย”. Never “การฉายภาพ”.
- Emptiness, said of the empty value a template reads, is “ความว่างเปล่า”, in a heading and a link alike. Never “ความว่าง” alone.
- A base Recipe is “Recipe พื้นฐาน” and base rendering is “การเรนเดอร์พื้นฐาน”. Never ฐาน (ฐานเปล่า stays the pinned Naked Base).
- Self-contained, said of a context or a template, is “บรรจุในตัว”: “ข้อคงที่การบรรจุในตัว”. Never “ครบในตัว”.
- Custom, said of a custom mechanism, a custom helper or custom entries, is “แบบกำหนดเอง”: “กลไกแบบกำหนดเอง”. Never “ที่กำหนดเอง” for these.
- Load-bearing, said of a distinction, a split or an order, is สำคัญ; never “รับน้ำหนัก” nor “สำคัญเชิงโครงสร้าง”, which is structural.
- Escape, said of escaping braces or a character, is หลีก and “การหลีก”: “แบบหลีกอักขระ”. Never the Latin word escape.
- Exact, said of a decimal form or a spelling, is “ตรงทุกประการ”. แน่นอน stays in “กำหนดแน่นอน”.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

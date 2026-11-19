# العربية

Translate into Modern Standard Arabic. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Modern Standard Arabic, technical and plain, as Arabic software documentation is written: precise and concise, with no emphasis the source does not have.
- Address the reader in the second person singular wherever the English says "you", in the masculine form Arabic technical writing uses for every reader: "يمكنك". An instruction takes the imperative: "شغِّل الأمر" and "أضِف المفتاح". The verb carries the person, so write the pronoun "أنت" only where the source stresses "you".
- No colloquial or dialect form: write the terms established in Arabic software writing, as the vocabulary below gives them.
- Write each rendering exactly as this guide writes it, its diacritics included; elsewhere add a diacritic only where a word would be misread without it.

## Punctuation, digits and quotation marks

- Arabic text takes the Arabic comma `،`, the Arabic semicolon `؛` and the Arabic question mark `؟`; a sentence ends with the full stop `.`. Inline code, a URL and an English term keep their own punctuation.
- A quoted phrase takes the quotation marks `« »`: «هكذا».
- Parentheses are the ordinary ( ), with a space before the opening one and none inside; an English name given in parentheses takes them too: البنية التحتية الشبحية (Ghost Infrastructure).
- Numbers take Western digits (0–9), always: never the Eastern Arabic-Indic digits, nor the Persian ones.
- Inline code is never put in quotation marks: it keeps its backticks.
- Letters are the ones Modern Standard Arabic writes (ي، ك، ة، ه): never the Persian or Urdu letter forms (Farsi yeh, keheh, heh goal, heh with yeh above, yeh barree), and never a presentation form. Text is stored as base letters, and the font joins them.
- Never the tatweel, the stroke that stretches a joined letter: a word is written with its letters alone.
- Never a direction mark or a bidi control character of any kind (the left-to-right mark, the right-to-left mark, the Arabic letter mark, an embedding, an override, an isolate): the site lays code out.

## Direction

- An arrow `→` between words or code spans that means "becomes", "then" or "leads to" is written `←` in Arabic text; the two sides keep the source's order.
- An arrow inside inline code or a code block is code: it stays as the source writes it.
- A sentence may begin with a Latin term or a code span where Arabic grammar puts it there; the page handles its direction. Never reorder a sentence to avoid it, and never add a mark to steer it.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never written in Arabic letters: "كل Component" and "الكيان Release".
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where Arabic grammar would choose another number, such as a dual or the singular after a number above ten.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.
- No Arabic affix is joined to a Latin term or a code span: never the definite article "ال" before it, never a one-letter preposition or conjunction (ب، ل، ك، ف), never a suffix. Write a noun before the term instead ("ملف YAML" and "الكيان Release" and "بالأمر `aggrega build`"), or a preposition that stands as a word of its own (في، من، إلى، على، عن، مع).
- The conjunction "و" stands as a word of its own before a Latin term or a code span: "Components و Features".
- A kept term with no Arabic noun before it takes masculine agreement: "كل Release مستقل". After an Arabic noun, agreement follows that noun.

## The qualifiers

| Qualifier | Arabic | Note |
|---|---|---|
| `social contract` | العقد الاجتماعي | plural: العقود الاجتماعية |
| `best practice` | أفضل ممارسة | plural: أفضل الممارسات. Never "قاعدة" (a rule) nor "متطلب" (a requirement). |
| `escape hatch` | منفذ الطوارئ | plural: منافذ الطوارئ. Never "باب خلفي" (it reads as a back door) nor "ثغرة" (it reads as a loophole). |
| `convention` | عُرف | as in "عُرف التسمية"; plural: أعراف. Never "قاعدة". |
| `unopinionated` | لا يفرض رأيًا | |
| `content-neutral` | محايد تجاه المحتوى | |
| `agnostic to` | لا يرتبط ب | the preposition joined to its object, as in "لا يرتبط بالأعراف" and "لا يرتبط بموفِّر بعينه"; before a Latin term a noun comes between: "لا يرتبط بمنصة Kubernetes" |

## Vocabulary

One rendering for each word, on every page.

Files and data:

| English | Arabic |
|---|---|
| file | ملف |
| folder | مجلد |
| directory | دليل |
| catalog | الكتالوج |
| documentation | التوثيق |
| document | مستند |
| data | بيانات |
| database | قاعدة بيانات |
| information | معلومات |
| message | رسالة |
| path | مسار |
| log | سجل |
| cache | ذاكرة التخزين المؤقت |
| binary | ملف ثنائي |
| configuration file | ملف التكوين |

Code:

| English | Arabic |
|---|---|
| software | برمجيات |
| hardware | عتاد |
| program | برنامج |
| code | الشيفرة البرمجية |
| source code | الشيفرة المصدرية |
| string | سلسلة نصية |
| character | حرف |
| variable | متغيّر |
| function | دالة |
| parameter | مُعامِل |
| argument | وسيطة |
| type | نوع |
| array | مصفوفة |
| object | كائن |
| module | وحدة |
| package | حزمة |
| library | مكتبة |
| value | قيمة |
| schema | مخطط |
| entity | كيان |
| entity kind | نوع الكيان |
| to implement | تنفيذ |
| to optimize | تحسين |
| thread | مؤشر ترابط |
| process | عملية |
| queue | قائمة انتظار |
| dependency | تبعية |
| version, and a release of the product | إصدار |

Build and run:

| English | Arabic |
|---|---|
| to run, to execute | تشغيل |
| to call | استدعاء |
| to create | إنشاء |
| to build, a build | بناء |
| to compile | التحويل البرمجي |
| compiler | المحوِّل البرمجي |
| to render | تصيير |
| to generate | توليد |
| to deploy | نشر |
| to publish | طرح |
| to apply | تطبيق |
| cluster | عنقود |
| container | حاوية |
| container image | صورة الحاوية |
| repository | مستودع |
| workspace | مساحة العمل |
| local machine | الجهاز المحلي |
| remote | بعيد |
| command line | سطر الأوامر |
| terminal | الطرفية |
| command | أمر |
| flag | علامة |
| option | خيار |
| default | افتراضي |
| to configure, configuration | تكوين |
| settings | إعدادات |
| template | قالب |
| example | مثال |
| project | مشروع |
| user | مستخدم |
| to support | دعم |
| interface | واجهة |

To deploy and to publish are two verbs: a sentence that publishes but never deploys keeps both.

Network:

| English | Arabic |
|---|---|
| server | خادم |
| client | عميل |
| network | شبكة |
| network address | عنوان |
| port | منفذ |
| protocol | بروتوكول |
| request | طلب |
| response | استجابة |
| socket | مقبس |

Security:

| English | Arabic |
|---|---|
| key | مفتاح |
| signature | توقيع |
| certificate | شهادة |
| credential | بيانات الاعتماد |
| secret | سرّ |
| an access token | رمز مميز |
| identity | هوية |
| digest | ملخّص |
| hash | تجزئة |
| policy | سياسة |

An access token (a credential or bearer token) is رمز مميز. An LLM token (billing, budget, count) and a lexical token stay token, in Latin letters.

The product's nouns:

| English | Arabic |
|---|---|
| a plugin, in plain text | مكوِّن إضافي |
| an editor extension | امتداد |
| a provider, in plain text | موفِّر |
| a component, in plain text | مكوِّن |
| annotation | تعليق توضيحي |
| comment | تعليق |
| label | تسمية |
| AI assistant | مساعد الذكاء الاصطناعي |

Each of these is the ordinary word, written in lowercase in the source; the same word capitalized (Workload, Feature, Manifest, Provider, Component, Plugin, Release) is the glossary's term and stays in Latin letters.

## Tables

- A table row is صف and a column is عمود. A line of text or code is سطر (never صف).
- A table keeps its columns in the source's order: the page lays the table out from right to left.

## Markdown

- A hard line break inside a segment stays a line break, exactly where the source has it.

## Recurring terms

- A kept term keeps the source's number inside a compound too.
- The four domains are always translated, with the English in parentheses at a page's first occurrence, as in "المطوِّر (Developer)":
  - Developer: المطوِّر
  - Platform Architect: مهندس المنصة المعماري
  - Platform Ops: عمليات المنصة
  - Platform Operator: مشغِّل المنصة
- The named mechanisms are written the same way:
  - Ghost Infrastructure: البنية التحتية الشبحية
  - Loud Guardrails: الحواجز الصريحة
  - String Pipe: أنبوب السلاسل النصية
  - Parameter Hoisting: رفع المُعامِلات
- More named mechanisms are translated with the English at a page's first occurrence:
  - Naked Base: الأساس المجرَّد
  - Flavored Edges: الحواف المنكَّهة
  - Enterprise Exception: استثناء المؤسسات
  - Zero-Port: صفر منافذ
  - Injection Contract: عقد الحقن
  - Separation of Concerns: فصل الاهتمامات
  - Cascading Annotations: التعليقات التوضيحية المتتالية
- The 5-Tier Onion Model is "نموذج البصلة من 5 طبقات (5-Tier Onion Model)" at a page's first occurrence, with Western digits.
- Loud Guardrails is الحواجز الصريحة only where the source says Loud; a plain guardrail is حاجز (plural: حواجز).
- Ops outside the Platform Ops domain:
  - bare Ops: العمليات
  - an Ops team: فريق العمليات
  - an Ops engineer: مهندس العمليات
  - an Ops Recipe: Recipe العمليات
- عمليات المنصة is the Platform Ops domain only. Operational is تشغيلي (the Ops discipline alone is العمليات).
- To pipe, the String Pipe's verb, is تمرير (the verb يمرِّر); a pipe is أنبوب.
- `agnostic to` is the qualifier above. X-agnostic is "لا يرتبط ب" joined to X, as in provider-agnostic "لا يرتبط بموفِّر بعينه"; agnostic with no object is محايد (neutral), and never gains an object the source does not name.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Arabic in parentheses: "The provider does not support omits (لا يدعم الموفِّر omits)". One link text per target. The English keeps its inline code, and a capitalized glossary term inside the Arabic in parentheses stays in Latin letters, as anywhere else.
- An error heading's Arabic, the text inside its parentheses, is copied word for word into every quotation of that error name and every link to that heading.
- A heading is translated, and every link to it uses that heading's own translation word for word; a link never translates a heading anew.
- A link to a heading that is not on an error page uses the Arabic alone: its text is translated even where the source shows the heading verbatim, and also where it is a page title after a path prefix such as `arm →` (the part after the arrow; the arrow follows the rule under Direction).
- Overview, in a heading or a link, is نظرة عامة.
- A field name written in plain text (pluginType) stays as written inside translated error text.
- The label "How to fix:" is **طريقة الإصلاح:** at the start of its paragraph.
- Emitted message, emitted messages: الرسالة الصادرة، الرسائل الصادرة.
- A lowercase release or aggregate that names a Release or an Aggregate entity (the release resolves to, a release file, `--release <release>`, a sub-aggregate) is written as the entity's name in Latin letters, Release or Aggregate ("Aggregate فرعي"). إصدار is only a version or a release of the product, such as the compiler's.
- A lowercase plural of an entity name keeps its number: releases is Releases, and three releases is "ثلاثة Releases".
- A kept term keeps its plural after a numeral or a word of quantity: "ثلاثة Releases" and "عدة Recipes".
- A plural kept term stays plural wherever the source writes it, also when two are joined: "Components و Features".
- Lowercase workload, feature, manifest and operator are ordinary words, translated also inside a compound:
  - a workload: حمل العمل (plural: أحمال العمل)
  - a feature: ميزة
  - a manifest (a Kubernetes or OCI manifest): بيان
  - an operator, a person: مشغِّل
  - an operator in programming: عامل
  - a Kubernetes operator, a controller: Operator, in Latin letters
- A label an editor or a client shows on screen (a setting's name, a button, a menu item) stays in English exactly as the screen shows it, in the source's emphasis. VS Code's Command Palette named in prose is لوحة الأوامر (English only where the text quotes the English screen).
- A status label in inline code stays as it is; in plain text it is translated.
- These stay in Latin letters, as the source writes them:
  - pull and push, the `aggrega pull` and `aggrega push` operations, in prose too (a server pushing diagnostics is the ordinary verb يرسل)
  - sync, the import send mode (ordinary synchronising is مزامنة)
  - lint, the check, and linter
  - sentinel, an error sentinel
  - chart, a Helm chart
  - shell
  - sidecar
  - vendored, vendors and to vendor, in every form (a vendor, a company, is مورِّد)
  - pod, webhook, span, rail and jailbreak, and a headless Service
  - hub, the hub written lowercase
  - release, lowercase, for a Helm release (a deployed chart instance, a release name)
  - consumer, a Kong consumer (the Aggrega consumer is مستهلك)
  - token, a lowercase kind or schema token, besides the LLM and lexical token the vocabulary names
  - invalid-params, the protocol's error name (an invalid parameter is مُعامِل غير صالح)
  - Day-0, Day-1 and Day-2
  - stdin, stdout and stderr where the source writes them so (standard input, output and error written out are الإدخال القياسي، الإخراج القياسي، الخطأ القياسي)
  - an SSH agent, as written

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

# العربية

Translate into Modern Standard Arabic. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Modern Standard Arabic, technical and plain, as Arabic software documentation is written: precise and concise, with no emphasis the source does not have.
- Address the reader in the second person singular wherever the English says "you", in the masculine form Arabic technical writing uses for every reader: "يمكنك". An instruction takes the imperative: "شغِّل الأمر" and "أضِف المفتاح". The verb carries the person, so write the pronoun "أنت" only where the source stresses "you".
- No colloquial or dialect form: write the terms established in Arabic software writing, as the vocabulary below gives them.
- Write each rendering with the letters and diacritics this guide gives it, adding the article, the plural and the agreement the sentence needs (مكوِّن، المكوِّن، مكوِّنات); elsewhere add a diacritic only where a word would be misread without it.

## Punctuation, digits and quotation marks

- Arabic text takes the Arabic comma `،`, the Arabic semicolon `؛` and the Arabic question mark `؟`, also right after a Latin term or a code span inside an Arabic sentence: "Components، Features و Recipes". A sentence ends with the full stop `.`. Inline code, a URL and a name that holds its own punctuation (Node.js) keep it.
- A quoted phrase takes the quotation marks `« »`: «هكذا». A quotation inside it takes `“ ”`: «يطبع الأمر “تم” ثم ينتهي». A heading name quoted inside running Arabic text, in the English-first form or in Arabic alone, takes `« »` too, never straight double quotes; the straight double quotes that belong to a quoted English message stay as the source writes them.
- Parentheses are the ordinary ( ), with a space before the opening one and none inside; an English name given in parentheses takes them too: البنية التحتية الشبحية (Ghost Infrastructure).
- Numbers take Western digits (0–9), always: never the Eastern Arabic-Indic digits, nor the Persian ones.
- A number keeps the decimal point `.`, the thousands separator `,` and the percent sign `%` the source writes (21,867 and 99.9%): never the Arabic decimal separator, thousands separator or percent sign, and never the Arabic comma inside a number.
- Inline code is never put in quotation marks: it keeps its backticks.
- Letters are the ones Modern Standard Arabic writes (ي، ك، ة، ه): never the Persian or Urdu letter forms (Farsi yeh, keheh, heh goal, heh with yeh above, yeh barree), and never a presentation form. Text is stored as base letters, and the font joins them.
- Never the tatweel, the stroke that stretches a joined letter: a word is written with its letters alone.
- Never a direction mark or a bidi control character of any kind (the left-to-right mark, the right-to-left mark, the Arabic letter mark, an embedding, an override, an isolate): the site lays code out.

## Direction

- An arrow `→` between words or code spans that means "becomes", "then" or "leads to" is written `←` in Arabic text; the two sides keep the source's order.
- Where the nearest word on each side of the arrow, code spans aside, is in Latin letters (two kept terms, or a menu path of screen labels kept in English), a right-to-left page shows `←` pointing back at the first word, so the meaning reads reversed. Write the arrow's meaning there as an Arabic word, the two sides in the source's order: يصبح (becomes), ثم (then, and between the steps of a menu path), يؤدي إلى (leads to). The source's `**Settings → AI → MCP Servers**` is "**Settings ثم AI ثم MCP Servers**".
- An arrow inside inline code or a code block is code: it stays as the source writes it.
- A sentence may begin with a Latin term or a code span where Arabic grammar puts it there; the page handles its direction. Never reorder a sentence to avoid it, and never add a mark to steer it.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never written in Arabic letters: "كل Component" and "الكيان Release".
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where Arabic grammar would choose another number, such as a dual or the singular after a number above ten.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.
- No Arabic affix is joined to a Latin term or a code span: never the definite article "ال" before it, never a one-letter preposition or conjunction (ب، ل، ك، ف), never a suffix. Write a noun before the term instead ("ملف YAML" and "الكيان Release" and "بالأمر `aggrega build`"), or a preposition that stands as a word of its own (في، من، إلى، على، عن، مع).
- The conjunction "و" stands as a word of its own before a Latin term or a code span, also in a list of kept terms, in an image description and after a full stop: "Components و Features" and "و Release". A one-letter preposition (ب، ف) never joins a Latin term either. Before an Arabic word «و» is joined to it («والمُخرَجات»، «ومكوِّنات»).
- A kept term with no Arabic noun before it takes masculine agreement in every word that agrees with it, Feature, Recipe and FeatureRecipe included: its verb when it is the subject («يعلن Recipe»، «يصيّر Recipe»، «يقرأ FeatureRecipe»، «يعلن Feature»), its adjective («Recipe helm المُركَّب»، «FeatureRecipe الخاص به»، «Feature مرفق بالعقدة»، "كل Release مستقل") and its relative clause («Feature الذي يملؤه الاتصال»، «Recipe الذي يختاره Manifest»). Never «تعلن Recipe»، «Recipe helm المُركَّبة»، «FeatureRecipe الخاصة به»، «Feature مرفقة بالعقدة» nor «Feature التي» for the bare term. A plural kept term takes the feminine singular, as every non-human plural does: "Releases مستقلة". After an Arabic noun, agreement follows that noun: «طبقة Recipe التي يختارها Manifest».

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
| path (a file path, the route through a provider) | مسار |
| log | سجل |
| cache | ذاكرة التخزين المؤقت |
| semantic cache | ذاكرة التخزين المؤقت الدلالية |
| binary | ملف ثنائي |
| configuration file | ملف التكوين |
| artifact | مُخرَج (plural: مُخرَجات) |
| output, outputs (what a command, a build or a render writes) | الإخراج |
| lockfile | ملف القفل |
| entry (a row of a list, a map, a catalog or a lockfile) | إدخال (plural: إدخالات) |
| input (what a build, a step or a template reads) | مُدخَل (plural: مُدخَلات) |
| input mode | وضع المُدخَل (plural: أوضاع المُدخَلات) |
| sourced (an input kind, an input mode, a path, a template) | مصدري (feminine: مصدرية) |
| synthesized (an input kind) | المُركَّب |
| fact (what a provider reports or a template reads) | حقيقة (plural: حقائق) |
| declare, declaration | يعلن، إعلان |
| declarative | تصريحي |
| condition (documented by an error or warnings page) | الحالة |
| remedy (an error entry's way out) | العلاج |
| symbolic link, link on disk | رابط رمزي، رابط |
| plugin trust record | سجل الثقة |

An artifact is مُخرَج and output is الإخراج: the two stay apart, and output is never مُخرَجات (also written without diacritics). Output stays الإخراج in every phrase: the output of a verdict is «إخراج الحكم». What a compiler, a Recipe or a plugin writes is emitted, «أصدر», and an emitted file is «ملف مُصدَر»: never «أنتج». The emitted message keeps its own pin under Recurring terms.

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
| instance | مثيل (plural: مثيلات) |
| mapping | تعيين |
| severity | مستوى الخطورة |
| provenance | المنشأ |
| head of a printed diagnostic | الرأس |
| HTTP header, header of a file | ترويسة |
| finding (what a check or a build reports) | نتيجة (plural: نتائج) |
| advisory (a finding a build raises without halting) | تنبيه (plural: تنبيهات); the adjective: استشاري |
| failure, as a noun | إخفاق (plural: إخفاقات); to fail: يفشل |
| structured (a tree, an object, a map, a value) | مهيكل (feminine: مهيكلة) |
| opaque (a body, a patch target, metadata or a map the compiler does not read) | معتم (feminine: معتمة) |
| pillar (`values`, `infra`, `parameters`, `provides`) | ركيزة (plural: ركائز) |
| scalar (a single value) | قيمة مفردة (plural: قيم مفردة) |
| patch (a JSON-Patch operation, a patch target) | رقعة (plural: رقعات) |
| hydration (the inject pipe) | ترطيب |
| Semantic Versioning | الإصدار الدلالي |
| callback (a source callback) | دالة رد النداء (plural: دوال رد النداء) |
| export (a plugin's ABI export) | تصدير (plural: تصديرات) |
| kit (the plugin development kit, a language's kit) | مجموعة أدوات |
| controller (a process that reconciles a resource) | وحدة تحكم (plural: وحدات تحكم) |
| wire (a plugin's wire types, shapes and encodings) | السلك |
| hyphen (the character) | واصلة (plural: واصلات) |
| tagging (the built-in tagging plugins, the selector tagger) | الوسم |
| markings (what a sensitivity declaration puts on a value) | التعليم (marked: معلَّم) |
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
| computed (what a host calculates) | احتسب |
| to create | إنشاء |
| to build, a build | بناء |
| to compile, compilation (the noun) | التحويل البرمجي |
| to compile, as a verb | يحوِّل برمجيًا (compiled: مُحوَّل برمجيًا) |
| compile time | وقت التحويل البرمجي (runtime, the phase it is set against, is وقت التشغيل) |
| compiler | المحوِّل البرمجي |
| to render | تصيير |
| walkthrough (a page that builds an example step by step) | الشرح العملي |
| walkthrough (the explain output for one condition) | الجولة التفصيلية |
| to generate | توليد |
| to emit | أصدر (the verb يُصدِر) |
| to stamp (what the host or a guest puts on an output) | ختم (the verb يختم) |
| contributor (what contributes files or units to an assembled output) | مساهم (plural: مساهمون) |
| prompt (what is sent to a model) | مطالبة (plural: مطالبات) |
| to deploy | نشر |
| to publish | طرح |
| to apply | تطبيق |
| to resolve, resolution (dependencies, references, a Release, a catalog) | حل |
| to parse, parsing | تحليل |
| a pass (one run through a check or a build) | مرور |
| dry run | التشغيل التجريبي |
| exit code | رمز الخروج |
| exit status | حالة الخروج |
| attachment (the entity attached, and the act) | إرفاق (plural: إرفاقات) |
| to attach | يرفق |
| stack (a search stack, a CloudFormation stack, a Docker Compose stack) | مكدس (plural: مكدسات) |
| gate (a check that halts a build) | بوابة فحص (plural: بوابات فحص) |
| publish gate | بوابة فحص الطرح |
| gateway (an AI gateway, an API gateway) | بوابة |
| cluster | عنقود |
| container | حاوية |
| container image | صورة الحاوية |
| repository | مستودع |
| registry | registry, in Latin letters |
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
| template | قالب |
| example | مثال |
| project | مشروع |
| user | مستخدم |
| to support | دعم |
| marker (a deprecation marker, a withdrawal marker, a marker file) | وسم (plural: وسوم) |
| deprecation notice | إشعار إهمال |
| deprecation, deprecated | إهمال، مُهمَل |
| withdrawal, retracted | سحب، مسحوب |
| interface | واجهة |
| router | جهاز توجيه |
| pipeline | خط المعالجة |
| proxy | خادم وكيل |
| agent | وكيل |
| middleware | برنامج وسيط (plural: برامج وسيطة) |
| to wire | توصيل |
| to bind | ربط |
| physical | فعلي |
| hardcoded | مثبَّت في الشيفرة |
| graph | رسم بياني |
| limit (a resource limit) | سقف |
| cap (a ceiling on a count, a size or a number of results) | سقف |
| mandate (a presence mandate) | تفويض (plural: تفويضات) |
| cascade (a layered lookup) | التتابع |
| drift | انحراف |
| to fill | ملء (the verb يملأ) |
| sandbox | الصندوق الرملي |
| setting | إعداد (plural: إعدادات) |
| configuration key | مفتاح التكوين |

A registry, as a noun of any kind (a registry's index, a plugin registry, the Higress plugin registry), stays registry in Latin letters, as the `aggrega registry` command names it: «فهرس registry المحلي». سجل is a log and مستودع is a repository, so never «السجل» for a registry. It takes no article ("إلى registry"), and registries stays plural where the source writes it. The official hub is «hub الرسمي»: hub stays in Latin letters with no Arabic noun for it, never «المركز الرسمي».

To deploy is نشر and to publish is طرح: two verbs, never one for the other. What a server or a run makes available (the language server publishes diagnostics, findings or advisories) is published too: «يطرح الخادم التشخيصات». نشر is the everyday Arabic word for publishing, so here it never stands for publishing: "publishes but never deploys" is "يطرح ولا ينشر أبدًا".

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
| slot | خانة (plural: خانات) |
| namespace | مساحة أسماء |
| collision | تعارض |
| surface (the places a command or a tool reaches) | سطح |
| connection, between two nodes of a Release | اتصال (plural: اتصالات) |

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

- A segment keeps every line of its source, each on its own line, exactly where the source breaks it. A hard line break stays a line break.
- Lines of a plain paragraph that the source merely wraps (no Markdown marker) may be joined into one line. The rule above applies to lines that start with a marker.
- A line that starts with a Markdown marker (`>`, `-`, `|`, a number) stays its own line and keeps that marker. A quoted message over several lines keeps each line with its leading `>`; joining the lines into one sentence is a defect, because the page then shows the markers as text.

## Recurring terms

- A kept term keeps the source's number inside a compound too, a hyphenated one included: «مثيلات Component» for Component instances, «ربط Feature» for Feature binding, «أنواع Feature» for Feature types, «عائلات Feature» for Feature families, «عبر Recipe» for cross-Recipe and «إعادة الاستخدام عبر Component» for cross-Component reuse. «ربط Features» is only for Features bindings, and «عبر Recipes» and «عبر Components» are never written for the cross- compounds.
- The four domains are always translated, with the English in parentheses at a page's first occurrence, as in "المطوِّر (Developer)":
  - Developer: المطوِّر
  - Platform Architect: مهندس المنصة المعماري (the Architect alone, and the architect role, take the same rendering: never «المعماري» alone, which reads as "architectural"; within one sentence after the full form, «المهندس المعماري» may follow)
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
  - an Ops engineer: مهندس العمليات (a person on the Platform Ops team is «مهندس عمليات المنصة»)
  - an Ops Recipe: Recipe العمليات
- عمليات المنصة is the Platform Ops domain only. Operational is تشغيلي (the Ops discipline alone is العمليات).
- To pipe, the String Pipe's verb, is تمرير (the verb يمرِّر); a pipe is أنبوب.
- `agnostic to` is the qualifier above. X-agnostic is "لا يرتبط ب" joined to X, as in provider-agnostic "لا يرتبط بموفِّر بعينه"; agnostic with no object is محايد (neutral), and never gains an object the source does not name.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Arabic in parentheses: "The provider does not support omits (لا يدعم الموفِّر omits)". One link text per target. The English keeps its inline code, and a capitalized glossary term inside the Arabic in parentheses stays in Latin letters, as anywhere else. The Arabic gloss writes every key, field and file the English names in plain text (aggregates, components, value:, from:, in:, function:) in Latin letters as the source writes it, never as an Arabic paraphrase of that key and never as «مفتاحًا».
- A heading on an error page and every quotation of it, in a link, a list of headings separated by semicolons or a sentence of another page, carry the same Arabic character for character, diacritics included: a quotation copies each heading's Arabic as the heading writes it, and a link never translates a heading anew. «المحدِّدات المعلنة» and «المحددات المعلنة» are two renderings, so a link that differs from its heading by one diacritic is a defect.
- A link from any page to a heading that is not on an error page, and a link from one page to another page or an example, uses the Arabic alone, also in an example README: its text is the target's translated title, «الأمثلة بحسب المنتج والقدرة» and never "Examples by product and capability". A command (`aggrega serve`) and a product name (Claude Desktop) in a link text stay as written. The same holds, also where the link is written in the English-first form of an error heading (the English-first form belongs only to a heading on an error or warnings page and to the links to it): its text is translated even where the source shows the heading verbatim, and also where it is a page title after a path prefix such as `arm →` (the part after the arrow; the arrow follows the rule under Direction).
- The recurring section titles of an example README take one wording on every page: «ما يعرضه» for "What it shows" and for "What it demonstrates", «ترتيب التعليم» for "the teaching order", «شغِّله» for "Run it", «الملفات» for "Files". «ما يُظهره» and «ترتيب التعلم» are not written.
- A condition, said of what an error page or a warnings page documents (a halting condition, the condition's own sentence, the condition's short code), is «الحالة» («هذه الحالة»، «حالة التوقف»، «رمز الحالة»). «الشرط» is only a logical condition, as in an `if`, and never the documented condition.
- To declare, and a declaration, said of an entity, a Recipe, a provider or a plugin, take the root علن: «يعلن»، «معلن»، «إعلان». Never «يصرّح» nor «تصريح» for a declaration, and never «المصرَّح به» for what is declared. Declarative, said of a design, a state, an agent or a file, is «تصريحي» («الوكيل التصريحي»، «حالة تصريحية»), whatever the verb to declare takes; the ban on «تصريح» covers the verb and the noun of a declaration only, and «إعلاني» is never written for declarative.
- A collision, said of two names, two files or two outputs that reach one place, is «تعارض» («تعارض الإخراج المجمَّع»، «يتعارض»). Never «تصادم».
- A namespace, said of a Kubernetes namespace, a prefix namespace, a method namespace or the namespace of a slot, is «مساحة أسماء» («مساحة الأسماء المحجوزة»). Never «فضاء أسماء» nor «نطاق أسماء», because «نطاق» is a scope.
- An entry, a row of a list, a map, a catalog or a lockfile, is «إدخال» (plural «إدخالات»): «إدخال في ملف القفل». An input, what a build, a step or a template reads, is «مُدخَل» (plural «مُدخَلات»), and an input kind, such as the kinds of input a Recipe takes, is «نوع المُدخَل» (plural «أنواع المُدخَلات»). In running text the unvowelled «مدخل» and «مدخلات» also read as input, because «إدخال» is the entry; add no diacritics only to make a word match the pin. Never «مدخل» nor «مداخل» for an entry, and never «نوع الإدخال» for an input kind. An input mode, such as a Recipe's input modes, takes the input noun with the same diacritics as «نوع المُدخَل»: «وضع المُدخَل» (plural «أوضاع المُدخَلات»), never «وضع إدخال». The same input, said of a build that gives the same result for the same input, is «المُدخَل نفسه», never «الإدخال نفسه».
- A surface, said of the set of places a command, a tool or a check reaches, is «سطح» («سطح الأدوات»). «واجهة» is an interface and never a surface.
- A remedy, the way out an error entry names, is «العلاج» («العلاجان»), and the `remediation:` label inside an emitted message is «المعالجة». «الإصلاح» is only the act of repair, as in «طريقة الإصلاح».
- A symbolic link and a link on disk are «رابط رمزي» and «رابط». «وصلة» is not used for a link, because a connection between two nodes of a Release is «اتصال».
- Overview, in a heading or a link, is نظرة عامة.
- A field name written in plain text (pluginType) stays as written inside translated error text.
- The label "How to fix:" is **طريقة الإصلاح:** at the start of its paragraph.
- Emitted message, emitted messages: الرسالة الصادرة، الرسائل الصادرة.
- Published, said of a schema, a document, a name, a value, an address, an alias or a port that is made available, takes the verb طرح (the verb «يطرح»): "the published schema" is «المخطط المطروح» and «العنوان الذي يطرحه `published_port`». Never «المنشور» or «منشورة»: نشر is deploying.
- A router, the Release as "the router" or a text-router, is «جهاز توجيه» ("deployment router" is «جهاز توجيه النشر»). A prompt, what is sent to a model, is «مطالبة» (plural «مطالبات»): «حقن المطالبات» for prompt injection and «سلاسل المطالبات» for prompt chains. A prompt the assistant pages hand a reader to paste, and the assistant's authoring prompts, are «موجِّه» (plural «موجِّهات»), the only use of that word. Never «أمر» for a prompt, which is a command.
- Pipeline, in plain text, is «خط المعالجة» (plural «خطوط المعالجة»), also for the compiler's own pipeline and a feature-recipe pipeline; in the construct state before a noun it is «خط معالجة»: «خط معالجة المحوِّل البرمجي». A CI/CD pipeline is «خط CI/CD». Never «مسار», which is a path. A word in inline code (`pipeline`) stays as written.
- A path, said of the route a Release takes through one provider (the Compose path, the helm path, the Kubernetes path, the synthesized helm path) or of a file path, is «مسار» («مسار Compose»، «مسار helm المُركَّب»); the noun after it says which. Never «طريق», which is a road.
- Walkthrough, said of a page that builds an example step by step, is «الشرح العملي» («الشرح العملي لاستيراد Compose»); a link to such a page uses the page's own Arabic title. Said of what the explain output gives for one condition, it is «الجولة التفصيلية». Never «دليل إرشادي» nor a bare «الشرح» for the page.
- Computed, said of what a host calculates, is «احتسب»; never the unvowelled «حسب», which reads as "according to". Write the form that cannot be misread wherever a verb left unvowelled may be taken for a preposition or a noun.
- A proxy is «خادم وكيل» (plural «خوادم وكيلة»); an agent is «وكيل» alone, so the two never share a word. An SSH agent stays as written, as listed below.
- Wire, wiring and to wire take the root توصيل: «توصيل دلالي» for Semantic Wiring. To bind and binding take the root ربط: «الربط المتأخر» for Late Binding. To connect and a connection stay اتصال and يتصل for a client reaching a server. A connection between two nodes of a Release, and its alias, is «اتصال» (plural «اتصالات») too: never «وصلة».
- Physical, said of infrastructure, resources and sizing, is «فعلي» (feminine «فعلية», adverb «فعليًا»), as in «البنية التحتية الفعلية». Never «مادي». The pair physical and logical is «فعلي» and «منطقي».
- Hardcoded is «مثبَّت في الشيفرة»: «مخططات مثبَّتة في الشيفرة». Never «مرمَّز».
- A graph is «رسم بياني»: the IR graph is «رسم IR البياني», and the plural is «الرسوم البيانية». Never «مخطط», which is a schema.
- Opaque, said of a body, a patch target, metadata or a map the compiler does not read, is «معتم» (feminine «معتمة»): «متن معتم»، «بيانات وصفية معتمة». Never «مبهم» nor «مبهمة».
- A pillar, said of the `values`, `infra`, `parameters` and `provides` pillars of a document, is «ركيزة» (plural «ركائز»): «ركيزة `provides:`»، «الركيزة المكتوبة». Never «عمود», which is a table column.
- A scalar, said of a single value, is «قيمة مفردة» (plural «قيم مفردة»): «خريطة قيم مفردة معتمة». Never «قيمة قياسية», because «قياسي» is standard or canonical. A YAML block scalar stays «scalar كتلي» only where the source names the YAML construct.
- A patch, said of a JSON-Patch operation, a patch target or the pipeline patch model, is «رقعة» (plural «رقعات»): «هدف رقعة»، «تطبيق الرقعات». Never «تصحيح» nor «ترقيع». A patch release stays «إصدار تصحيحي».
- Hydration, said of the inject pipe, is «ترطيب» («ترطيب inject»). «ملء» is only the fill of a slot, so it never stands for hydration.
- To stamp, said of what the host or a guest puts on an output (a label, an annotation, provenance), is «ختم» (the verb «يختم»، passive «يُختم»، stamped «مختوم»): «يُختم بوصفه التسمية». Never «دمغ» nor «يدمغ».
- A contributor, said of what contributes files or units to an assembled output, is «مساهم» (plural «مساهمون»). Never «مُسهِم» nor «مشارك».
- Semantic Versioning is «الإصدار الدلالي» («الإصدار الدلالي الصارم»), in the field descriptions of every schema page alike, never in Latin letters.
- An advisory, said of the findings a build raises without halting, is «تنبيه» (plural «تنبيهات»), and the adjective is «استشاري»: «تنبيه استشاري». Never «الاستشارات», which are consultations, nor «ملاحظة» for an advisory.
- A boundary, in the sense of a Release's `boundaries`, is «حد» (plural «حدود»). A resource limit, such as a CPU limit or a memory limit, is «سقف» («سقف المعالج» and «سقف الذاكرة»). A limit that is not a resource limit, such as a concurrency limit, a rate limit or a budget limit, is «حد» («حد التزامن»), so a limit takes the noun that says which.
- A typed contract is «عقد مصنَّف بالنوع» and a typed parameter is «مُعامِل مصنَّف بالنوع».
- A lowercase release or aggregate that names a Release or an Aggregate entity (the release resolves to, a release file, `--release <release>`, a sub-aggregate) is written as the entity's name in Latin letters, Release or Aggregate ("Aggregate فرعي"). إصدار is only a version or a release of the product, such as the compiler's.
- A lowercase plural of an entity name keeps its number: releases is Releases, and three releases is "ثلاثة Releases".
- A kept term keeps its plural after a numeral or a word of quantity: "ثلاثة Releases" and "عدة Recipes".
- A plural kept term stays plural wherever the source writes it, also when two are joined: "Components و Features".
- Lowercase component, feature, workload, manifest, plugin, provider and operator are ordinary words, translated as the vocabulary gives them also beside a kept term and inside a compound («تركيب حمل العمل» for workload synthesis):
  - a workload: حمل العمل (plural: أحمال العمل), written without a kasra under the first letter: never «حِمل»
  - a feature: ميزة
  - a manifest (a Kubernetes or OCI manifest): بيان (the plural is «ملفات بيان», since «بيانات» alone is data); a provider-native manifest is «ملف بيان أصلي للموفِّر» (plural «ملفات بيان أصلية للموفِّر»), never «بيانات تعريفية», which is metadata
  - an operator, a person: مشغِّل
  - an operator in programming: عامل
  - a Kubernetes operator: Operator, in Latin letters (a controller that is not an Operator is «وحدة تحكم», as pinned below)
- A slot, said of an attachment slot or a slot a Component declares, is «خانة» (plural «خانات»): «خانة إرفاق». Never «فتحة». A socket stays «مقبس».
- An attachment, the entity a Release or an Aggregate attaches and the act of attaching it, is «إرفاق» (plural «إرفاقات»): «إرفاق Feature»، «اسم الإرفاق»، «إرفاقات الحوكمة». To attach is «يرفق» («يُرفق» in the passive). Never «مرفق» or «مرفقات» as the noun, and never «ملحق» or «ملحقات». The adjective stays «مرفق»: «Feature مرفق بالعقدة».
- An instance, said of an instance name, a Component instance, a database instance, a virtual machine instance or a service instance (a Sigstore instance, a gateway instance), is «مثيل» (plural «مثيلات»): «اسم المثيل». Never «نسخة», which is a copy or a replica.
- A stack, a search stack, a CloudFormation stack or a Docker Compose stack, is «مكدس» (plural «مكدسات»): «مكدس بحث الكتالوج»، «مكدس Compose». Never «منظومة», never «حزمة», which is a package, and never stack in Latin letters.
- A pass, said of one run through a check or a build, is «مرور»: «في مرور واحد». Never «ممر», which is a corridor.
- Domain, said of the four domains, of Domain 1 to 4 and of domain-specific, is «المجال» (plural «المجالات»): «المجال 2» and «الخاص بالمجال». Scope, and a DNS domain or sub-domain, is «نطاق» (plural «نطاقات»). The two never share a word.
- Cache is «ذاكرة التخزين المؤقت», and a semantic cache is «ذاكرة التخزين المؤقت الدلالية». Never «الذاكرة المؤقتة».
- Middleware is «برنامج وسيط» (plural «برامج وسيطة»). «وسيط» alone is intermediate, as in «التمثيل الوسيط».
- Mapping, a Manifest mapping or a values mapping, is «تعيين»: never «ربط», which is binding, nor «مطابقة», which is matching.
- To resolve and resolution, said of dependencies, references, a Release or a catalog, take the root حل: «حل التبعيات»، «يحلّ Release»، «المرجع المحلول». Parsing is «تحليل», as in «تحليل YAML»: the two never share a word, and «يحلّل» never stands for resolving.
- Configuration, a configuration file or the workspace configuration, is «تكوين», and configured is «مكوَّن»: «تكوين مساحة العمل». «تهيئة» is only to seed or to initialise, as `aggrega config init` does.
- A marker in any sense (a deprecation marker, a withdrawal marker, a marker file, the literal marker `schema: inherited`, a root marker) is «وسم» (plural «وسوم»): «وسم إهمال»، «وسم سحب». «علامة» is only a flag and «إشارة» is only a signal, so neither is ever a marker. A deprecation notice is «إشعار إهمال». Deprecation is «إهمال» («مُهمَل» for deprecated), and withdrawal and retracted, in plain text, are «سحب» and «مسحوب»: never «إيقاف» nor «الإيقاف عن الاستخدام».
- An exit code is «رمز الخروج», and an exit status is «حالة الخروج»: the two words stay apart on every page.
- A dry run is «التشغيل التجريبي».
- The plugin trust record is «سجل الثقة» («سجل ثقة المكوِّنات الإضافية»), and a lockfile is «ملف القفل».
- A gate, a check that halts a build (the publish gate, a verdict-role plugin), is «بوابة فحص» (plural «بوابات فحص»), and the publish gate is «بوابة فحص الطرح». It is «بوابة فحص» in every sentence of an error entry, also when the entry names it twice: a bare «بوابة» is only a gateway, an AI gateway or an API gateway. The two never share a bare «بوابة».
- A Wasm guest stays `guest` in Latin letters, in the singular and the plural, in plain text too: «وحدة guest»، «guest Wasm». The host stays «مضيف». Never «ضيف».
- A dispatch group is «مجموعة توزيع»: never «مجموعة إرسال».
- Severity is «مستوى الخطورة».
- Provenance, said of where a value, a label, a file or a key came from, is «المنشأ» («قوس المنشأ»، «تسمية المنشأ»، «مفتاح المنشأ»، «منشأ `publishedAt`»). Never «مصدر», which is a source, nor «أصل», which is an origin or a parent.
- The head of a printed diagnostic, the bracketed part that carries the category and the short code, is «الرأس» («رأس التشخيص»، «يحمل الرأس الفئة»). An HTTP header or a header of a file is «ترويسة». The two never share a word.
- A finding, what a check or a build reports, is «نتيجة» (plural «نتائج»), never «ملاحظة», which is a note. A diagnostic stays «تشخيص».
- Failure, as a noun, is always «إخفاق» (plural «إخفاقات»): «إخفاق الحل»، «إخفاقات الجلب». To fail, as a verb, is «يفشل». «فشل» is never the noun: write «إخفاق» wherever the English says failure.
- A cap, said of a ceiling on a count, a size or a number of results (a concurrency cap, a size cap, a result cap, a cap on how many tools a client registers), is «سقف» («سقف التزامن»، «سقف الحجم»، «سقف النتائج»), never «حد». A limit that is neither a cap nor a resource limit keeps «حد» as pinned above, and a name inside inline code stays as written.
- A mandate, said of a presence mandate, is «تفويض» («تفويض حضور»، plural «تفويضات الحضور»), never «إلزام». The verb «يفوّض» follows it.
- A cascade, said of a layered lookup (the plugin cascade, the catalog cascade, the configuration cascade), is «التتابع»: «تتابع المكوِّنات الإضافية». Never «التدرج»، «التسلسل» nor «متدرج». Cascading Annotations stays as pinned above.
- Drift, said of a lockfile, a convention or a name, is «انحراف» («توقف الانحراف»، «الانحراف في التسمية»), never «انجراف».
- To fill, said of what fills a slot, is «ملء» (the verb «يملأ»), never «تعبئة», which is not used for a fill.
- A template, a Go template or a values template, is «قالب»: «قالب `values`». Never «النموذجي» nor «نموذج», which mean typical and model.
- Structured, said of a tree, an object, a map or a value, is «مهيكل» (feminine «مهيكلة»): «شجرة مهيكلة»، «كائن مهيكل». Never «منظَّم». «بنيوي» is only structural, as in «المخطط البنيوي».
- Sourced, said of an input kind, an input mode, a path or a template, is «مصدري» (feminine «مصدرية»): «الوضع المصدري»، «Recipe المصدري»، «قالب مصدري», in a title and in the name of a mode too. Never «وضع المصدر»، «ذي مصدر»، «المعتمد على مصدر»، «مستمد من مصدر»، «مستند إلى مصدر» nor «ذات المصدر». The synthesized input kind is «المُركَّب» in the same sentences, never «المولَّف»; a synthesized harness, aggregate or release that Aggrega builds itself keeps «المولَّف».
- A fact, said of what a provider reports or a template reads, is «حقيقة» (plural «حقائق»): «حقائق التصيير». Never «واقعة» nor «وقائع».
- A kit, said of the plugin development kit and of a language's kit, is «مجموعة أدوات» («مجموعة تطوير المكوِّنات الإضافية» for the whole name, «المجموعة» for the short form): «مثال في مجموعة أدوات Go». Never «عُدّة» nor «عدة», because «عدة» also reads as several.
- A callback, said of the source callbacks a guest reads through, is «دالة رد النداء» (plural «دوال رد النداء»). Never «استدعاء مرتد».
- An export, said of a plugin's ABI export, is «تصدير» (plural «تصديرات»): «اسم التصدير»، «يأخذ التصدير مصفوفة بايتات». Never «الدالة المُصدَّرة» nor «الصادرات».
- A controller, said of an ingress controller, a gateway controller or any process that reconciles a resource and is not a Kubernetes Operator, is «وحدة تحكم» (plural «وحدات تحكم»): «وحدة تحكم الدخول». Never «متحكم». A Kubernetes Operator stays Operator.
- Wire, said of a plugin's wire types, shapes and encodings, is «السلك»: «أنواع السلك»، «ترميز السلك». Never «النقل» for it. The verb to wire keeps its own pin above.
- A hyphen, said of the character, is «واصلة» (plural «واصلات»): «للواصلة التي لا تحتفظ بها القاعدة». Never «الواصل».
- Tagging, said of the built-in tagging plugins and of the selector tagger, takes the root «وسم»: «مكوِّنات الوسم الإضافية المدمجة»، «محدِّد الوسم». Never «التسمية» for it, because a label is «تسمية».
- Markings, said of what a declaration of sensitivity puts on a value, is «التعليم» (marked: «معلَّم»). Never «التعليمات», which are instructions.
- A schema page writes its labels the same way on every page: «النوع»، «مطلوب»، «الافتراضي:»، «القيم المسموح بها:»، «النمط:»، «المفاتيح:»، «ثابت:» (never «الثابت:»), and the key rule as «المفاتيح: حرف واحد أو أكثر من الأحرف والأرقام والشرطات السفلية أو الواصلات. لا يُسمح بالنقطة.»
- A sandbox is «الصندوق الرملي» in every phrase («يمنع الصندوق الرملي القدرة»), never «صندوق الرمل» nor «بيئة معزولة». «معزول عن الشبكة» is only air-gapped.
- A setting is «إعداد» («قيمة إعداد مساحة العمل»), and a configuration key is «مفتاح التكوين». «تهيئة» is only to seed or to initialise, and «ضبط» is only the verb to set.
- A type word written in plain text in a type column is translated the same way on every page: string «سلسلة نصية»، boolean and bool «قيمة منطقية»، object «كائن»، array «مصفوفة»، map «خريطة»، integer «عدد صحيح»، number «عدد». A type written in inline code (`string[]`) stays as written.
- A bold run-in label that opens a paragraph (such as the heading of a feature list) is translated like any heading, also where it names a language or a tool: its Latin words stay, and the label's own words are Arabic.
- A label an editor or a client shows on screen (a setting's name, a button, a menu item) stays in English exactly as the screen shows it, in the source's emphasis. VS Code's Command Palette named in prose is لوحة الأوامر (English only where the text quotes the English screen).
- A status label in inline code stays as it is; in plain text it is translated.
- These stay in Latin letters, as the source writes them:
  - pull and push, the `aggrega pull` and `aggrega push` operations, and a person or a step that pulls an entity, in prose too: «لمن يشغّل pull» (a server pushing diagnostics is the ordinary verb يرسل)
  - the pull step of a build is «خطوة pull», and a build that pulls is «بناء يشغّل pull»: the verb never becomes «يسحب», and `--auto-pull` and `auto_pull` stay as written, never «الجلب التلقائي» «يسحب» is only to withdraw, as in «يسحب تحذيرًا» and «يسحب قدرة».
  - sync, the import send mode (ordinary synchronising is مزامنة)
  - lint, the check, and linter
  - sentinel, an error sentinel
  - chart, a Helm chart, in every phrase («سجل chart»، «chart مجلوب»); never «مخطط Helm» nor «رسم»
  - shell
  - sidecar
  - vendored, vendors and to vendor, in every form (a vendor, a company, is مورِّد)
  - pod, webhook, span, rail and jailbreak, and a headless Service
  - hub, the hub written lowercase
  - referrer, in the OCI sense
  - runner, a CI runner
  - daemon, the long-running `aggrega serve` process, in every form, with no article and no affix ("يخرج daemon"، "إلى daemon"); never «الخدمة الخلفية»، «الخادم الخلفي» nor «الخادم الخفي»
  - tag, an OCI tag, an image tag or a git tag (a plural stays tags): "tag الإصدار"، "قائمة tags"; a tag on a cloud resource (an AWS tag) is «وسم» (plural «وسوم»), and «وسم» is never an OCI, image or git tag
  - release, lowercase, for a Helm release (a deployed chart instance, a release name)
  - consumer, a Kong consumer (the Aggrega consumer is مستهلك)
  - token, a lowercase kind or schema token, besides the LLM and lexical token the vocabulary names
  - invalid-params, the protocol's error name (an invalid parameter is مُعامِل غير صالح)
  - Day-0, Day-1 and Day-2
  - stdin, stdout and stderr where the source writes them so (standard input, output and error written out are الإدخال القياسي، الإخراج القياسي، الخطأ القياسي)
  - an SSH agent, as written

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

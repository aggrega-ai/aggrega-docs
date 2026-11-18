# हिन्दी

Translate into Hindi. Each choice below is a default, made without a native speaker's review, and a native speaker may change any of it.

## Register

- Standard Hindi in Devanagari, technical and plain, as Indian software documentation in Hindi is written: precise, with no emphasis the source does not have.
- Where developers use a common technical loanword, write it in Devanagari as they do ("फ़ाइल", "सर्वर", "कंपाइलर", "रजिस्ट्री") rather than replacing it with an unfamiliar Sanskritised coinage. Keep the nukta where the loanword has it: फ़ाइल, not फाइल. This rule never reaches a glossary do-not-translate term: a kept term always stays in Latin letters, as the next section says, even where developers also write a Devanagari form of it.
- Address the reader as "आप" wherever the English says "you"; an instruction takes the polite imperative: "चलाएं", "देखिए", "घोषित करें".
- Headings take plain sentence form, with no ornament the source does not have.

## Punctuation, digits and quotation marks

- A sentence ends with the full stop "।"; a question ends with "?". Commas, colons and other marks are the Western ones.
- Numbers take Western digits (0–9), never Devanagari digits.
- A quoted phrase takes “ऐसे”, and a quotation inside it takes ‘ऐसे’.
- Inline code is never put in quotation marks: it keeps its backticks.

## English terms kept as they are

- The glossary's do-not-translate terms, in Latin letters and as the glossary writes them, capital letter included; never translated, never transliterated into Devanagari, never inflected. A Hindi postposition follows the term as a separate word: `Component का`, `Release में`, `Recipe के लिए`, `Aggregate को`.
- A kept term's singular and plural are two distinct terms: `Component` and `Components`, `Release` and `Releases`. Write the form the source writes, a plural where the source has the plural and a singular where it has the singular, even where this language does not mark number.
- Everything in inline code, and every YAML key, CLI command and flag, entity kind and file path.
- The names of other products and standards: Kubernetes, Helm, Docker Compose, Terraform, CloudFormation, WebAssembly, JSON Schema, YAML, OCI.
- Abbreviations such as AOT, IR, CLI and ABI stay; their expansion is translated where the source spells it out.

## The qualifiers

- `social contract`: सामाजिक अनुबंध.
- `best practice`: सर्वोत्तम अभ्यास; never "नियम" or "अनिवार्यता".
- `escape hatch`: निकास मार्ग; never "चोर दरवाज़ा" or "बचने का रास्ता", which read as a back door or a loophole.
- `convention`: परिपाटी, as in "नामकरण की परिपाटियाँ"; never "नियम".
- `unopinionated`: किसी विशेष मत से मुक्त; "mathematically unopinionated" is "गणितीय रूप से किसी विशेष मत से मुक्त".
- `content-neutral`: सामग्री-तटस्थ.
- `agnostic to`: … से निरपेक्ष, as in "परिपाटियों से निरपेक्ष"; never "अज्ञेय", which means "unknowable".

## Recurring terms

- A kept term keeps the source's number inside a compound or before a postposition too: "cross-Component" is "Component के पार", never "Components के पार".
- `Ghost Infrastructure`: छद्म इन्फ़्रास्ट्रक्चर; `Loud Guardrail`, `Loud Guardrails`: मुखर गार्डरेल. In running text give the English in parentheses at the first occurrence on a page or in a heading, not at every occurrence, and never two parentheticals in a row.
- A heading on an error or warnings page, and the text of every link to such a heading, is the English name first, then the Hindi in parentheses: "Ghost Infrastructure Tracker (छद्म इन्फ़्रास्ट्रक्चर ट्रैकर)".
- "kind", the noun naming an entity's kind, stays in Latin letters: "एंटिटी kind", "उस kind के लिए".
- A label an editor or a client shows on screen (a setting's name, a button, a menu item) stays in English exactly as the screen shows it, in the source's emphasis.
- A quoted phrase takes “ ” whatever quotation mark the source uses; ‘ ’ only for a quotation inside “ ”.
- One rendering per term across the whole documentation: value मान (never "वैल्यू"); version संस्करण (never "वर्ज़न"); registry reference रजिस्ट्री रेफ़रेंस; entry प्रविष्टि; diagnostic डायग्नोस्टिक; service सेवा; local लोकल; a running program's process प्रोसेस, a procedure प्रक्रिया; format फ़ॉर्मेट; the scope of a run दायरा; workspace boundary वर्कस्पेस बाउंड्री; sourced स्रोत-आधारित; sourceless स्रोत-रहित; malformed विकृत; an AI assistant AI असिस्टेंट; a component (in plain text) घटक; policy पॉलिसी; signature हस्ताक्षर; target लक्ष्य; to fail विफल होना; user उपयोगकर्ता; semantic सिमैंटिक; directive निर्देश; a schema constraint कंस्ट्रेंट; a release of the product रिलीज़, even where a sentence opens with "Releases".
- A kept term takes masculine agreement: "Recipe प्रकाशित करता है"; so does every kept kind name ("MappingLibrary मदद करता है"), a command, a server request and a skill ("यह कमांड लिखता है"). A feminine verb follows only a feminine Hindi noun (एंटिटी, प्रविष्टि, फ़ाइल); प्रोसेस and फ़ाइल सिस्टम are masculine. A kept plural stays plural after "each of": "each of its Recipes" is "उसके Recipes में से हर एक".
- The four domains are written alike, never one translated beside another kept in English: डेवलपर, प्लेटफ़ॉर्म आर्किटेक्ट, प्लेटफ़ॉर्म ऑप्स, प्लेटफ़ॉर्म ऑपरेटर, with the English in parentheses at the first occurrence on a page; inside a compound too ("निजी ऑप्स स्टेट").
- The text of a link to a heading is that heading's own translation, word for word.
- Status labels ("available", "accepted but inert") in inline code stay as they are; in plain text they are translated, with the English in parentheses where the label is defined.

A native speaker who finds a default here wrong corrects this file; every translation made after the correction follows it.

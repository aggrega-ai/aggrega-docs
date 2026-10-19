# Fixture corpus

A paragraph with `planted_inline_code` and a [planted link](https://planted.example/destination "Planted title"),
then an ![planted alt text](images/planted-image.png) image and <kbd>Planted</kbd> keys.
Entities &amp; references &copy; stay, and so does <https://autolink.example/path>.

## Lists

- First item
  continues on a second line.
- Second item with **strong** text
  - Nested item
- [x] A finished task
- [ ] An open task

1. Ordered one
2. Ordered two

> A quoted paragraph
> over two lines.
>
> - A list inside the quote

## Tables

| Name | Code | Count | Mark | Empty |
|------|------|------:|:----:|-------|
| Alpha cell | `only_code` | 42 | --- | |
| Beta cell \| escaped | `x` and words | 3.14 | ✓ | |

## Code

```js
const neverSegmented = 'fenced code';
```

    indented code is never segmented

<div class="html-block">
An HTML block is never segmented.
</div>

<!-- An HTML comment is never segmented. -->

Setext heading
--------------

A hard break  
inside one paragraph.

[^note]: A footnote paragraph is a segment.

Text with a footnote[^note].

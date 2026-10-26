# Reading the output on these pages

Most pages in this section show you output as well as input: a file the build
wrote under `dist/`, the text the build printed to your terminal, or what a tool
like `tofu` printed when you ran it on what the build wrote.

**Those blocks are copied from a real run, not written by hand.** Build the
example yourself and you can compare your own output against the page line by
line.

That comparison is why the output is here at all. Several of these pages ask you
to change one line and rebuild, or to delete a rendered file and run the tool
again, and then to read the difference. An instruction like that is only worth
following if the block you are comparing against is exact — otherwise you have no
way to tell a difference the page meant you to find from one it simply never
mentioned.

So a block that shows output is always in one of two states, and never
somewhere in between.

## Complete

The block shows the whole of what the page named. When the lead-in says *the
`web` service*, every line of that service is there. When it names a file, the
whole file is there.

## An excerpt, marked where the omission is

Real output is often long, and printing all of it would bury the one line a page
is teaching. Where lines are left out, the block says so, on its own line, at the
point where they were left out:

```
[… omitted: what was left out]
```

Here is that in use. This is a plan for the
[terraform-declared-sensitivity](terraform-declared-sensitivity/README.md)
example, where the point being made is about one attribute:

```text
  # module.store.terraform_data.reference will be created
  + resource "terraform_data" "reference" {
      [… omitted: an id attribute, reported as known only after apply]
      + input            = (sensitive value)
      [… omitted: an output attribute, reported as known only after apply]
      + triggers_replace = [
          + "app-artifacts",
          + "AKIAEXAMPLE0001",
        ]
    }
```

Your own plan will carry those two attributes. The mark is how you know they
belong there — that they are lines the page chose not to reprint, rather than
something your build did differently. A mark sits at each place lines were
dropped, so their position is as readable as their absence.

The mark always says *what* was dropped, never just *that* something was. "An id
attribute, reported as known only after apply" tells you enough to recognise the
line when you meet it; a bare ellipsis would not.

**The brackets are deliberate.** A line beginning `[…` is not valid content in
YAML, HCL, JSON or any of the other formats these pages print, and none of the
tools shown here prints one. So such a line is always the page speaking, never
something the build produced — it can be neither mistaken for output nor missed
while skimming.

## What is not an omission

Four things change how a block looks without leaving anything out, and none of
them takes a mark:

- **Naming a smaller extent.** A page that says "the `web` service" and then
  shows that service has left nothing out of what it named. The rest of the file
  is outside the extent rather than missing from it.
- **Indentation.** A fragment lifted out of a deeply nested structure is usually
  shown from the left margin so it reads on its own. The lines are the emitted
  lines; only the leading spaces changed.
- **A caption or a note.** A `#` line naming the file the lines came from, or a
  short note beside a value, is visibly the page talking rather than the build.
- **A `#` on every line of a quoted message.** Where a page shows a command and
  the message it printed in one block, the message is commented out so the whole
  block stays runnable. A single long printed line may be wrapped across several
  `#` lines to stay readable at this width. Either way the words are the printed
  words, in the printed order.

The mark exists for the one case you could not otherwise detect: lines that are
simply not there.

## A block that illustrates rather than reproduces

A few pages here are written walkthroughs rather than workspaces you can build,
and one or two show a payload's shape rather than a particular run of it. A block
like that carries no promise you can diff against, so it says so in the words
around it — it never quietly stands in for the real thing. If a block does not
say that, it was copied from a run and the two states above apply to it.

## If you adapt one of these pages

Keep the same two states. When output changes — because you changed the example,
or because a newer release renders it differently — replace the block from a real
run rather than editing it by hand, and mark any lines you leave out. A block
edited to look right is the one thing this convention is meant to prevent, since
it reads exactly like a block that was checked.

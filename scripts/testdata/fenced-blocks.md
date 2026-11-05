# Fenced blocks the two block readers must read alike

A fixture for scripts/check-fenced-block-parity.sh: each case below is a way a
fence opens, closes or does not, as the two readers read pages.

A backtick fence with an info word and a blank line inside:

```yaml
key: value

other: value
```

A tilde fence holding a backtick run, which does not close it:

~~~text
```
still inside
~~~

A fence indented by three spaces opens; the closing fence may be indented:

   ```bash
   aggrega version
      ```

Indented by four spaces, a run of backticks opens nothing:

    ```
    not a block

A longer opener is closed only by a run at least as long:

````markdown
```yaml
inner: fence
```
````

An info word followed by more words, and a closing fence with trailing spaces:

```bash title="example"
aggrega import compose.yaml   
```   

A tilde run shorter than its opener does not close it:

~~~~
~~~
closed by four
~~~~

A fence with no info word:

```
plain
```

A fence never closed is not a block:

```text
left open

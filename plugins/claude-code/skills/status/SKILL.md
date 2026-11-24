---
name: status
description: Show what a bluer skill has learned, in plain words.
argument-hint: "[skill]"
disable-model-invocation: true
---

Load the `bluer:bluer` skill. Then, for the skill named here, run
`bluer status` and `bluer history`, and explain in a few plain sentences what it
has learned and what is waiting:

$ARGUMENTS

If no skill is named, run `bluer list` and give a one-line status for each.

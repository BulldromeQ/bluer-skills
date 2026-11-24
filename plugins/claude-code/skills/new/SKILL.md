---
name: new
description: Create a new bluer skill from a few plain steps.
argument-hint: "<title>, 1. <step>, 2. <step>"
disable-model-invocation: true
---

Load the `bluer:bluer` skill, then follow its "Create a skill" section with this
input from the user:

$ARGUMENTS

If the input is empty, ask the user what the skill should do, as a title and a
few numbered steps in their own words.

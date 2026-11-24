---
name: teach
description: Teach a bluer skill something it should remember.
argument-hint: "<skill> <what it should learn>"
disable-model-invocation: true
---

Load the `bluer:bluer` skill, then follow its "Record a lesson" section for
this request from the user. Treat it as a rule the user stated (`--always`)
unless they say it is only for this time.

$ARGUMENTS

If it is not clear which skill they mean, run `bluer list` and ask.

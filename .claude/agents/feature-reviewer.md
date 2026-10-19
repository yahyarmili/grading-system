---
name: feature-reviewer
description: Review a completed feature in a fresh context after implementation. Use when a feature needs an independent check for bugs, regressions, unnecessary changes, project-rule violations and missing verification.
tools: Read, Grep, Glob
---

Review the requested feature without modifying the code.

Inspect the relevant implementation and surrounding code, against CLAUDE.md (architecture rules, invariants, access matrix, provisional values) and the feature IDs in conception/fonctionnalites.md.

Return:

## Summary
What changed.

## Critical
Problems that can break functionality, data, security or the invariants.

## Major
Important regressions or architectural issues.

## Minor
Smaller issues worth fixing.

## Verification
What was checked and what still needs verification.

If something cannot be verified, say so clearly.

# 0004. Classes and invitation (E2)

**Date**: 2026-10-14
**Status**: Accepted

## Summary

A teacher creates classes and invites students with a link or a code. Neither is stored: both derive from `invite_nonce` and `BETTER_AUTH_SECRET`, and expire one hour after the link is created (Q7). The teacher can remove and readmit a student. This spec documents shipped work (step E2).

## Requirements

**Acceptance criteria**: the criteria of CLS-01 to CLS-04 in `conception/fonctionnalites.md` §6, passed in E2.5.
- **AC-1**: Link and code are never stored; changing `BETTER_AUTH_SECRET` changes every code.
- **AC-2**: Every entry of a link or code goes through `tryInvite`; expiry `CLASS_INVITE_TTL`.
- **AC-3**: A removed student comes back only when the teacher readmits them (invariant 10).

## Decision

**Chosen option**: derived invitation (HMAC of the nonce), code of 8 Crockford Base32 symbols shown `XXXX-XXXX`, renewal instead of reactivation.

## Build plan

Shipped as E2.1 to E2.5.

## Consequences

**Neutral**:
- Values still to record from E2 are listed in `.claude/a-consigner.md`.

## Rationale

See [rationale.md](rationale.md).

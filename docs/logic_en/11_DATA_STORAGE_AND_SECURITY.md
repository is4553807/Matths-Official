# Data Storage and Security

## Authoritative state

MongoDB is authoritative for users, plans, learning progress, assessments, weekly mocks, matches, internal MMR, public competitive points, notifications, commerce, and operator audit. Process memory and browser storage are caches or interaction aids only.

Competitive-match settlements and weekly-mock internal-MMR settlements use separate ledgers and unique keys. Public rankings are calculated directly from the public points of placed competitive profiles.

## Files

Working images, profile media, PDFs, and archive files use purpose-specific storage through `fileStorageService`. MongoDB records provider, key, size, MIME type, hash, and retention state. Authorization is checked before a file is delivered.

## Web security

- Session cookies use environment-appropriate flags and the shared Mongo session store.
- Native API calls use Bearer authentication and role boundaries.
- Mutations use same-origin protection, rate limits, and input allowlists.
- CSP, HSTS, frame denial, MIME-sniffing denial, and scoped referrer policies are set.
- Uploads validate count, size, and content signatures.

## Sensitive data

Passwords are stored only as hashes. Guest birth dates are compared through a secret-key digest. Payment and Apple identifiers are retained only for ownership, replay protection, and accounting, and are excluded from ordinary user responses.

## Deletion and retention

Account deletion removes linked personal data and user-owned files according to policy. Legally required transaction records remain access-restricted. Schedulers purge temporary uploads and expired evidence.

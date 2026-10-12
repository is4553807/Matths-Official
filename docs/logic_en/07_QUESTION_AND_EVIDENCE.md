# Arena Questions and Working Evidence

## Question generation

Arena generates actual questions from the skeleton and type catalog. A match seals the rendered prompt, answer format, server answer, source accuracy rate, difficulty code, generation version, and any graph asset.

## Difficulty

- Normal uses U1–U9.
- Competitive uses R1–R9.
- A five-question set covers algebra, Calculus I, and probability/statistics in a 2–2–1 distribution.
- Normal uses hidden MMR, competitive uses internal MMR, and friendly uses mean participant MMR.
- A group challenge reuses the source match's exact five questions.

## Working capture

Desktop uploads and mobile grid boards converge on the same evidence model. Mobile boards use per-question revisions and compare-and-set writes to reject duplicate or stale updates. Finalizing five boards promotes them to original match evidence.

## Authorization

Participants can view both sides after their match result is released. Challenge participants can view challenge details after release. Operators require review authorization. Every file request checks database ownership and result state before returning a stream or provider URL.

## Integrity

The server validates file count, aggregate size, MIME type, and image signature, then records hashes and storage metadata. Normal and competitive evidence enters automated anomaly detection. A normal signal has no user penalty or result delay and only withholds that record from the opponent pool until approval. Competitive follows the existing operator-review path. Friendly and group challenges are not automatically screened.

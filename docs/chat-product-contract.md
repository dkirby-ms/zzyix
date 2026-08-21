---
title: Chat Product Contract
description: First-release chat feature scope, authorization rules, limits, and lifecycle behavior
ms.date: 2026-08-21
ms.topic: concept
keywords: [chat, authenticated, conversation, message retention, rate limit, authorization]
---

## Overview

This document freezes the scope and policies for the first-release chat feature. Chat is an authenticated, durable text conversation available to all active principals in the application. Message retention, rate limits, and authorization rules are explicitly defined below to prevent scope creep and ensure consistent implementation across client, server, storage, and test layers.

## First-Release Scope

### What is supported

- **Conversation scope**: One shared, product-defined conversation available to all authenticated principals. All principals with an active session can read, write to, and receive live updates for this conversation.
- **Message body**: Plain text, up to 2,000 characters, mandatory; no empty messages, no HTML rendering, no Markdown interpretation.
- **Message retention**: The server retains the newest 500 messages per conversation. When a message is persisted and a retention limit is exceeded, older messages are deleted.
- **Rate limit**: Each principal is limited to 10 sends per rolling minute. Exceeding this limit results in a `rate_limited` error and a `retryAfterSeconds` directive.
- **Authentication**: Only authenticated principals with an active session may join or send. Unauthenticated attempts result in `unauthorized` error.
- **Author lifecycle**: When a principal is deleted or deactivated, their messages are retained, but the author profile is replaced with a `Deleted user` label. No cascade deletion.
- **Delivery guarantee**: Messages are persisted before their accepted event is broadcast. Reconnecting principals receive replay of missed messages via cursor-based replay.
- **Message ordering**: Messages are ordered by server-assigned monotonic sequence within each conversation, never by client timestamp.

### What is explicitly deferred

The following features are **not** implemented in the first release:

- Message editing or deletion by author or moderator.
- Unread message indicators or inbox state.
- Typing indicators.
- Message reactions, threads, or replies.
- Direct/private messages or multi-room conversations.
- Message search or filtering.
- Moderation tooling, abuse reporting, or message flagging.
- Attachments, images, links, or rich formatting.
- Notification delivery (browser, email, push).
- User @mentions or tags.
- Message status (e.g., "read by X users").
- Conversation-level settings or member management UI.

## Authorization and Access Control

### Join and Read

- A principal may only join the shared conversation if authenticated and active.
- A principal may read the conversation's entire message history via cursor-based replay upon reconnect or explicit history request.
- Unauthorized (invalid token, expired session, or deactivated principal) principals receive an `unauthorized` error.

### Send

- A principal may only send if authenticated, active, and with a non-expired session.
- A send request must include only the message body and a client-assigned idempotency ID.
- A send request **must not** include author, timestamp, sequence, or any server-authoritative fields.
- A send that exceeds 2,000 characters is rejected with `invalid_request`.
- A send that exceeds the rate limit (10 per rolling minute) is rejected with `rate_limited` and includes `retryAfterSeconds`.
- A send that fails rate limit is **not** persisted.

### Authorization Boundaries

- The server derives the author principal from the authenticated Socket connection. Clients cannot override or change authorship.
- The server assigns the message ID, sequence, and timestamp. Clients cannot override these.
- The server enforces the 2,000-character limit and rate limit.
- Idempotency is reconciled server-side using the client-assigned idempotency ID and conversation scope.

## Data Model Invariants

### Message Fields

- **id** (server-assigned): Stable, unique identifier for the message, used in acknowledgements and missed-message recovery.
- **conversationId** (product-assigned): The canonical conversation ID.
- **principalId** (server-derived): The internal principal ID of the author.
- **authorProfile** (server-derived): A safe profile object with optional `displayName` and `email` (derived from the principal at message time). Deleted principals are labeled `{ displayName: "Deleted user" }`.
- **body** (client-provided, 1–2000 chars): Plain text message content.
- **sequence** (server-assigned): Monotonic ordering value unique per conversation.
- **createdAt** (server-assigned): Server timestamp of persistence (not client-supplied).
- **clientMessageId** (client-supplied): Idempotency key supplied by the client with each send. Used to reconcile retries and suppress duplicates.

### Uniqueness and Idempotency

- A message is uniquely identified by its server-assigned `id`.
- A send is idempotent by the triple `(conversationId, principalId, clientMessageId)`. If a duplicate send is received with the same triple, the server returns the same `id` and `sequence` from the existing message without creating a new row.
- The server maintains a uniqueness constraint on `(conversationId, principalId, clientMessageId)` to prevent duplicate persists.

### Retention and Deletion

- Retention is enforced at the conversation level. When a new message is persisted, if the conversation exceeds 500 messages, the oldest message is deleted.
- Principal deletion or deactivation does **not** cascade delete their messages. Messages remain; the author profile is updated to `{ displayName: "Deleted user" }`.

## Socket.IO Protocol and Events

### Client-to-Server Events

- **`chat_join`**: Client requests to join and receive initial history. Includes conversation ID and a cursor for replay start.
- **`chat_send`**: Client sends a message. Includes conversation ID, body, and idempotency ID. Response is an acknowledgement with the server-assigned message ID, sequence, and status.
- **`chat_leave`**: Client announces departure (optional; disconnect is sufficient).

### Server-to-Client Events

- **`chat_join` acknowledgement**: Server confirms the client has joined and returns initial history, an empty list when no prior messages exist, and the latest cursor.
- **`chat_message_accepted`**: Broadcast to all connected clients in the conversation when a new message is persisted and accepted. Idempotent retries receive an acknowledgement but do not broadcast a second event.
- **`chat_error`**: Server reports an error, such as unauthorized access or an invalid body, to the requesting client.

### Error Outcomes

All chat operations may result in one of these error outcomes:

- **`unauthorized`**: Principal is not authenticated or session has expired.
- **`rate_limited`**: Principal has exceeded 10 sends per rolling minute. Includes `retryAfterSeconds`.
- **`invalid_request`**: Body is empty, exceeds 2,000 characters, or other validation failed.
- **`duplicate`**: Idempotency ID matches an existing send; server returns the original message ID and sequence (no new message created).
- **`invalid_response`**: Server could not acknowledge (rare; usually indicates connection loss). Client should retry with same idempotency ID.
- **`disconnected`**: Socket connection lost. Client should reconnect and replay from the last known cursor.

## Testing and Validation

All implementations must verify:

- **Authorization**: Unauthenticated joins and sends are rejected. Deleted principals cannot send but their prior messages remain visible.
- **Ordering**: Messages are ordered by server sequence, never by client timestamp or insertion order.
- **Idempotency**: Duplicate sends (same idempotency ID) return the same message ID without creating a new row.
- **Rate limit**: Sends exceeding 10 per rolling minute are rejected and not persisted.
- **Retention**: When a conversation exceeds 500 messages, the oldest message is deleted.
- **Reconnect**: A client reconnecting with a cursor receives only messages newer than the cursor.
- **Broadcast**: All connected clients in the conversation receive one `chat_message_accepted` event when a new message is persisted.

## Related Documents

- `.copilot-tracking/details/2026-08-21/chat-feature-details.md` — Implementation steps and file ownership.
- `.copilot-tracking/research/2026-08-21/chat-feature-research.md` — Architecture research and decision rationale.
- `apps/server/src/contracts.ts` — Shared Socket.IO event and payload types.

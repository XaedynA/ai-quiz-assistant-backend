# AI Quiz Assistant — Backend API

![Quality checks](https://github.com/XaedynA/ai-quiz-assistant-backend/actions/workflows/tests.yml/badge.svg)
A Node.js/Express backend for an AI-powered quiz assistant. It verifies Supabase user sessions, generates explanations through the OpenAI Responses API, and tracks per-user question usage.

> **Portfolio scope:** This repository contains the backend API, not the browser-extension UI.

## Features

- Authenticated API routes using Supabase access tokens
- AI-assisted answers and short explanations for quiz questions
- Profile lookup for plan, subscription status, and question usage
- Per-user question limits and usage tracking
- JSON responses for integration with a browser extension or other frontend

## Tech stack

JavaScript · Node.js · Express · OpenAI API · Supabase

## Getting started

**Prerequisites:** Node.js 22+, an OpenAI API key, and a configured Supabase project with a `profiles` table.

```bash
npm ci
cp .env.example .env
```

Apply `migrations/001_atomic_usage.sql` to your existing Supabase project using a trusted migration connection **before starting this version**. Review and back up the schema first; the migration revokes client quota writes. Do not apply it automatically to production.

Edit `.env` with your **own** credentials. Never commit `.env` or share server-side keys. Start the API:

```bash
npm start
```

The server listens at `http://localhost:3000`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI API credential |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only Supabase key; never expose to clients |

## API endpoints

`GET /health` is public. All other documented endpoints require `Authorization: Bearer <supabase_access_token>`.

### `GET /profile`

Returns the authenticated user's plan, usage, limit, and subscription status.

### `POST /answer`

Example request body:

```json
{
  "question": "Which HTTP status code means Not Found?",
  "choices": ["200", "201", "404", "500"]
}
```

Example successful response shape (illustrative):

```json
{
  "answer": "C",
  "answerText": "404",
  "explanation": "404 indicates the requested resource was not found.",
  "questionsUsed": 1,
  "questionLimit": 100
}
```

## Supabase data requirements

The API expects a `profiles` table keyed by the authenticated user's `id` with these fields: `plan`, `questions_used`, `question_limit`, and `subscription_status`. The migration adds atomic reservations to an existing profiles table. IDs must be UUIDs; counters must be nonnegative integers. Create profiles through a trusted signup trigger/admin flow. Configure RLS so users can read only their own profile; clients must never edit quota, plan, or subscription fields.

## Reliability and security controls

- Validates input types, lengths and choice count; rejects malformed JSON and bodies over 32 KB.
- Verifies bearer tokens server-side; SDK failures do not expose internal errors or credentials.
- Uses a configurable CORS allowlist (`ALLOWED_ORIGINS`, comma separated), no-store responses, and 60 requests/minute per IP.
- Reserves quota atomically in PostgreSQL **before** a provider call; failures request an idempotent refund.
- Validates model JSON and answer letters; limits provider output and uses a 30-second timeout with retries disabled.
- Preserves `/profile`, `/answer` and successful response field names. New `GET /health` supports uptime checks.
- Imports without starting a server, allowing injected fake providers and credential-free API tests.

```bash
npm test
npm run check
```

CI runs API tests on Node 22 and 24, plus real PostgreSQL tests for simultaneous reservations, duplicate refunds, and forbidden client quota writes. No paid API calls or production credentials are needed.

## Deployment boundaries and recovery

This is a portfolio backend, not a complete billing service. Subscription status is informational; the trusted `question_limit` is authoritative. Rate limiting is in-memory and per process; use a shared gateway/store for multiple replicas. The default bind address is loopback (`HOST=127.0.0.1`); configure TLS and a carefully trusted reverse proxy for public deployment. Do not blindly trust forwarded IP headers.

`OPENAI_MODEL` defaults to `gpt-5-mini`; `PORT` defaults to 3000. Explicitly allow your frontend/extension origin. CORS is a browser policy, not authentication.

A crash or database outage after quota reservation can leave a row in `question_reservations`. Monitor old rows and reconcile them manually: call `finish_question(reservation_id, true)` only after confirming the request failed and is no longer running. Successful finalized reservations cannot be refunded again. Never log tokens, questions or raw provider errors. There is no automatic retry of generation after a failure; repeated client submissions may incur multiple successful uses.

Local tests stub external providers; PostgreSQL CI checks the actual migration, but does not replace a staging Supabase integration test. The migration requires review against existing grants, RLS policies, signup and billing workflows. No hosted database is modified by this PR.

## Security

- Keep the Supabase server-side key and OpenAI key only on the server.
- Never commit `.env`, API keys, session tokens, or database credentials.
- Rotate any credentials previously included in a shared archive.
- Review authentication, authorization, and usage tracking before production deployment.

## Project notes

Built as a personal software project to practice API integration, authentication, backend development, and debugging.

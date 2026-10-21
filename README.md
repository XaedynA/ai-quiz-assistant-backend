# AI Quiz Assistant — Backend API

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

**Prerequisites:** Node.js, an OpenAI API key, and a configured Supabase project with a `profiles` table.

```bash
npm ci
cp .env.example .env
```

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

All endpoints require `Authorization: Bearer <supabase_access_token>`.

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

The API expects a `profiles` table keyed by the authenticated user's `id` with these fields: `plan`, `questions_used`, `question_limit`, and `subscription_status`. This repository does not include a database migration; you must set up the schema and access policies in your own Supabase project.

## Current limitations and next steps

This is a portfolio demonstration of an existing backend, **not a production-hardened service**. Before deploying publicly, add request validation, rate limiting, restricted CORS origins, robust model-response validation, and atomic usage accounting (to avoid concurrent requests bypassing limits). Add automated tests and deployment documentation. The existing code does not currently enforce subscription status separately from usage limits.

## Security

- Keep the Supabase server-side key and OpenAI key only on the server.
- Never commit `.env`, API keys, session tokens, or database credentials.
- Rotate any credentials previously included in a shared archive.
- Review authentication, authorization, and usage tracking before production deployment.

## Project notes

Built as a personal software project to practice API integration, authentication, backend development, and debugging.

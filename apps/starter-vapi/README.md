# `@repo/starter-vapi`

Runnable starter template: **Vapi voice agent + Smaran memory** in ~90
lines. Points your Vapi assistant's Server URL at this app, and:

- Every user turn (partial → final transcript) flows into a per-call
  `StreamingSession` that scrubs ASR noise and fires save
  fire-and-forget.
- Every function call the model makes (`memory_save`, `memory_recall`)
  is answered from the API with the exact response body Vapi expects.
- End-of-call cleanup drops the session and its hot cache.

## Run it

```bash
cp apps/starter-vapi/.env.example apps/starter-vapi/.env
$EDITOR apps/starter-vapi/.env   # set SMARAN_API_KEY
bun --filter '@repo/starter-vapi' dev
```

Expose the port to the public internet (ngrok, Cloudflare Tunnel,
deploy to Fly/Railway) and paste that URL into your Vapi assistant's
Server URL field. In the assistant's dashboard, register the two
functions from `GET /functions` so the model can call them.

That's it. Every future call to that assistant has memory.

# Environment Files

Use a dedicated environment file per context.

## Production

Create `server/.env` with your production values.
Set `CLIENT_URL` to your frontend domain (`https://www.hokoapp.in`).
If you use multiple frontend domains, set a comma-separated list.

## Development

Create `server/.env.development` with local values.
The dev script already loads it:

```bash
npm run dev
```

## Example

Use `server/.env.example` for production and `server/.env.development.example` for local development.

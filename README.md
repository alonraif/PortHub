# SSH Connections Library

A lightweight, Dockerized web UI for managing SSH connection profiles with encrypted storage.

## Features
- Password-protected UI
- Encrypted connection details (AES-256-GCM at rest)
- Add/edit/delete connection profiles
- Organize connections into folders and move them between folders
- Static or dynamic ports (prompted at connect time)
- Connect action copies the CLI command to the clipboard

## Quick start

1. Copy environment file:

```bash
cp .env.example .env
```

2. Set values in `.env`:

- `APP_PASSWORD`: password to access the UI
- `SESSION_SECRET`: long random string
- `ENCRYPTION_KEY`: 32-byte base64 key (example in `.env.example`)

3. Run with Docker:

```bash
docker compose up --build
```

Open http://localhost:3000

## Notes
- The app stores host/username/password encrypted inside SQLite. The encryption key is required to decrypt records.
- Browser security restrictions prevent running `ssh` directly. The UI generates the SSH command and copies it to the clipboard.
- Stored passwords are not injected into the SSH command. If you need password-based auth, run the command manually and enter it when prompted.

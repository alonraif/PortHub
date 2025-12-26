# PortHub

PortHub is a lightweight, Dockerized web UI for managing SSH connection profiles with encrypted storage. It focuses on a clean workflow: define connections once, copy the SSH command when you need it, and keep secrets encrypted at rest.

## Highlights
- Password-protected UI with session support
- AES-256-GCM encryption for stored connection data
- Folder-based organization with collapse/expand behavior
- Static or dynamic ports (prompted at connect time)
- One-click copy of the SSH command to your clipboard
- SQLite persistence with a simple local data directory

## How it works
1. You create connection profiles (host, username, optional password, port).
2. PortHub stores encrypted fields in SQLite.
3. When you click "Copy SSH Command", the app generates an SSH command and copies it to the clipboard.
4. You paste the command into your SSH client and connect.

PortHub does not execute SSH commands directly in the browser. This keeps the UI simple and avoids browser security limitations.

## Quick start (Docker)

1. Copy the environment file:

```bash
cp .env.example .env
```

2. Set values in `.env`:

- `APP_PASSWORD`: password to access the UI
- `SESSION_SECRET`: long random string for sessions
- `ENCRYPTION_KEY`: 32-byte base64 key (example in `.env.example`)

3. Build and run:

```bash
docker compose up --build
```

Open http://localhost:3000

## Configuration

PortHub uses environment variables:

- `APP_PASSWORD`: required for login
- `SESSION_SECRET`: required for sessions
- `ENCRYPTION_KEY`: required to encrypt/decrypt stored fields (32-byte base64)
- `PORT`: optional, defaults to `3000`
- `HOST`: optional, defaults to `0.0.0.0`
- `LOGIN_WINDOW_MS`: optional, defaults to `600000` (10 minutes)
- `LOGIN_MAX_ATTEMPTS`: optional, defaults to `5`

If you change `ENCRYPTION_KEY`, existing records cannot be decrypted.

## Data storage

- Database file: `data/ssh_library.sqlite`
- The `data/` directory is mounted into the container by `docker-compose.yml`
- `.env` and `data/` are ignored by git for safety
  - Optional key file location: `data/key`

For backups, copy the `data/` directory while the container is stopped.

## Using the UI

### Connections
- Add a new connection with a host, username, and port.
- Passwords are optional and stored encrypted.
- Click "Copy SSH Command" to copy the SSH command for that connection.

### Dynamic ports
If a connection is set to "port is dynamic":
- You are prompted for a port when you connect.
- The command format is:
  - `ssh -p <port> root@reverse-ssh-production`

### Folders
- Create folders to organize connections.
- Folders start collapsed by default.
- Only one folder can be expanded at a time.
- Use "Move Folder" on a connection to move it between folders.

### Database tools
- Use "Export DB" to download an encrypted backup (requires a password).
- Use "Import DB" to replace all existing data from an encrypted export (password required).

## Local development (without Docker)

1. Install dependencies:

```bash
npm install
```

2. Set environment variables (same as `.env`), then run:

```bash
npm start
```

The server runs on http://localhost:3000

## Security notes
- Encryption is performed server-side; the key never leaves the host.
- Stored passwords are not injected into the SSH command.
- Session cookies are handled by `express-session`.
- Do not commit `.env` or `data/` to version control.
- Bind to localhost to keep the UI local-only (`HOST=127.0.0.1`).
- Set strong `APP_PASSWORD` and `SESSION_SECRET` values.
- Keep `data/` owner-only (chmod 700) to protect the encrypted database and key file.

## Troubleshooting

### Login fails
- Ensure `APP_PASSWORD` is set in your `.env`.

### Decryption errors
- Verify `ENCRYPTION_KEY` is correct and unchanged.

### Nothing is copied
- Ensure your browser allows clipboard access.
- Click the "Copy" button in the command panel if needed.

## License

Private project. Add a license if you plan to distribute.

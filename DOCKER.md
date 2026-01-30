# Docker Guide – Oly Backend

Step-by-step instructions to build and run the Oly backend with Docker.

---

## Prerequisites

1. **Install Docker**
   - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/) (includes Docker Compose)
   - Or: Docker Engine + Docker Compose CLI

2. **Start Docker Desktop**  
   Open the Docker app and wait until it shows “Docker Desktop is running”.

3. **Check installation**
   ```bash
   docker --version
   docker compose version
   ```

   **If `docker` is not found** (e.g. in Cursor’s terminal), add Docker’s CLI to your PATH. In your shell config (e.g. `~/.zshrc`), add:
   ```bash
   export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
   ```
   Then run `source ~/.zshrc` or open a new terminal.

---

## Option A: Build and run the image only (no MongoDB in Docker)

Use this when MongoDB runs elsewhere (e.g. Atlas, or local MongoDB).

### Step 1: Build the image

From the project root (`oly-backend`):

```bash
docker build -t oly-backend .
```

- `-t oly-backend` = tag name for the image  
- `.` = build context (current directory)

### Step 2: Run the container

```bash
docker run -d \
  --name oly-backend-app \
  -p 8080:8080 \
  -e MONGODB_URI="mongodb://your-mongo-host:27017/oly-backend" \
  -e NODE_ENV=production \
  -e PORT=8080 \
  oly-backend
```

- `-d` = run in background  
- `--name oly-backend-app` = container name  
- `-p 8080:8080` = host port 8080 → container port 8080  
- `-e` = environment variables (set `MONGODB_URI` to your real MongoDB URL)

### Step 3: Check it’s running

```bash
# List running containers
docker ps

# Logs
docker logs oly-backend-app

# Call the API
curl http://localhost:8080/
```

### Step 4: Stop and remove

```bash
docker stop oly-backend-app
docker rm oly-backend-app
```

---

## Option B: Run backend + MongoDB with Docker Compose

Use this to run both the app and MongoDB in containers (e.g. local dev).

### Step 1: Build and start

From the project root:

```bash
docker compose up -d --build
```

- `--build` = build the backend image  
- `-d` = run in background  

### Step 2: Check services

```bash
docker compose ps
docker compose logs -f backend
```

### Step 3: Use the API

- API: http://localhost:8080  
- MongoDB: localhost:27017 (if you need to connect from host)

### Step 4: Stop and clean up

```bash
docker compose down
# Remove MongoDB data as well (optional):
docker compose down -v
```

---

## Useful commands

| Task | Command |
|------|--------|
| Build image | `docker build -t oly-backend .` |
| Run container | `docker run -d -p 8080:8080 -e MONGODB_URI=... oly-backend` |
| View logs | `docker logs -f <container_name>` |
| Shell into container | `docker exec -it <container_name> sh` |
| List images | `docker images` |
| Remove image | `docker rmi oly-backend` |
| Compose up | `docker compose up -d --build` |
| Compose down | `docker compose down` |

---

## Environment variables

Pass these when running the container (e.g. `-e VAR=value` or in `docker-compose.yml`):

| Variable | Description | Example |
|----------|-------------|--------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://mongo:27017/oly-backend` |
| `PORT` | Server port (default 8080) | `8080` |
| `NODE_ENV` | Environment | `production` or `development` |

---

## Pushing the image to a registry (optional)

**Docker Hub:**

```bash
docker tag oly-backend your-username/oly-backend:latest
docker push your-username/oly-backend:latest
```

**Other registries:**  
Use the same pattern: tag with `registry-host/username/oly-backend:tag`, then `docker push`.

---

## Troubleshooting

- **“Cannot connect to MongoDB”**  
  - With Compose: ensure `MONGODB_URI` uses hostname `mongo` (service name).  
  - With `docker run`: use your real MongoDB host (e.g. `host.docker.internal`, IP, or Atlas URI).

- **Port 8080 already in use**  
  - Change host port: `-p 8080:8080` (then open http://localhost:8080).

- **Build fails on `npm ci`**  
  - Ensure `package-lock.json` exists: run `npm install` locally, then rebuild.

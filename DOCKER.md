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

## Important: set MONGODB_URI when running the image

If you **run the image alone** (e.g. Docker Desktop “Run” or `docker run olybackend:latest`), the app will exit with **“MONGODB_URI is not set”** unless you pass the variable.

- **Recommended:** use **docker compose up** so the backend and MongoDB start together and `MONGODB_URI` is set automatically.
- **Or** when running the image alone, add the env var (e.g. in Docker Desktop run options set `MONGODB_URI=mongodb://host.docker.internal:27017/oly-backend` if MongoDB is on your host, or use your Atlas URI).

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

## Test Docker locally (quick checklist)

Use this to confirm your Docker setup works end-to-end on your machine.

### 1. Start the stack

From the project root (`oly-backend`):

```bash
docker compose up -d --build
```

Wait a few seconds for MongoDB and the backend to start.

### 2. Check containers are running

```bash
docker compose ps
```

You should see `backend` and `mongo` with status “Up”. If the backend keeps restarting, check logs:

```bash
docker compose logs backend
```

### 3. Hit the API (from your host)

**Base URL:** `http://localhost:8080` (or the port you mapped, e.g. 8080).

**Health check:**

```bash
curl http://localhost:8080/api/health
```

Expected: `{"success":true,"message":"API is running",...}`

**Root (optional):**

```bash
curl http://localhost:8080/
```

Expected: `{"success":true,"message":"Welcome to Oly Backend API",...}`

**Signup:**

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

Expected: `201` with `{"success":true,"data":{"_id":"...","name":"Test User","email":"test@example.com",...}}`. Copy the `_id` from the response.

**Signin:**

```bash
curl -X POST http://localhost:8080/api/users/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Expected: `200` with user data. Copy `data._id` if you didn’t from signup.

**Profile (replace `USER_ID` with the `_id` from signup/signin):**

```bash
curl http://localhost:8080/api/profile \
  -H "x-user-id: USER_ID"
```

Expected: `200` with `{"success":true,"data":null,...}` (no profile yet) or profile data.

**Get current user + profile:**

```bash
curl http://localhost:8080/api/users/me \
  -H "x-user-id: USER_ID"
```

Expected: `200` with full user (no password) and `profile`.

### 4. Stop when done

```bash
docker compose down
```

If all the curl commands above return the expected responses, your Docker setup is working locally.

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

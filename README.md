# Server Installation Guide

## Prerequisites

Before you start, make sure you have these installed:

- **Docker Desktop** (includes Docker and Docker Compose)
  - [Download for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Download for Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Download for Linux](https://docs.docker.com/desktop/install/linux-install/)

To verify Docker is installed:

```bash
docker --version
docker-compose --version
```

You should see version numbers. If not, Docker isn't installed properly.

---

## First Time Setup

### 1. Clone the repository

```bash
git clone https://github.com/Sijill/sijill-backend.git
cd sijill-backend
```

### 2. Create your environment file

```bash
cp .env.example .env
```

### 3. Edit the .env file

Open `.env` and add your JWT secret:

```env
JWT_ACCESS_SECRET=<secret_key>
```

**How to generate a secure JWT secret:**

```bash
openssl rand -hex 64
```

### 4. Start everything

```bash
docker-compose up --build
```

Wait until you see:

```
sijill-api        | Application is running on PORT 8000
sijill-postgres   | database system is ready to accept connections
sijill-mailpit    | [server] started SMTP server
```

**🎉 You're done! Everything is running.**

---

## Accessing Services

Once everything is running:

| Service            | URL                   | Description                             |
| ------------------ | --------------------- | --------------------------------------- |
| **API**            | http://localhost:8000 | NestJS backend Server                   |
| **Mailpit Web UI** | http://localhost:8025 | View all emails sent by the app         |
| **Database**       | localhost:5432        | PostgreSQL (use a DB client to connect) |

---

## Common Commands

### Starting & Stopping

```bash
# Start everything (first time or after changes)
docker-compose up --build

# Start everything in background (detached mode)
docker-compose up -d

# Stop everything (keeps data)
docker-compose down

# Stop everything and DELETE all data (fresh start)
docker-compose down -v

# Restart just the API (after code changes)
docker-compose restart api
```

### Check What's Running

```bash
# See all running containers
docker ps

# See all containers (running and stopped)
docker ps -a
```

You should see three containers:

- `sijill-api`
- `sijill-postgres`
- `sijill-mailpit`

### View Logs

```bash
# View logs from all services
docker-compose logs

# Follow logs in real-time (Ctrl+C to stop)
docker-compose logs -f

# View logs for specific service
docker-compose logs api
docker-compose logs postgres
docker-compose logs mailpit

# Follow logs for specific service
docker-compose logs -f api
```

---

## Working with the Database

### Connect to PostgreSQL with a GUI tool

Use any PostgreSQL client (DBeaver, pgAdmin, TablePlus, etc.) with these credentials:

```
Host: localhost
Port: 5432
Database: sijill
Username: sijill
Password: sijill
```

### Run SQL commands directly

```bash
# Connect to PostgreSQL container
docker exec -it sijill-postgres psql -U sijill -d sijill

# Now you're inside PostgreSQL, run SQL:
SELECT * FROM users;
\dt                    # List all tables
\d users               # Describe users table
\q                     # Quit
```

### Reset the database (delete all data)

```bash
# Stop containers and delete database volume
docker-compose down -v

# Start fresh (will run schema.sql again)
docker-compose up --build
```

---

## Working with Emails

All emails sent by your application are captured by Mailpit.

### View emails in the web UI

1. Open http://localhost:8025
2. You'll see all emails sent by the app
3. Click any email to view it

---

## Working with Uploaded Files

All files uploaded through the API are stored in the `uploads/` directory.

### View uploaded files

```bash
# From your project root
ls -la uploads/

# View files in each category
ls -la uploads/identity/
ls -la uploads/workplace/
ls -la uploads/clinical/
```

### Access files

Files are synced between your computer and the Docker container:

- Files uploaded via API → appear in `uploads/` on your machine
- Files you manually add to `uploads/` → visible to the container

### Clear uploaded files

```bash
# Delete all uploaded files
rm -rf uploads/identity/*
rm -rf uploads/workplace/*
rm -rf uploads/clinical/*

# Or delete everything
rm -rf uploads/*
```

---

## Troubleshooting

### "Port already in use" error

If you see errors like `bind: address already in use`, something else is using that port.

**Check what's using the port:**

```bash
# On Mac/Linux
lsof -i :8000   # Check port 8000 (API)
lsof -i :5432   # Check port 5432 (PostgreSQL)
lsof -i :8025   # Check port 8025 (Mailpit)

# On Windows (PowerShell)
netstat -ano | findstr :8000
```

**Fix it:**

- Stop the other service using that port
- Or change the port in `docker-compose.yaml`

### Container won't start

```bash
# View detailed error logs
docker-compose logs <service-name>

# Examples:
docker-compose logs api
docker-compose logs postgres
```

### Database connection fails

```bash
# Make sure PostgreSQL is healthy
docker ps

# Check for "healthy" status in the STATUS column
# If it says "unhealthy" or "starting", wait a bit longer

# Check PostgreSQL logs
docker-compose logs postgres
```

### Need to rebuild after code changes

```bash
# Stop everything
docker-compose down

# Rebuild and restart
docker-compose up --build
```

### Complete reset (nuclear option)

```bash
# Stop and remove everything
docker-compose down -v

# Remove all Docker images (frees up space)
docker system prune -a

# Rebuild from scratch
docker-compose up --build
```

---

## Development Workflow

### Making code changes

1. Edit your code
2. The container will automatically restart (if you're running `docker-compose up`)
3. Check logs: `docker-compose logs -f api`

### Testing email functionality

1. Trigger an action that sends email (e.g., register, login, password reset)
2. Open http://localhost:8025
3. See the email instantly

### Database changes

If you modify `src/modules/database/schema.sql`:

```bash
# You need to recreate the database
docker-compose down -v
docker-compose up --build
```

---

## Useful Docker Commands Reference

### Container Management

```bash
# Start containers
docker-compose up                 # Start and show logs
docker-compose up -d              # Start in background

# Stop containers
docker-compose down               # Stop (keeps data)
docker-compose down -v            # Stop and delete volumes (deletes data)

# Restart
docker-compose restart            # Restart all
docker-compose restart api        # Restart specific service
```

### Viewing Info

```bash
# List containers
docker ps                         # Running containers
docker ps -a                      # All containers

# View logs
docker-compose logs               # All logs
docker-compose logs -f            # Follow logs (real-time)
docker-compose logs -f api        # Follow specific service
docker-compose logs --tail=100 api # Last 100 lines

# Container stats (CPU, memory usage)
docker stats
```

### Executing Commands in Containers

```bash
# Access API container shell
docker exec -it sijill-api sh

# Access PostgreSQL shell
docker exec -it sijill-postgres psql -U sijill -d sijill

# Run a one-off command
docker exec sijill-api npm run test
```

### Cleanup

```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove everything (careful!)
docker system prune -a

# Remove specific container
docker rm sijill-api

# Remove specific volume
docker volume rm sijill-backend_postgres_data
```

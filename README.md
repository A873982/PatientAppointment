# Patient Appointment System

A modern **Patient Appointment Management System** built with a full-stack architecture using **React, Node.js, PostgreSQL, and Google Cloud**.

---

# Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js API (`/api`)
- **Database:** PostgreSQL
- **Cloud Platform:** Google Cloud Platform (Cloud SQL + Cloud Run)
- **AI Integration:** Gemini API

---

# Run and Deploy Patient Appointment

## Local Development

### Prerequisites

Install the following tools before running the project.

### 1. Install Node.js
Download and install Node.js:

https://nodejs.org/en/download

---

### 2. Install PostgreSQL
Download and install PostgreSQL:

https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

---

# Step 1 — Setup PostgreSQL Database

After installing PostgreSQL:

1. Open **pgAdmin** from the Start Menu.
2. Select **Servers** in the Object Explorer (left panel).
3. Enter the **password you set during installation**.
4. Open **Query Tool** from the **Tools** menu.
5. Run the following SQL commands:

```sql
-- Create Database and user
CREATE DATABASE patient_appointment;
CREATE USER patient_app WITH PASSWORD 'your_password';

-- DB-level access
GRANT CONNECT ON DATABASE patient_appointment TO patient_app;

-- Schema access
GRANT USAGE, CREATE ON SCHEMA public TO patient_app;

-- Existing objects
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO patient_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO patient_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO patient_app;

-- Future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO patient_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO patient_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO patient_app;
```

---

# Step 2 — Install Project Dependencies

Open a **Terminal (Windows Command Prompt)** in the project folder and run:

```bash
npm install
```

---

# Step 3 — Configure Environment Variables

Run the following commands in the **same terminal window**:

```bash
set DB_HOST=127.0.0.1
set DB_PORT=5432
set DB_NAME=patient_appointment
set DB_USER=patient_app
set DB_PASSWORD=your_password
set GEMINI_API_KEY=your_gemini_api_key
```

⚠️ Important:  
Do **not close the terminal** after setting these variables, otherwise you will need to set them again.

---

# Step 4 — Run Database Migration and API

In the same terminal window run:

```bash
npm run migrate
npm run dev:api
```

This will:

- Run database migrations
- Start the Node.js API server

---

# Step 5 — Start the Frontend

Open a **new terminal window** in the same project folder.

Run the following commands:

```bash
set GEMINI_API_KEY=your_gemini_api_key
npm run dev
```

This will start the **React Vite development server**.

---

# Secrets in GCP (Terraform)

Terraform expects the following secrets to be stored in **Google Secret Manager**.

Required secrets:

- `gemini_api_secret_id`
- `db_password_secret_id`

### Deployment Behavior

- **Cloud Run** reads secrets via secret references
- **Cloud SQL user password** is retrieved from Secret Manager during Terraform apply
- Terraform automatically creates a dedicated Cloud Run runtime service account

```
cloud_run_service_account_id
```

---

# Live API Authentication Hardening

Security improvements implemented to protect API credentials.

### Key Changes

- The **browser no longer receives the long-lived Gemini API key**
- The frontend requests a **short-lived one-time token**

### Endpoint

```
POST /api/live/auth-token
```

### Authentication Flow

1. Frontend calls `/api/live/auth-token`
2. Backend uses `GEMINI_API_KEY` server-side
3. API generates **ephemeral Live API tokens (`v1alpha`)**
4. A **short-lived token** is returned to the browser

This ensures that the **main Gemini API key is never exposed to the frontend**.

---

# Project Structure

```
project-root
│
├── api/                 # Node.js backend APIs
├── src/                 # React frontend
├── migrations/          # Database migrations
├── terraform/           # Infrastructure as Code
├── package.json
└── README.md
```

---

# Development Commands

| Command | Description |
|--------|-------------|
| `npm install` | Install dependencies |
| `npm run migrate` | Run database migrations |
| `npm run dev:api` | Start Node.js API server |
| `npm run dev` | Start React development server |

---

# License

This project is intended for internal development and experimentation.
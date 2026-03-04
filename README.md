<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy Patient Appointment

This project now uses:
- React frontend (Vite)
- Node.js API (`/api`) for booking/auth/admin operations
- PostgreSQL (Cloud SQL in GCP) as persistent database

## Local development

Prerequisites: Node.js + PostgreSQL.

1. Install dependencies:
   `npm install`
2. Set environment variables for the API (PowerShell example):
   - `$env:DB_HOST="127.0.0.1"`
   - `$env:DB_PORT="5432"`
   - `$env:DB_NAME="patient_appointment"`
   - `$env:DB_USER="patient_app"`
   - `$env:DB_PASSWORD="your_password"`
   - `$env:GEMINI_API_KEY="your_gemini_api_key"`
3. Run DB migrations:
   `npm run migrate`
4. Start API:
   `npm run dev:api`
5. In another terminal, start frontend:
   `npm run dev`

## Secrets in GCP (Terraform)

Terraform now expects both Gemini key and DB password from Secret Manager:
- `gemini_api_secret_id`
- `db_password_secret_id`

Cloud Run reads secrets via secret references, and Cloud SQL user password is read from Secret Manager during apply.
Terraform also creates a dedicated Cloud Run runtime service account automatically (`cloud_run_service_account_id`).

# ---------------------------------------------------------------------------
# Required — must be set in terraform.tfvars or via -var flag
# ---------------------------------------------------------------------------

variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy (e.g. 'latest' or a git SHA)"
  type        = string
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "patient_appointment"
}

variable "db_user" {
  description = "PostgreSQL application user"
  type        = string
  default     = "patient_app"
}

variable "gemini_api_secret_id" {
  description = "Secret Manager secret id containing Gemini API key"
  type        = string
}

variable "gemini_api_secret_version" {
  description = "Gemini API key secret version"
  type        = string
  default     = "latest"
}

variable "db_password_secret_id" {
  description = "Secret Manager secret id containing PostgreSQL app user password"
  type        = string
}

variable "db_password_secret_version" {
  description = "DB password secret version"
  type        = string
  default     = "latest"
}

variable "cloud_run_service_account_id" {
  description = "Service account id (name) for Cloud Run runtime"
  type        = string
  default     = "patient-appointment-sa"
}

variable "iap_allowed_users" {
  description = "List of IAM users (user:email) allowed to invoke the Cloud Run service"
  type        = list(string)
}

variable "iap_allowed_groups" {
  description = "List of IAM groups (group:email) allowed to invoke the Cloud Run service"
  type        = list(string)
}

variable "iap_service_account" {
  description = "IAP system service account email (format: service-NNNN@gcp-sa-iap.iam.gserviceaccount.com)"
  type        = string
}

# ---------------------------------------------------------------------------
# Optional — sane defaults provided, override in tfvars if needed
# ---------------------------------------------------------------------------

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Name of the Cloud Run service and related resources"
  type        = string
  default     = "patient-appointment"
}

variable "repository_name" {
  description = "Artifact Registry repository name"
  type        = string
  default     = "patient-appointment-repo"
}

variable "cloud_run_cpu" {
  description = "vCPU limit for each Cloud Run container instance"
  type        = string
  default     = "1000m"
}

variable "cloud_run_memory" {
  description = "Memory limit for each Cloud Run container instance"
  type        = string
  default     = "512Mi"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-1-3840"
}

variable "vpc_network_name" {
  description = "Name of the Shared VPC network for Cloud Run egress"
  type        = string
  default     = "polaris-dev-vpc"
}

variable "vpc_subnet_name" {
  description = "Name of the Shared VPC subnetwork for Cloud Run egress"
  type        = string
  default     = "polaris-dev-subnet"
}

variable "api_gateway_id" {
  description = "Gateway resource ID (must be globally unique within the project)"
  type        = string
  default     = "patient-appointment-gateway"
}

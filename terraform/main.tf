# Enable necessary APIs
resource "google_project_service" "run_api" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry_api" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild_api" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin_api" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager_api" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "cloud_run_sa" {
  account_id   = var.cloud_run_service_account_id
  display_name = "Cloud Run runtime service account for ${var.service_name}"
}


# Data sources for VPC
data "google_compute_network" "vpc_network" {
  name = var.vpc_network_name
}

data "google_compute_subnetwork" "subnet" {
  name   = var.vpc_subnet_name
  region = var.region
}

data "google_secret_manager_secret_version" "db_password" {
  project = var.project_id
  secret  = var.db_password_secret_id
  version = var.db_password_secret_version
}

# Artifact Registry Repository
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
  description   = "Docker repository for Patient Appointment app"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry_api]
}

# Cloud SQL (PostgreSQL)
resource "google_sql_database_instance" "postgres" {
  name             = "${var.service_name}-pg"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = var.cloud_sql_tier
    ip_configuration {
      ipv4_enabled = true
    }
  }

  deletion_protection = false

  depends_on = [google_project_service.sqladmin_api]
}

resource "google_sql_database" "app_db" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app_user" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = data.google_secret_manager_secret_version.db_password.secret_data
}

resource "google_secret_manager_secret_iam_member" "gemini_secret_accessor" {
  project   = var.project_id
  secret_id = var.gemini_api_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "db_secret_accessor" {
  project   = var.project_id
  secret_id = var.db_password_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "default" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run_sa.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository_name}/${var.service_name}:${var.image_tag}"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
      }

      env {
        name  = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.gemini_api_secret_id
            version = var.gemini_api_secret_version
          }
        }
      }

      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.postgres.connection_name
      }

      env {
        name  = "DB_NAME"
        value = var.db_name
      }

      env {
        name  = "DB_USER"
        value = var.db_user
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = var.db_password_secret_id
            version = var.db_password_secret_version
          }
        }
      }

      env {
        name  = "DB_PORT"
        value = "5432"
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = data.google_compute_network.vpc_network.id
        subnetwork = data.google_compute_subnetwork.subnet.id
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.run_api,
    google_artifact_registry_repository.repo,
    google_project_service.secretmanager_api,
    google_sql_database.app_db,
    google_sql_user.app_user,
    google_secret_manager_secret_iam_member.gemini_secret_accessor,
    google_secret_manager_secret_iam_member.db_secret_accessor,
    google_project_iam_member.cloud_run_sql_client
  ]
}

# ------------------------------------------------------------------------------
# API Gateway Configuration
# ------------------------------------------------------------------------------

# Enable required APIs for Gateway
resource "google_project_service" "gateway_apis" {
  for_each = toset([
    "apigateway.googleapis.com",
    "servicemanagement.googleapis.com",
    "servicecontrol.googleapis.com",
    "apikeys.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# Service Account for API Gateway
resource "google_service_account" "api_gateway_sa" {
  account_id   = "api-gateway-sa"
  display_name = "API Gateway Service Account for ${var.service_name}"
}

# API Definition
resource "google_api_gateway_api" "api" {
  provider   = google-beta
  api_id     = "${var.service_name}-api"
  project    = var.project_id
  depends_on = [google_project_service.gateway_apis]
}

# API Config
resource "google_api_gateway_api_config" "config" {
  provider = google-beta
  api      = google_api_gateway_api.api.api_id
  project  = var.project_id

  openapi_documents {
    document {
      path = "spec.yaml"
      contents = base64encode(templatefile("${path.module}/api_spec.yaml.tftpl", {
        cloud_run_url = google_cloud_run_v2_service.default.uri
      }))
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Gateway Resource
resource "google_api_gateway_gateway" "gateway" {
  provider   = google-beta
  api_config = google_api_gateway_api_config.config.id
  gateway_id = var.api_gateway_id
  project    = var.project_id
  region     = var.region
}

# Default IAM Policy for Gateway (Allow Invoker)
resource "google_cloud_run_v2_service_iam_member" "gateway_invoker" {
  project  = google_cloud_run_v2_service.default.project
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api_gateway_sa.email}"
}

# IAM Bindings for IAP Access
# Grant access to individual users
resource "google_cloud_run_v2_service_iam_member" "iap_users" {
  for_each = toset(var.iap_allowed_users)

  project  = google_cloud_run_v2_service.default.project
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "user:${each.value}"
}

resource "google_project_iam_member" "gateway_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.api_gateway_sa.email}"
}

# Output the Gateway URL
output "gateway_url" {
  value = google_api_gateway_gateway.gateway.default_hostname
}

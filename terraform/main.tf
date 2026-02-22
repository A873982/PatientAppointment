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


# Data sources for VPC
data "google_compute_network" "vpc_network" {
  name = var.vpc_network_name
}

data "google_compute_subnetwork" "subnet" {
  name   = var.vpc_subnet_name
  region = var.region
}

# Artifact Registry Repository
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
  description   = "Docker repository for Patient Appointment app"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry_api]
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "default" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
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
        value = var.gemini_api_key
      }
    }

    vpc_access {
      egress = "ALL_TRAFFIC"
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
    google_artifact_registry_repository.repo
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

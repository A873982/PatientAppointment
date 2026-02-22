terraform {
  backend "gcs" {
    bucket = "polaris-terraform-state-c6ac9795"
    prefix = "patientAppointment"
  }
}

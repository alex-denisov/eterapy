provider "cloudru" {
  project_id  = var.project_id
  auth_key_id = var.auth_key_id
  auth_secret = var.auth_secret

  endpoints = {
    iam_endpoint     = "iam.api.cloud.ru:443"
    compute_endpoint = "compute.api.cloud.ru:443"
  }
}

data "cloudru_evolution_compute_image_collection" "public" {
  project_id = var.project_id
  page_size  = 100
}

locals {
  image_id = [
    for img in data.cloudru_evolution_compute_image_collection.public.images :
    img.id if img.name == var.image_name
  ][0]

  cloud_config = templatefile("${path.module}/cloud-init.yaml.tpl", {
    ssh_public_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
    ci_public_key  = trimspace(var.ci_deploy_public_key)
    vm_name        = var.vm_name
  })
}

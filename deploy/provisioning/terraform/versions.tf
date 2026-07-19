# B538 — Terraform-слой для cloud.ru Evolution (провайдер официальный,
# раздаётся с хоста cloud.ru, НЕ с registry.terraform.io).
#
# ⚠ Бинарь terraform с releases.hashicorp.com в RU-регионе не отдаётся
# («Content not available in your region») — используйте OpenTofu
# (`brew install opentofu`, команды идентичны: tofu init/plan/apply).
terraform {
  required_providers {
    cloudru = {
      source  = "cloud.ru/cloudru/cloud"
      version = "~> 2.1"
    }
  }

  # State по умолчанию локальный. Для командной работы — S3-backend в
  # приватном бакете cloud.ru (endpoint https://s3.cloud.ru, регион
  # ru-central-1, ключи в ~/.eterapy/infra-credentials.env):
  #
  # backend "s3" {
  #   bucket                      = "eterapy-data"
  #   key                         = "terraform/fleet.tfstate"
  #   region                      = "ru-central-1"
  #   endpoints                   = { s3 = "https://s3.cloud.ru" }
  #   skip_credentials_validation = true
  #   skip_region_validation      = true
  #   skip_requesting_account_id  = true
  #   use_path_style              = true
  # }
}

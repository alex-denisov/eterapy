# Аутентификация — персональный ключ сервисного аккаунта cloud.ru.
# Значения НЕ хранить в git: передавать через окружение
#   TF_VAR_project_id / TF_VAR_auth_key_id / TF_VAR_auth_secret
# (см. README — они читаются из ~/.eterapy/infra-credentials.env).
variable "project_id" {
  type        = string
  description = "Идентификатор проекта cloud.ru (CLOUDRU_ACC*_PROJECT)"
}

variable "auth_key_id" {
  type        = string
  description = "Идентификатор ключа доступа (CLOUDRU_ACC*_KEY_ID)"
  sensitive   = true
}

variable "auth_secret" {
  type        = string
  description = "Секрет ключа доступа (CLOUDRU_ACC*_KEY_SECRET)"
  sensitive   = true
}

variable "zone" {
  type        = string
  description = "Зона доступности (acc1 = ru.AZ-1, acc2 = ru.AZ-2 — смотреть по существующей подсети проекта)"
  default     = "ru.AZ-2"
}

# Новая ВМ подключается в СУЩЕСТВУЮЩУЮ подсеть проекта (флит-паттерн:
# у каждого аккаунта уже есть Default_ru.AZ-* подсеть). Свою подсеть/VPC
# слой сознательно не создаёт — сеть в проектах уже есть, а её пересоздание
# из state опаснее пользы.
variable "subnet_id" {
  type        = string
  description = "ID существующей подсети проекта (GET /api/v1/subnets)"
}

variable "vm_name" {
  type        = string
  description = "Имя ВМ; станет slug'ом в deploy/fleet-matrix.json"
  default     = "eterapy-tf-test"
}

variable "flavor" {
  type        = string
  description = "Flavor ВМ (gen-1-2 = 1 vCPU/2GB — минимум для app-ноды без сборки)"
  default     = "gen-1-2"
}

variable "disk_size" {
  type        = number
  description = "Размер загрузочного диска, ГБ"
  default     = 30
}

variable "disk_type" {
  type        = string
  default     = "SSD"
}

variable "image_name" {
  type        = string
  description = "Имя публичного образа ОС (регистр важен: `Ubuntu-24.04`, а `ubuntu-22.04` — строчными; смотреть GET /api/v1/images)"
  default     = "Ubuntu-24.04"
}

variable "ssh_public_key_path" {
  type        = string
  description = "Публичный ключ оператора (кладётся пользователю admin)"
  default     = "~/.ssh/eTerapy_web.pub"
}

variable "ci_deploy_public_key" {
  type        = string
  description = "Публичный CI-ключ деплоя (deploy/compose/ci_authorized_key.pub) — пустая строка = не добавлять"
  default     = ""
}

variable "open_livekit_ports" {
  type        = bool
  description = "Открыть RTC-порты LiveKit (7881/tcp + 50000/udp) — только для нод с профилем livekit"
  default     = false
}

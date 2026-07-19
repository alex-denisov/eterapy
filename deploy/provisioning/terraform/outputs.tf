output "vm_id" {
  description = "ID ВМ (нужен для set-power/delete через API)"
  value       = cloudru_evolution_compute_vm.node.id
}

output "internal_ip" {
  value = cloudru_evolution_compute_interface.eth0.ip_address
}

output "external_ip" {
  value = cloudru_evolution_compute_external_ip.public.ip_address
}

# Готовая запись для deploy/fleet-matrix.json — после apply вставить в
# инвентарь (роль/профили выставить осознанно) и запушить в main.
output "fleet_matrix_entry" {
  value = jsonencode({
    name         = "${var.vm_name} (${cloudru_evolution_compute_external_ip.public.ip_address})"
    slug         = var.vm_name
    host         = cloudru_evolution_compute_external_ip.public.ip_address
    user         = "admin"
    compose      = "docker-compose.yml"
    profile_args = ""
    standby      = false
  })
}

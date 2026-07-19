# «ВМ + порты» (DoD B538): группа безопасности с правилами флита, диск из
# публичного образа, ВМ с cloud-init (пользователь admin + ключи
# оператора/CI), интерфейс в существующей подсети, внешний IP.
# Порядок в схеме провайдера v2.1.x: ВМ создаётся раньше интерфейса
# (interface.vm — обязательное поле), внешний IP — отдельный ресурс.

resource "cloudru_evolution_compute_security_group" "fleet" {
  project_id = var.project_id
  name       = "${var.vm_name}-sg"

  zone = {
    name = var.zone
  }

  description = "eterapy fleet: 22/80/443 (+LiveKit RTC по флагу)"
}

locals {
  ingress_tcp = merge(
    {
      ssh   = "22:22"
      http  = "80:80"
      https = "443:443"
    },
    var.open_livekit_ports ? { livekit_rtc_tcp = "7881:7881" } : {},
  )
}

resource "cloudru_evolution_compute_security_group_rule" "ingress_tcp" {
  for_each = local.ingress_tcp

  security_group_id = cloudru_evolution_compute_security_group.fleet.id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = each.value
  description       = "eterapy ${each.key}"
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "cloudru_evolution_compute_security_group_rule" "ingress_livekit_udp" {
  count = var.open_livekit_ports ? 1 : 0

  security_group_id = cloudru_evolution_compute_security_group.fleet.id
  direction         = "TRAFFIC_DIRECTION_INGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_UDP"
  port_range        = "50000:50000"
  description       = "eterapy livekit rtc udp mux"
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "cloudru_evolution_compute_security_group_rule" "egress_tcp" {
  security_group_id = cloudru_evolution_compute_security_group.fleet.id
  direction         = "TRAFFIC_DIRECTION_EGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_TCP"
  port_range        = "1:65535"
  description       = "egress tcp"
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "cloudru_evolution_compute_security_group_rule" "egress_udp" {
  security_group_id = cloudru_evolution_compute_security_group.fleet.id
  direction         = "TRAFFIC_DIRECTION_EGRESS"
  ether_type        = "ETHER_TYPE_IPV4"
  ip_protocol       = "IP_PROTOCOL_UDP"
  port_range        = "1:65535"
  description       = "egress udp (WireGuard/DNS/NTP)"
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "cloudru_evolution_compute_disk" "boot" {
  project_id = var.project_id
  name       = "${var.vm_name}-boot"
  size       = var.disk_size

  zone = {
    name = var.zone
  }

  disk_type = {
    name = var.disk_type
  }

  image = {
    id = local.image_id
  }

  description = "Загрузочный диск ${var.vm_name}"
  bootable    = true
  encrypted   = false
  readonly    = false
  shared      = false
}

resource "cloudru_evolution_compute_vm" "node" {
  project_id = var.project_id
  name       = var.vm_name

  zone = {
    name = var.zone
  }

  flavor = {
    name = var.flavor
  }

  description = "eterapy fleet node (terraform, B538)"

  disks = [{
    id = cloudru_evolution_compute_disk.boot.id
  }]

  cloud_init_userdata = base64encode(local.cloud_config)
}

resource "cloudru_evolution_compute_interface" "eth0" {
  project_id = var.project_id
  name       = "${var.vm_name}-eth0"

  zone = {
    name = var.zone
  }

  description                = "Интерфейс ${var.vm_name}"
  interface_security_enabled = true

  subnet = {
    id = var.subnet_id
  }

  security_groups = [{
    id = cloudru_evolution_compute_security_group.fleet.id
  }]

  vm = {
    id = cloudru_evolution_compute_vm.node.id
  }
}

resource "cloudru_evolution_compute_external_ip" "public" {
  project_id = var.project_id
  name       = "${var.vm_name}-eip"

  zone = {
    name = var.zone
  }

  network_interface = {
    id = cloudru_evolution_compute_interface.eth0.id
  }
}

#cloud-config
users:
  - name: admin
    ssh-authorized-keys:
      - ${ssh_public_key}
%{ if ci_public_key != "" ~}
      - ${ci_public_key}
%{ endif ~}
    groups: sudo
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    lock_passwd: true
hostname: ${vm_name}
manage_etc_hosts: true

# B538 — Terraform-слой cloud.ru Evolution (ВМ + порты)

Создаёт fleet-ноду: security group c правилами (22/80/443, опционально
LiveKit RTC), загрузочный диск из публичного образа, ВМ с cloud-init
(пользователь `admin`, ключ оператора + CI-ключ деплоя), интерфейс в
СУЩЕСТВУЮЩЕЙ подсети проекта, внешний IP. После `apply` output
`fleet_matrix_entry` — готовая запись для `deploy/fleet-matrix.json`.

## Установка инструментов (однократно)

1. **OpenTofu, не terraform**: бинарь terraform не отдаётся в RU-регионе
   («Content not available in your region»). `brew install opentofu`;
   команды идентичны (`tofu init/plan/apply/destroy`).
2. **Провайдер ставится вручную** (cloud.ru не раздаёт registry-протокол):

   ```bash
   V=2.1.1; P=darwin_amd64   # или darwin_arm64 / linux_amd64
   mkdir -p ~/.terraform.d/plugins/cloud.ru/cloudru/cloud/$V/$P
   curl -L -o ~/.terraform.d/plugins/cloud.ru/cloudru/cloud/$V/$P/terraform-provider-cloud_v$V \
     https://github.com/cloud-ru/evo-terraform/releases/download/v$V/terraform-provider-cloud_${V}_${P}
   chmod +x ~/.terraform.d/plugins/cloud.ru/cloudru/cloud/$V/$P/terraform-provider-cloud_v$V
   ```

## Запуск

Креды и ID — из `~/.eterapy/infra-credentials.env` (не в git):

```bash
set -a; . ~/.eterapy/infra-credentials.env; set +a
export TF_VAR_project_id=$CLOUDRU_ACC2_PROJECT
export TF_VAR_auth_key_id=$CLOUDRU_ACC2_KEY_ID
export TF_VAR_auth_secret=$CLOUDRU_ACC2_KEY_SECRET
export TF_VAR_subnet_id=<id из GET /api/v1/subnets>   # существующая Default-подсеть
export TF_VAR_zone=ru.AZ-2                            # acc1 = ru.AZ-1, acc2 = ru.AZ-2
export TF_VAR_vm_name=eterapy-5
export TF_VAR_ssh_public_key_path=~/.ssh/eterapy_deploy.pub
export TF_VAR_ci_deploy_public_key="$(cat ../../compose/ci_authorized_key.pub)"

tofu init && tofu plan -out=tf.plan
tofu apply tf.plan        # создаёт ВМ + порты
tofu destroy              # чистит всё созданное
```

Дальше — обычный путь из `../README.md`: bootstrap (docker уже можно ставить
через него же), запись из output `fleet_matrix_entry` в
`deploy/fleet-matrix.json`, push в `main`.

## Грабли (проверено 2026-07-19)

- Схема провайдера **v2.1.x** отличается от официального гайда
  `vm_create_full.md` (тот под 2.0.0): `zone = {name=…}` вместо
  `zone_identifier`, у диска `disk_type`/`image`, интерфейс создаётся
  ПОСЛЕ ВМ (`vm = {id}` обязателен), внешний IP — отдельный ресурс
  `cloudru_evolution_compute_external_ip`. При обновлении провайдера сверять
  `tofu providers schema -json`.
- Имена образов регистрозависимы и неконсистентны: `Ubuntu-24.04`, но
  `ubuntu-22.04` (см. `GET /api/v1/images`).
- `POST /api/v1/vms/{id}/set-power` принимает поле **`state`**
  (`power_on|power_off|reboot`), не `power` — спека и валидатор расходятся
  с интуицией.
- State локальный; для командной работы — S3-backend cloud.ru
  (закомментирован в `versions.tf`).

## Статус проверки

`tofu init` / `validate` / `plan` прогнаны против acc2 живьём
(data sources читают реальные образы; план = 10 ресурсов). Полный
apply→destroy цикл из агент-сессии заблокирован политикой разрешений —
запускается оператором командами выше.

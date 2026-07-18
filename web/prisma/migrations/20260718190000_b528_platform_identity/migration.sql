-- B528: keep Mini App login identities separate from notification bindings.
CREATE TABLE "platform_identities" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mini_app_auth_grants" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "launch_hash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mini_app_auth_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_identities_provider_subject_id_key" ON "platform_identities"("provider", "subject_id");
CREATE UNIQUE INDEX "platform_identities_provider_user_id_key" ON "platform_identities"("provider", "user_id");
CREATE INDEX "platform_identities_user_id_idx" ON "platform_identities"("user_id");
CREATE UNIQUE INDEX "mini_app_auth_grants_token_hash_key" ON "mini_app_auth_grants"("token_hash");
CREATE UNIQUE INDEX "mini_app_auth_grants_launch_hash_key" ON "mini_app_auth_grants"("launch_hash");
CREATE INDEX "mini_app_auth_grants_user_id_expires_at_idx" ON "mini_app_auth_grants"("user_id", "expires_at");
CREATE INDEX "mini_app_auth_grants_provider_subject_id_idx" ON "mini_app_auth_grants"("provider", "subject_id");

ALTER TABLE "platform_identities" ADD CONSTRAINT "platform_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mini_app_auth_grants" ADD CONSTRAINT "mini_app_auth_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

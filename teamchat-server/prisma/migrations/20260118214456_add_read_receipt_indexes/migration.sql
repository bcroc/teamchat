-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_server_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspend_reason" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspended_by" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "description" TEXT,
ADD COLUMN     "disabled_at" TIMESTAMP(3),
ADD COLUMN     "disabled_by" TEXT,
ADD COLUMN     "icon_url" TEXT,
ADD COLUMN     "is_disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_members" INTEGER;

-- CreateTable
CREATE TABLE "server_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "server_name" TEXT NOT NULL DEFAULT 'TeamChat',
    "server_description" TEXT,
    "allow_public_registration" BOOLEAN NOT NULL DEFAULT true,
    "require_email_verification" BOOLEAN NOT NULL DEFAULT false,
    "max_workspaces_per_user" INTEGER NOT NULL DEFAULT 10,
    "max_members_per_workspace" INTEGER NOT NULL DEFAULT 100,
    "max_file_upload_size" INTEGER NOT NULL DEFAULT 10485760,
    "allowed_file_types" TEXT[],
    "enable_e2ee" BOOLEAN NOT NULL DEFAULT true,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "system_announcements_is_active_starts_at_ends_at_idx" ON "system_announcements"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "read_receipts_user_id_channel_id_idx" ON "read_receipts"("user_id", "channel_id");

-- CreateIndex
CREATE INDEX "read_receipts_user_id_dm_thread_id_idx" ON "read_receipts"("user_id", "dm_thread_id");

-- RenameIndex
ALTER INDEX "conversation_key_shares_conversation_id_recipient_key_id_key_ve" RENAME TO "conversation_key_shares_conversation_id_recipient_key_id_ke_key";

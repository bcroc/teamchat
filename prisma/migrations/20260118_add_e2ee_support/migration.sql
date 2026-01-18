-- Add E2EE fields to messages table
ALTER TABLE "messages" ADD COLUMN "is_encrypted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "encryption_version" INTEGER;
ALTER TABLE "messages" ADD COLUMN "nonce" TEXT;

-- Create user encryption keys table
CREATE TABLE "user_encryption_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "key_signature" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'X25519',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_encryption_keys_pkey" PRIMARY KEY ("id")
);

-- Create conversation key shares table
CREATE TABLE "conversation_key_shares" (
    "id" TEXT NOT NULL,
    "conversation_type" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_key_id" TEXT NOT NULL,
    "recipient_key_id" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_key_shares_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX "user_encryption_keys_user_id_device_id_key" ON "user_encryption_keys"("user_id", "device_id");

CREATE UNIQUE INDEX "conversation_key_shares_conversation_id_recipient_key_id_key_version_key" ON "conversation_key_shares"("conversation_id", "recipient_key_id", "key_version");

-- Create indexes for performance
CREATE INDEX "user_encryption_keys_user_id_is_active_idx" ON "user_encryption_keys"("user_id", "is_active");

CREATE INDEX "conversation_key_shares_conversation_id_key_version_idx" ON "conversation_key_shares"("conversation_id", "key_version");

-- Add foreign key constraints
ALTER TABLE "user_encryption_keys" ADD CONSTRAINT "user_encryption_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_key_shares" ADD CONSTRAINT "conversation_key_shares_sender_key_id_fkey" FOREIGN KEY ("sender_key_id") REFERENCES "user_encryption_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_key_shares" ADD CONSTRAINT "conversation_key_shares_recipient_key_id_fkey" FOREIGN KEY ("recipient_key_id") REFERENCES "user_encryption_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

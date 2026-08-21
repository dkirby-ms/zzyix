CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"principal_id" uuid,
	"sequence" integer NOT NULL,
	"client_message_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_conversation_sequence_unique" UNIQUE("conversation_id","sequence"),
	CONSTRAINT "chat_messages_conversation_principal_client_message_unique" UNIQUE("conversation_id","principal_id","client_message_id"),
	CONSTRAINT "chat_messages_body_length_check" CHECK (char_length("chat_messages"."body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_product_key_check" CHECK ("conversations"."product_key" = 'shared')
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_sequence_idx" ON "chat_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_at_idx" ON "chat_messages" USING btree ("conversation_id","created_at");
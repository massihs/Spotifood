CREATE TABLE "cheque_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"cheque_id" uuid NOT NULL,
	"status" varchar(10) NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"direction" varchar(8) NOT NULL,
	"sayad_id" varchar(16),
	"number" varchar(32),
	"bank" varchar(80),
	"party" varchar(160) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(10) NOT NULL,
	"customer_id" uuid,
	"supplier_id" uuid,
	"note" varchar(300),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cheques_amount_chk" CHECK ("cheques"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"memo" varchar(240) NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_id" uuid,
	"reversal_of_id" uuid,
	"posted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_cents" bigint DEFAULT 0 NOT NULL,
	"credit_cents" bigint DEFAULT 0 NOT NULL,
	"department" varchar(16),
	"description" varchar(200),
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_side_chk" CHECK ("journal_lines"."debit_cents" >= 0 and "journal_lines"."credit_cents" >= 0 and ("journal_lines"."debit_cents" = 0) <> ("journal_lines"."credit_cents" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(10) NOT NULL,
	"system_key" varchar(32),
	"reconcilable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_type_chk" CHECK ("ledger_accounts"."type" in ('asset','liability','equity','revenue','expense'))
);
--> statement-breakpoint
CREATE TABLE "ledger_budgets" (
	"restaurant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_budgets_account_id_month_pk" PRIMARY KEY("account_id","month")
);
--> statement-breakpoint
CREATE TABLE "ledger_settings" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"locked_until" date,
	"next_entry_number" integer DEFAULT 1 NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" varchar(10) NOT NULL,
	"cheque_id" uuid,
	"paid_on" date NOT NULL,
	"reference" varchar(64),
	"note" varchar(300),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_chk" CHECK ("supplier_payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "trade_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "trade_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_b_2b" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_business" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tax_id" varchar(24);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "trade_discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_settings" ADD CONSTRAINT "ledger_settings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheque_events_cheque_idx" ON "cheque_events" USING btree ("cheque_id");--> statement-breakpoint
CREATE INDEX "cheques_due_idx" ON "cheques" USING btree ("restaurant_id","direction","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cheques_sayad_uq" ON "cheques" USING btree ("restaurant_id","direction","sayad_id") WHERE "cheques"."sayad_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_uq" ON "journal_entries" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_uq" ON "journal_entries" USING btree ("restaurant_id","source_type","source_id") WHERE "journal_entries"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("restaurant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uq" ON "ledger_accounts" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_system_uq" ON "ledger_accounts" USING btree ("restaurant_id","system_key") WHERE "ledger_accounts"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "supplier_payments_idx" ON "supplier_payments" USING btree ("restaurant_id","supplier_id","paid_on");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_trade_discount_chk" CHECK ("customers"."trade_discount_bps" between 0 and 9000);
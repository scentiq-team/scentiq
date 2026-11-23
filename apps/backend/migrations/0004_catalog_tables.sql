CREATE TABLE "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mode" text DEFAULT 'pinned' NOT NULL,
	"position" smallint,
	CONSTRAINT "collection_products_pk" PRIMARY KEY("collection_id","product_id"),
	CONSTRAINT "collection_products_mode_valid" CHECK ("collection_products"."mode" in ('pinned', 'excluded')),
	CONSTRAINT "collection_products_position_matches_mode" CHECK (("collection_products"."mode" = 'pinned') = ("collection_products"."position" is not null) and ("collection_products"."position" is null or "collection_products"."position" >= 0))
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description_ar" text,
	"description_en" text,
	"rules" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"home_position" smallint,
	"cover_media_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_format" CHECK ("collections"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("collections"."slug") <= 120),
	CONSTRAINT "collections_name_ar_valid" CHECK (length(btrim("collections"."name_ar")) between 1 and 200),
	CONSTRAINT "collections_name_en_valid" CHECK ("collections"."name_en" is null or length(btrim("collections"."name_en")) between 1 and 200),
	CONSTRAINT "collections_description_ar_valid" CHECK ("collections"."description_ar" is null or length(btrim("collections"."description_ar")) between 1 and 10000),
	CONSTRAINT "collections_description_en_valid" CHECK ("collections"."description_en" is null or length(btrim("collections"."description_en")) between 1 and 10000),
	CONSTRAINT "collections_kind_valid" CHECK ("collections"."kind" in ('manual', 'dynamic', 'hybrid')),
	CONSTRAINT "collections_status_valid" CHECK ("collections"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "collections_rules_match_kind" CHECK (("collections"."kind" = 'manual') = ("collections"."rules" is null)),
	CONSTRAINT "collections_rules_object" CHECK ("collections"."rules" is null or (jsonb_typeof("collections"."rules") = 'object' and octet_length("collections"."rules"::text) <= 8192)),
	CONSTRAINT "collections_schedule_ordered" CHECK ("collections"."starts_at" is null or "collections"."ends_at" is null or "collections"."ends_at" > "collections"."starts_at"),
	CONSTRAINT "collections_home_position_range" CHECK ("collections"."home_position" is null or "collections"."home_position" between 1 and 12),
	CONSTRAINT "collections_archived_at_matches_status" CHECK (("collections"."status" = 'archived') = ("collections"."archived_at" is not null)),
	CONSTRAINT "collections_published_has_timestamp" CHECK ("collections"."status" <> 'published' or "collections"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"storage_key" text NOT NULL,
	"original_label" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"dominant_color" text,
	"alt_ar" text,
	"alt_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_format" CHECK ("media_assets"."storage_key" ~ '^[a-z0-9][a-z0-9/_-]{7,119}$'),
	CONSTRAINT "media_assets_dimensions_valid" CHECK ("media_assets"."width" between 1 and 10000 and "media_assets"."height" between 1 and 10000 and "media_assets"."byte_size" > 0),
	CONSTRAINT "media_assets_dominant_color_format" CHECK ("media_assets"."dominant_color" is null or "media_assets"."dominant_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "media_assets_original_label_valid" CHECK ("media_assets"."original_label" is null or length(btrim("media_assets"."original_label")) between 1 and 200),
	CONSTRAINT "media_assets_alt_ar_valid" CHECK ("media_assets"."alt_ar" is null or length(btrim("media_assets"."alt_ar")) between 1 and 300),
	CONSTRAINT "media_assets_alt_en_valid" CHECK ("media_assets"."alt_en" is null or length(btrim("media_assets"."alt_en")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"media_id" uuid NOT NULL,
	"width" integer NOT NULL,
	"storage_key" text NOT NULL,
	"byte_size" integer NOT NULL,
	CONSTRAINT "media_variants_pk" PRIMARY KEY("media_id","width"),
	CONSTRAINT "media_variants_width_allowed" CHECK ("media_variants"."width" in ('480', '960', '1600')),
	CONSTRAINT "media_variants_byte_size_positive" CHECK ("media_variants"."byte_size" > 0),
	CONSTRAINT "media_variants_storage_key_format" CHECK ("media_variants"."storage_key" ~ '^[a-z0-9][a-z0-9/_-]{7,119}$')
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "product_images_pk" PRIMARY KEY("product_id","media_id"),
	CONSTRAINT "product_images_position_range" CHECK ("product_images"."position" between 0 and 19)
);
--> statement-breakpoint
CREATE TABLE "product_notes" (
	"product_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"position" text NOT NULL,
	"prominence" smallint DEFAULT 2 NOT NULL,
	CONSTRAINT "product_notes_pk" PRIMARY KEY("product_id","note_id"),
	CONSTRAINT "product_notes_position_valid" CHECK ("product_notes"."position" in ('top', 'heart', 'base')),
	CONSTRAINT "product_notes_prominence_range" CHECK ("product_notes"."prominence" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "product_tags_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"size_value" integer NOT NULL,
	"size_unit" text DEFAULT 'ml' NOT NULL,
	"price_iqd" integer NOT NULL,
	"compare_at_iqd" integer,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_format" CHECK ("product_variants"."sku" ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'),
	CONSTRAINT "product_variants_size_value_range" CHECK ("product_variants"."size_value" between 1 and 10000),
	CONSTRAINT "product_variants_size_unit_valid" CHECK ("product_variants"."size_unit" in ('ml', 'g', 'pcs')),
	CONSTRAINT "product_variants_price_range" CHECK ("product_variants"."price_iqd" between 1 and 100000000),
	CONSTRAINT "product_variants_compare_at_above_price" CHECK ("product_variants"."compare_at_iqd" is null or ("product_variants"."compare_at_iqd" > "product_variants"."price_iqd" and "product_variants"."compare_at_iqd" <= 100000000))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"category_id" uuid,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description_ar" text,
	"description_en" text,
	"concentration" text,
	"gender" text DEFAULT 'unisex' NOT NULL,
	"intensity" smallint,
	"primary_family_id" uuid,
	"secondary_family_id" uuid,
	"seo_title_ar" text,
	"seo_title_en" text,
	"seo_description_ar" text,
	"seo_description_en" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"search_document" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("products"."slug") <= 120),
	CONSTRAINT "products_name_ar_valid" CHECK (length(btrim("products"."name_ar")) between 1 and 200),
	CONSTRAINT "products_name_en_valid" CHECK ("products"."name_en" is null or length(btrim("products"."name_en")) between 1 and 200),
	CONSTRAINT "products_description_ar_valid" CHECK ("products"."description_ar" is null or length(btrim("products"."description_ar")) between 1 and 10000),
	CONSTRAINT "products_description_en_valid" CHECK ("products"."description_en" is null or length(btrim("products"."description_en")) between 1 and 10000),
	CONSTRAINT "products_seo_title_ar_valid" CHECK ("products"."seo_title_ar" is null or length(btrim("products"."seo_title_ar")) between 1 and 120),
	CONSTRAINT "products_seo_title_en_valid" CHECK ("products"."seo_title_en" is null or length(btrim("products"."seo_title_en")) between 1 and 120),
	CONSTRAINT "products_seo_description_ar_valid" CHECK ("products"."seo_description_ar" is null or length(btrim("products"."seo_description_ar")) between 1 and 400),
	CONSTRAINT "products_seo_description_en_valid" CHECK ("products"."seo_description_en" is null or length(btrim("products"."seo_description_en")) between 1 and 400),
	CONSTRAINT "products_concentration_valid" CHECK ("products"."concentration" is null or "products"."concentration" in ('parfum', 'edp', 'edt', 'edc', 'oil')),
	CONSTRAINT "products_gender_valid" CHECK ("products"."gender" in ('women', 'men', 'unisex')),
	CONSTRAINT "products_intensity_range" CHECK ("products"."intensity" is null or "products"."intensity" between 1 and 5),
	CONSTRAINT "products_status_valid" CHECK ("products"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "products_families_distinct" CHECK ("products"."secondary_family_id" is null or ("products"."primary_family_id" is not null and "products"."secondary_family_id" <> "products"."primary_family_id")),
	CONSTRAINT "products_archived_at_matches_status" CHECK (("products"."status" = 'archived') = ("products"."archived_at" is not null)),
	CONSTRAINT "products_published_has_timestamp" CHECK ("products"."status" <> 'published' or "products"."published_at" is not null),
	CONSTRAINT "products_published_required_fields" CHECK ("products"."status" <> 'published' or (
        "products"."description_ar" is not null
        and "products"."category_id" is not null
        and "products"."primary_family_id" is not null
        and "products"."seo_title_ar" is not null
        and "products"."seo_description_ar" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_redirects_entity_type_valid" CHECK ("slug_redirects"."entity_type" in ('product', 'brand', 'category', 'collection', 'note')),
	CONSTRAINT "slug_redirects_old_slug_format" CHECK ("slug_redirects"."old_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("slug_redirects"."old_slug") <= 120)
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"story_ar" text,
	"story_en" text,
	"country_code" text,
	"logo_media_id" uuid,
	"template_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_format" CHECK ("brands"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("brands"."slug") <= 120),
	CONSTRAINT "brands_name_ar_valid" CHECK (length(btrim("brands"."name_ar")) between 1 and 200),
	CONSTRAINT "brands_name_en_valid" CHECK (length(btrim("brands"."name_en")) between 1 and 200),
	CONSTRAINT "brands_story_ar_valid" CHECK ("brands"."story_ar" is null or length(btrim("brands"."story_ar")) between 1 and 5000),
	CONSTRAINT "brands_story_en_valid" CHECK ("brands"."story_en" is null or length(btrim("brands"."story_en")) between 1 and 5000),
	CONSTRAINT "brands_country_code_format" CHECK ("brands"."country_code" is null or "brands"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "brands_template_key_format" CHECK ("brands"."template_key" is null or "brands"."template_key" ~ '^[a-z][a-z0-9_]{0,39}$')
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("categories"."slug") <= 120),
	CONSTRAINT "categories_name_ar_valid" CHECK (length(btrim("categories"."name_ar")) between 1 and 200),
	CONSTRAINT "categories_name_en_valid" CHECK (length(btrim("categories"."name_en")) between 1 and 200),
	CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "families_slug_format" CHECK ("families"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("families"."slug") <= 120),
	CONSTRAINT "families_name_ar_valid" CHECK (length(btrim("families"."name_ar")) between 1 and 200),
	CONSTRAINT "families_name_en_valid" CHECK (length(btrim("families"."name_en")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "family_adjacency" (
	"family_id" uuid NOT NULL,
	"adjacent_family_id" uuid NOT NULL,
	"weight_percent" smallint NOT NULL,
	CONSTRAINT "family_adjacency_pk" PRIMARY KEY("family_id","adjacent_family_id"),
	CONSTRAINT "family_adjacency_ordered_pair" CHECK ("family_adjacency"."family_id" < "family_adjacency"."adjacent_family_id"),
	CONSTRAINT "family_adjacency_weight_range" CHECK ("family_adjacency"."weight_percent" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "note_aliases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "note_aliases_alias_valid" CHECK (length(btrim("note_aliases"."alias")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "note_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_groups_slug_format" CHECK ("note_groups"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("note_groups"."slug") <= 120),
	CONSTRAINT "note_groups_name_ar_valid" CHECK (length(btrim("note_groups"."name_ar")) between 1 and 200),
	CONSTRAINT "note_groups_name_en_valid" CHECK (length(btrim("note_groups"."name_en")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_slug_format" CHECK ("notes"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("notes"."slug") <= 120),
	CONSTRAINT "notes_name_ar_valid" CHECK (length(btrim("notes"."name_ar")) between 1 and 200),
	CONSTRAINT "notes_name_en_valid" CHECK (length(btrim("notes"."name_en")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_type_valid" CHECK ("tags"."type" in ('occasion', 'season', 'mood', 'feature')),
	CONSTRAINT "tags_slug_format" CHECK ("tags"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("tags"."slug") <= 120),
	CONSTRAINT "tags_name_ar_valid" CHECK (length(btrim("tags"."name_ar")) between 1 and 200),
	CONSTRAINT "tags_name_en_valid" CHECK (length(btrim("tags"."name_en")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_primary_family_id_families_id_fk" FOREIGN KEY ("primary_family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_secondary_family_id_families_id_fk" FOREIGN KEY ("secondary_family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_adjacency" ADD CONSTRAINT "family_adjacency_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_adjacency" ADD CONSTRAINT "family_adjacency_adjacent_family_id_families_id_fk" FOREIGN KEY ("adjacent_family_id") REFERENCES "public"."families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_aliases" ADD CONSTRAINT "note_aliases_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_group_id_note_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."note_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_products_product_idx" ON "collection_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_uq" ON "collections" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_home_position_uq" ON "collections" USING btree ("home_position") WHERE "collections"."home_position" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_uq" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_variants_storage_key_uq" ON "media_variants" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "product_images_media_idx" ON "product_images" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "product_notes_note_idx" ON "product_notes" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "product_tags_tag_idx" ON "product_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_uq" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_live_size_uq" ON "product_variants" USING btree ("product_id","size_value","size_unit") WHERE "product_variants"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uq" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_primary_family_idx" ON "products" USING btree ("primary_family_id");--> statement-breakpoint
CREATE INDEX "products_published_at_idx" ON "products" USING btree ("published_at" DESC NULLS LAST) WHERE "products"."status" = 'published';--> statement-breakpoint
CREATE INDEX "products_search_document_trgm_idx" ON "products" USING gin ("search_document" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_old_slug_uq" ON "slug_redirects" USING btree ("entity_type","old_slug");--> statement-breakpoint
CREATE INDEX "slug_redirects_entity_idx" ON "slug_redirects" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uq" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_en_uq" ON "brands" USING btree (lower("name_en"));--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "families_slug_uq" ON "families" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "family_adjacency_adjacent_idx" ON "family_adjacency" USING btree ("adjacent_family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_aliases_note_alias_uq" ON "note_aliases" USING btree ("note_id",lower("alias"));--> statement-breakpoint
CREATE UNIQUE INDEX "note_groups_slug_uq" ON "note_groups" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_slug_uq" ON "notes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_name_en_uq" ON "notes" USING btree (lower("name_en"));--> statement-breakpoint
CREATE INDEX "notes_group_idx" ON "notes" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_type_slug_uq" ON "tags" USING btree ("type","slug");
-- Catalog rules that a plain CHECK cannot express (STEP 3, ADR-0012).
--   1. updated_at is kept current by the database, so no caller can forget it.
--   2. Categories are a tree at most two levels deep.
--   3. A product cannot become published without notes, a live variant and an image with Arabic
--      alt text. The part of the gate that lives on the products row is a CHECK in 0004.
-- Violations raise SQLSTATE 23514 (check_violation) and name the rule in the CONSTRAINT field, so
-- tests and the application recognise them like any other CHECK.

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Categories: a parent has no parent, and a category that has children cannot get a parent.
-- Two administrators changing the tree at the same instant would each pass the checks below (the
-- other change is not committed yet) and could build a third level together, so every change that
-- gives a category a parent first takes one lock for the whole tree, held until the transaction
-- ends. The tree is tiny and edited by staff only, so queuing these changes costs nothing.
CREATE FUNCTION categories_enforce_depth() RETURNS trigger AS $$
DECLARE
  parent_has_parent boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog.category_tree', 0));
  SELECT (parent_id IS NOT NULL) INTO parent_has_parent FROM categories WHERE id = NEW.parent_id;
  IF parent_has_parent THEN
    RAISE EXCEPTION 'category "%" cannot be placed under a sub-category: the tree is at most 2 levels deep', NEW.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_max_depth';
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id) THEN
    RAISE EXCEPTION 'category "%" has sub-categories, so it cannot become a sub-category', NEW.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_max_depth';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER categories_max_depth BEFORE INSERT OR UPDATE OF parent_id ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_enforce_depth();
--> statement-breakpoint

-- Publish gate. Only the moment a product BECOMES published is checked: the service keeps a
-- published product valid when notes, variants or images are removed (it re-checks before saving).
-- A new product always starts as a draft because it cannot have children yet.
CREATE FUNCTION products_enforce_publish_gate() RETURNS trigger AS $$
DECLARE
  note_count integer;
  live_variants integer;
  images_with_alt integer;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'product "%" must be created as a draft: it has no notes, variants or images yet', NEW.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'products_publish_requires_children';
  END IF;
  IF OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO note_count FROM product_notes WHERE product_id = NEW.id;
  SELECT count(*) INTO live_variants
    FROM product_variants WHERE product_id = NEW.id AND archived_at IS NULL;
  SELECT count(*) INTO images_with_alt
    FROM product_images pi JOIN media_assets m ON m.id = pi.media_id
    WHERE pi.product_id = NEW.id AND m.alt_ar IS NOT NULL;

  IF note_count < 3 OR live_variants < 1 OR images_with_alt < 1 THEN
    RAISE EXCEPTION 'product "%" cannot be published: it needs at least 3 notes (has %), 1 live variant (has %) and 1 image with Arabic alt text (has %)',
      NEW.slug, note_count, live_variants, images_with_alt
      USING ERRCODE = 'check_violation', CONSTRAINT = 'products_publish_requires_children';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER products_publish_gate BEFORE INSERT OR UPDATE OF status ON products
  FOR EACH ROW EXECUTE FUNCTION products_enforce_publish_gate();

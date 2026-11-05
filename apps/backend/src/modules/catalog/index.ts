// The catalog module's public surface (ADR-0012). There are no HTTP routes in STEP 3: Studio (7A/7B)
// and the public API (Phase 4) will call these services. Routes -> service -> repository: nothing
// above this folder touches the catalog tables directly.
export { assertProductsStayValid, getProductCompletion } from './completion.js';
export { CatalogError, type CatalogErrorKind, isCatalogError, translateDbError } from './errors.js';
export {
  addVariant,
  archiveProduct,
  archiveVariant,
  createProduct,
  getProductDetail,
  publishProduct,
  restoreProduct,
  setMediaAlt,
  setProductImages,
  setProductNotes,
  setProductTags,
  unpublishProduct,
  updateProduct,
  updateVariant,
} from './products.js';
export { productIdsDependingOn, refreshProductSearchDocuments } from './search-index.js';
export { claimSlug, findRedirectTarget, retireSlug } from './slugs.js';
export {
  createBrand,
  createCategory,
  createNote,
  createTag,
  renameTag,
  updateBrand,
  updateCategory,
  updateNote,
} from './taxonomy.js';
export { inTransaction } from './transaction.js';

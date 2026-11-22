export type CatalogSelection = {
  family: string;
  use: string;
  face: string;
};

export type CatalogOption = {
  value: string;
  label: string;
};

export type CatalogFacet = CatalogSelection & {
  useLabel: string;
  faceLabel?: string;
};

export const allCatalogOptions: CatalogSelection = { family: '', use: '', face: '' };

export function catalogHref(selection: Partial<CatalogSelection> = {}) {
  const search = new URLSearchParams();
  for (const key of ['family', 'use', 'face'] as const) {
    const value = selection[key];
    if (value && value !== 'all') search.set(key, value);
  }
  return search.size ? `/products?${search}` : '/products';
}

export function matchesCatalog(selection: CatalogSelection, facet: CatalogFacet) {
  return (!selection.family || facet.family === selection.family)
    && (!selection.use || facet.use === selection.use)
    && (!selection.face || facet.face === selection.face);
}

export function catalogUses(facets: CatalogFacet[], family: string): CatalogOption[] {
  const labels = new Map<string, string>();
  for (const facet of facets) {
    if ((!family || facet.family === family) && facet.use) labels.set(facet.use, facet.useLabel);
  }
  return Array.from(labels, ([value, label]) => ({ value, label }));
}

export function catalogFaces(facets: CatalogFacet[], family: string, use: string): CatalogOption[] {
  const labels = new Map<string, string>();
  for (const facet of facets) {
    if ((!family || facet.family === family) && (!use || facet.use === use) && facet.face && facet.faceLabel) {
      labels.set(facet.face, facet.faceLabel);
    }
  }
  return Array.from(labels, ([value, label]) => ({ value, label }));
}

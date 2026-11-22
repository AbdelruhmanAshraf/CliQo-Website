'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LuSlidersHorizontal, LuX } from 'react-icons/lu';
import {
  allCatalogOptions,
  catalogFaces,
  catalogHref,
  catalogUses,
  matchesCatalog,
  type CatalogFacet,
  type CatalogOption,
  type CatalogSelection,
} from './catalog-options';

type Props = {
  selection: CatalogSelection;
  families: CatalogOption[];
  facets: CatalogFacet[];
  arabic: boolean;
};

export function CatalogFilters({ selection, families, facets, arabic }: Props) {
  const t = (ar: string, en: string) => arabic ? ar : en;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(selection);
  const uses = catalogUses(facets, draft.family);
  const faces = catalogFaces(facets, draft.family, draft.use);
  const count = facets.filter(facet => matchesCatalog(draft, facet)).length;

  function open() {
    setDraft(selection);
    dialog.current?.showModal();
  }

  function changeFamily(family: string) {
    const use = catalogUses(facets, family).some(option => option.value === draft.use) ? draft.use : '';
    const face = catalogFaces(facets, family, use).some(option => option.value === draft.face) ? draft.face : '';
    setDraft({ family, use, face });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dialog.current?.close();
    router.push(catalogHref(draft), { scroll: false });
  }

  return (
    <>
      <button ref={trigger} className="shop-filter-trigger" type="button" onClick={open} aria-haspopup="dialog">
        <LuSlidersHorizontal aria-hidden="true" />
        {t('فلترة', 'Filters')}
      </button>
      <dialog
        ref={dialog}
        className="shop-filter-dialog"
        aria-labelledby="shop-filter-title"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        onClick={event => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <form onSubmit={apply} className="shop-filter-form">
          <header>
            <h2 id="shop-filter-title">{t('فلترة التصميمات', 'Filter designs')}</h2>
            <button type="button" aria-label={t('اقفل الفلاتر', 'Close filters')} onClick={() => dialog.current?.close()}>
              <LuX aria-hidden="true" />
            </button>
          </header>
          <label>
            {t('نوع القطعة', 'Product type')}
            <select value={draft.family} onChange={event => changeFamily(event.target.value)}>
              <option value="">{t('كل القطع', 'All products')}</option>
              {families.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            {t('الاستخدام', 'Use')}
            <select value={draft.use} onChange={event => setDraft({ ...draft, use: event.target.value, face: '' })}>
              <option value="">{t('كل الاستخدامات', 'All uses')}</option>
              {uses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {(Boolean(draft.face) || (draft.use && faces.length > 1)) && (
            <label>
              {t('المنصة أو التصميم', 'Platform or design')}
              <select value={draft.face} onChange={event => setDraft({ ...draft, face: event.target.value })}>
                <option value="">{t('كل التصميمات', 'All designs')}</option>
                {faces.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          <footer>
            <button type="button" className="shop-filter-reset" onClick={() => setDraft(allCatalogOptions)}>
              {t('مسح الفلاتر', 'Clear filters')}
            </button>
            <button type="submit" className="shop-filter-apply">
              {t('عرض النتائج', 'Show results')} <span dir="ltr">({count})</span>
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

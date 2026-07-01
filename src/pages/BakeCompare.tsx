import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import { format } from 'date-fns';
import { useTranslation } from '../lib/i18n/useTranslation';
import type { TranslationKey } from '../lib/i18n';
import type { Bake } from '../types';

interface BakeComparePageProps {
  bakeIds: string[];
}

const FOLD_LABEL_KEYS: Record<string, TranslationKey> = {
  stretch_fold: 'bakeCompare.foldStretchFold',
  coil_fold: 'bakeCompare.foldCoilFold',
  lamination: 'bakeCompare.foldLamination',
  slap_fold: 'bakeCompare.foldSlapFold',
};
const PROOF_LABEL_KEYS: Record<string, TranslationKey> = {
  room_temp: 'bakeCompare.proofRoomTemp',
  cold_retard: 'bakeCompare.proofColdRetard',
  proofbox: 'bakeCompare.proofProofBox',
};

/** One comparable metric: a label and how to read it off a bake as a string. */
interface Metric {
  label: string;
  get: (b: Bake) => string;
}

export function BakeComparePage({ bakeIds }: BakeComparePageProps) {
  const { goBackFromPage } = useAppStore();
  const { t } = useTranslation();
  const [bakes, setBakes] = useState<Bake[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Built inside the component so metric getters can resolve labels via `t`.
  const sections: Array<{ title: string; metrics: Metric[] }> = [
    {
      title: t('bakeCompare.sectionIngredients'),
      metrics: [
        { label: t('bakeCompare.metricFlour'), get: (b) => `${b.ingredients.totalFlour} g` },
        { label: t('bakeCompare.metricHydration'), get: (b) => `${b.ingredients.hydration}%` },
        { label: t('bakeCompare.metricStarter'), get: (b) => `${b.ingredients.starterPercent}%` },
        { label: t('bakeCompare.metricSalt'), get: (b) => `${b.ingredients.saltPercent}%` },
      ],
    },
    {
      title: t('bakeCompare.sectionProcess'),
      metrics: [
        {
          label: t('bakeCompare.metricBulk'),
          get: (b) =>
            b.processKnown === false ? '—' : `${b.process.bulkTime}h @ ${b.process.bulkTemp}°C`,
        },
        {
          label: t('bakeCompare.metricFolds'),
          get: (b) =>
            b.processKnown === false
              ? '—'
              : `${b.process.folds} × ${t(FOLD_LABEL_KEYS[b.process.foldMethod])}`,
        },
        {
          label: t('bakeCompare.metricProof'),
          get: (b) =>
            b.processKnown === false
              ? '—'
              : `${t(PROOF_LABEL_KEYS[b.process.proofMethod])} · ${b.process.proofTime}h`,
        },
      ],
    },
    {
      title: t('bakeCompare.sectionBaking'),
      metrics: [
        {
          label: t('bakeCompare.metricOven'),
          get: (b) => (b.bakingKnown === false ? '—' : `${b.baking.ovenTemp}°C`),
        },
      ],
    },
    {
      title: t('bakeCompare.sectionResults'),
      metrics: [
        { label: t('bakeCompare.metricOverall'), get: (b) => `${b.results.overall}/5` },
        { label: t('bakeCompare.metricOvenSpring'), get: (b) => `${b.results.ovenSpring}/5` },
        { label: t('bakeCompare.metricCrumb'), get: (b) => `${b.results.crumbStructure}/5` },
        { label: t('bakeCompare.metricCrust'), get: (b) => `${b.results.crust}/5` },
        { label: t('bakeCompare.metricFlavor'), get: (b) => `${b.results.flavor}/5` },
        { label: t('bakeCompare.metricSourness'), get: (b) => `${b.results.sourness}/5` },
      ],
    },
  ];

  useEffect(() => {
    const load = async () => {
      const all = await db.bakes.toArray();
      // Preserve the selection order the user picked.
      const byId = new Map(all.map((b) => [b.uuid, b]));
      const ordered = bakeIds.map((id) => byId.get(id)).filter((b): b is Bake => !!b);
      setBakes(ordered);
      setIsLoading(false);
    };
    load();
  }, [bakeIds]);

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <div className="h-8 w-32 bg-crumb-200 dark:bg-crust-700 rounded animate-pulse" />
      </div>
    );
  }

  if (bakes.length < 2) {
    return (
      <div className="min-h-screen px-4 pt-6 pb-24">
        <Button variant="ghost" onClick={goBackFromPage} leftIcon={<ArrowLeft className="w-5 h-5" />}>
          {t('common.back')}
        </Button>
        <div className="text-center py-12">
          <p className="text-crust-600 dark:text-crumb-400">{t('bakeCompare.needTwoBakes')}</p>
        </div>
      </div>
    );
  }

  // Grid template: a label column + one column per bake.
  const cols = `minmax(74px, 0.8fr) repeat(${bakes.length}, minmax(90px, 1fr))`;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-10 bg-warmWhite/95 dark:bg-charcoal/95 backdrop-blur-sm px-4 py-3 border-b border-crumb-200 dark:border-crust-700">
        <Button variant="ghost" size="sm" onClick={goBackFromPage} leftIcon={<ArrowLeft className="w-5 h-5" />}>
          {t('common.back')}
        </Button>
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100 mb-1">
          {t('bakeCompare.title')}
        </h1>
        <p className="text-sm text-crust-500 dark:text-crumb-500 mb-4">
          {t('bakeCompare.subtitle')}
        </p>

        <div className="overflow-x-auto -mx-4 px-4">
          <div className="min-w-full" style={{ minWidth: bakes.length > 2 ? `${bakes.length * 120 + 90}px` : undefined }}>
            {/* Header row: bake names + date + overall */}
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: cols }}>
              <div />
              {bakes.map((b) => (
                <div key={b.uuid} className="text-center">
                  <p className="text-sm font-semibold text-crust-800 dark:text-crumb-100 truncate" title={b.recipeName}>
                    {b.recipeName}
                  </p>
                  <p className="text-[10px] text-crust-500 dark:text-crumb-500">
                    {format(new Date(b.date), 'MMM d')}
                  </p>
                  <div className="flex items-center justify-center gap-0.5 mt-0.5">
                    <Star className="w-3 h-3 fill-honey-500 text-honey-500" />
                    <span className="text-xs text-crust-600 dark:text-crumb-400">{b.results.overall}</span>
                  </div>
                </div>
              ))}
            </div>

            {sections.map((section, si) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: si * 0.05 }}
                className="mb-3"
              >
                <Card padding="sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-crust-500 dark:text-crumb-500 mb-2 px-1">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.metrics.map((metric) => {
                      const values = bakes.map((b) => metric.get(b));
                      // Highlight the row when not all values are identical.
                      const differs = new Set(values).size > 1;
                      return (
                        <div
                          key={metric.label}
                          className={`grid gap-2 items-center rounded-lg px-1 py-1 ${
                            differs ? 'bg-honey-50 dark:bg-honey-950/20' : ''
                          }`}
                          style={{ gridTemplateColumns: cols }}
                        >
                          <span className="text-xs text-crust-500 dark:text-crumb-500">{metric.label}</span>
                          {values.map((v, i) => (
                            <span
                              key={i}
                              className={`text-sm text-center ${
                                differs
                                  ? 'font-semibold text-crust-800 dark:text-crumb-100'
                                  : 'text-crust-700 dark:text-crumb-300'
                              }`}
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

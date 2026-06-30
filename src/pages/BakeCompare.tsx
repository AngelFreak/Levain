import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { useAppStore } from '../stores/appStore';
import { db } from '../lib/db';
import { format } from 'date-fns';
import type { Bake } from '../types';

interface BakeComparePageProps {
  bakeIds: string[];
}

const FOLD_LABELS: Record<string, string> = {
  stretch_fold: 'Stretch & fold',
  coil_fold: 'Coil fold',
  lamination: 'Lamination',
  slap_fold: 'Slap & fold',
};
const PROOF_LABELS: Record<string, string> = {
  room_temp: 'Room temp',
  cold_retard: 'Cold retard',
  proofbox: 'Proof box',
};

/** One comparable metric: a label and how to read it off a bake as a string. */
interface Metric {
  label: string;
  get: (b: Bake) => string;
}

const SECTIONS: Array<{ title: string; metrics: Metric[] }> = [
  {
    title: 'Ingredients',
    metrics: [
      { label: 'Flour', get: (b) => `${b.ingredients.totalFlour} g` },
      { label: 'Hydration', get: (b) => `${b.ingredients.hydration}%` },
      { label: 'Starter', get: (b) => `${b.ingredients.starterPercent}%` },
      { label: 'Salt', get: (b) => `${b.ingredients.saltPercent}%` },
    ],
  },
  {
    title: 'Process',
    metrics: [
      { label: 'Bulk', get: (b) => (b.processKnown === false ? '—' : `${b.process.bulkTime}h @ ${b.process.bulkTemp}°C`) },
      { label: 'Folds', get: (b) => (b.processKnown === false ? '—' : `${b.process.folds} × ${FOLD_LABELS[b.process.foldMethod]}`) },
      { label: 'Proof', get: (b) => (b.processKnown === false ? '—' : `${PROOF_LABELS[b.process.proofMethod]} · ${b.process.proofTime}h`) },
    ],
  },
  {
    title: 'Baking',
    metrics: [
      { label: 'Oven', get: (b) => (b.bakingKnown === false ? '—' : `${b.baking.ovenTemp}°C`) },
    ],
  },
  {
    title: 'Results',
    metrics: [
      { label: 'Overall', get: (b) => `${b.results.overall}/5` },
      { label: 'Oven spring', get: (b) => `${b.results.ovenSpring}/5` },
      { label: 'Crumb', get: (b) => `${b.results.crumbStructure}/5` },
      { label: 'Crust', get: (b) => `${b.results.crust}/5` },
      { label: 'Flavor', get: (b) => `${b.results.flavor}/5` },
      { label: 'Sourness', get: (b) => `${b.results.sourness}/5` },
    ],
  },
];

export function BakeComparePage({ bakeIds }: BakeComparePageProps) {
  const { goBackFromPage } = useAppStore();
  const [bakes, setBakes] = useState<Bake[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
          Back
        </Button>
        <div className="text-center py-12">
          <p className="text-crust-600 dark:text-crumb-400">Pick at least two bakes to compare.</p>
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
          Back
        </Button>
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100 mb-1">
          Compare bakes
        </h1>
        <p className="text-sm text-crust-500 dark:text-crumb-500 mb-4">
          Differences are highlighted.
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

            {SECTIONS.map((section, si) => (
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

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../lib/i18n/useTranslation';
import { useFocusTrap } from '../../lib/useFocusTrap';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  snapPoints?: ('content' | number)[]; // 'content' auto-sizes, number is vh percentage
  defaultSnap?: number;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  snapPoints = ['content'],
}: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();

  useFocusTrap(sheetRef, isOpen);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on escape key (drag-to-dismiss has no keyboard equivalent)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleDragEnd = (_: never, info: PanInfo) => {
    // If dragged down more than 100px or with high velocity, close
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  // Get max height - use inline style for dynamic values since Tailwind can't generate dynamic classes
  const getMaxHeightStyle = (): { maxHeight: string } | undefined => {
    const snap = snapPoints[0];
    if (snap === 'content') return { maxHeight: '85vh' };
    if (typeof snap === 'number') return { maxHeight: `${snap}vh` };
    return { maxHeight: '85vh' };
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleOverlayClick}
        >
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-crust-900 rounded-t-3xl overflow-hidden pb-safe"
            style={getMaxHeightStyle()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1 rounded-full bg-crumb-300 dark:bg-crust-700" />
            </div>

            {/* Header */}
            {title && (
              <div className="px-5 pb-3 border-b border-crumb-200 dark:border-crust-800">
                <h2 id={titleId} className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 text-center">
                  {title}
                </h2>
              </div>
            )}

            {/* Content */}
            <div className={`px-5 py-4 overflow-y-auto ${footer ? 'max-h-[calc(85vh-140px)]' : 'max-h-[calc(85vh-80px)]'}`}>
              {children}
            </div>

            {/* Sticky Footer */}
            {footer && (
              <div className="flex-shrink-0 px-5 py-4 border-t border-crumb-200 dark:border-crust-800 bg-white dark:bg-crust-900">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return null;
}

// Action sheet for quick actions
interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
}

interface ActionSheetAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

export function ActionSheet({ isOpen, onClose, title, actions }: ActionSheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className={`
              w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
              text-left font-medium transition-colors touch-target
              ${action.variant === 'danger'
                ? 'text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30'
                : 'text-crust-800 dark:text-crumb-200 hover:bg-crumb-100 dark:hover:bg-crust-800'
              }
            `}
          >
            {action.icon && (
              <span className="flex-shrink-0 w-5 h-5">{action.icon}</span>
            )}
            {action.label}
          </button>
        ))}
      </div>

      {/* Cancel button */}
      <button
        onClick={onClose}
        className="w-full mt-4 px-4 py-3.5 rounded-xl bg-crumb-100 dark:bg-crust-800 text-crust-700 dark:text-crumb-300 font-medium transition-colors hover:bg-crumb-200 dark:hover:bg-crust-700 touch-target"
      >
        {t('common.cancel')}
      </button>
    </BottomSheet>
  );
}

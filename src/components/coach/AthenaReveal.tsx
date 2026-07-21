'use client';

import { AnimatePresence, motion } from 'motion/react';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen celebration overlay shown when the Athena personality is unlocked.
 * Closes on tap/click anywhere. Purely presentational.
 */
export function AthenaReveal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-base/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Athena personality unlocked"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18 }}
            className="max-w-sm px-8 text-center"
          >
            <div
              className="mb-4 font-serif text-6xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-athena-from), var(--color-athena-to))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              ✦
            </div>
            <h2
              className="mb-3 font-serif text-3xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-athena-from), var(--color-athena-to))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Athena Prajñāpāramitā
            </h2>
            <p
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              A new voice is available in your coach picker.
              <br />
              Tap anywhere to continue.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

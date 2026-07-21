'use client';

import { motion } from 'motion/react';
import { Plus } from 'lucide-react';

interface Props {
  onClick: () => void;
  label?: string;
}

export function FAB({ onClick, label = 'New session' }: Props) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      className="fixed bottom-20 right-4 z-10 rounded-full bg-accent text-base shadow-lg shadow-accent/30 w-14 h-14 flex items-center justify-center"
      aria-label={label}
    >
      <Plus size={24} strokeWidth={2.5} />
    </motion.button>
  );
}

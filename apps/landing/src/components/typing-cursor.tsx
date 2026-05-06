"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

const phrases = [
  "No signups. No accounts.",
  "No uploads to the cloud. Ever.",
  "100% local processing.",
  "Free. Forever.",
  "No limits. No hidden caps.",
  "Works fully offline.",
  "Unlimited batch processing.",
  "48 image tools.",
  "15 AI models. Your hardware.",
  "Lightning fast. Built on Sharp.",
  "Air-gapped ready.",
  "One Docker container.",
  "Open source. Always.",
];

export function TypingCursor() {
  const [index, setIndex] = useState(0);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % phrases.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(advance, 3000);
    return () => clearInterval(timer);
  }, [advance]);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={phrases[index]}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="text-accent"
      >
        {phrases[index]}
      </motion.span>
    </AnimatePresence>
  );
}

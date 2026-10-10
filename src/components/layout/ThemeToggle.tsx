'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Sync mounted state and verify persistent localStorage theme on mount
  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        if (stored !== theme) {
          setTheme(stored);
        }
        if (stored === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        }
      }
    } catch (e) {
      // ignore storage access errors
    }
  }, [theme, setTheme]);

  const currentTheme = mounted ? (resolvedTheme || theme || 'dark') : 'dark';
  const isDark = currentTheme === 'dark';

  const handleToggle = () => {
    const next = isDark ? 'light' : 'dark';

    // 1. Update next-themes state
    setTheme(next);

    // 2. Standard localStorage persistence across sessions/refreshes
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      console.warn('Failed to save theme in localStorage:', e);
    }

    // 3. Directly toggle the root HTML element class ('dark' or 'light')
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }

    toast.info(`Theme switched to ${next} mode`);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="relative overflow-hidden cursor-pointer"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{
          scale: !isDark ? 1 : 0,
          rotate: !isDark ? 0 : 90,
          opacity: !isDark ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <Sun className="h-[1.2rem] w-[1.2rem] text-amber-400" />
      </motion.div>
      <motion.div
        initial={false}
        animate={{
          scale: isDark ? 1 : 0,
          rotate: isDark ? 0 : -90,
          opacity: isDark ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <Moon className="h-[1.2rem] w-[1.2rem] text-indigo-400" />
      </motion.div>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}


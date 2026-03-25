'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StaggerListProps {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
  delay?: number;
  staggerDelay?: number;
}

/**
 * StaggerList — danh sách các item hiện ra lần lượt từng cái (hiệu ứng domino).
 * Wrap các item con trong mảng vào, nó tự stagger.
 *
 * Ví dụ:
 * <StaggerList>
 *   <Row>...</Row>
 *   <Row>...</Row>
 * </StaggerList>
 */
export function StaggerList({
  children,
  className,
  itemClassName,
  delay = 0,
  staggerDelay = 0.07,
}: StaggerListProps) {
  const container = {
    hidden: {},
    show: {
      transition: {
        delayChildren: delay,
        staggerChildren: staggerDelay,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { ease: 'easeOut', duration: 0.35 } },
  };

  return (
    <motion.ul
      variants={container}
      initial="hidden"
      animate="show"
      className={cn('list-none p-0 m-0', className)}
    >
      {children.map((child, i) => (
        <motion.li key={i} variants={item} className={cn(itemClassName)}>
          {child}
        </motion.li>
      ))}
    </motion.ul>
  );
}

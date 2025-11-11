
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number;
  total: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, total, color }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="rounded-lg border bg-card text-card-foreground p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <span className="text-sm font-bold">
          {value} / {total}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 flex-grow rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full', color)}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs font-semibold">{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
};

export { StatCard };

    
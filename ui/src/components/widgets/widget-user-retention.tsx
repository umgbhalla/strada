'use client';

import * as React from 'react';

import { ChartRetentionHeatmap } from '@/components/chart-retention-heatmap';
import IconInfoCustom from '@/components/icons/icon-info-custom-fill';
import { WidgetCard, WidgetHeader } from '@/components/widget-card';

/**
 * User Retention Cohort Analysis Visualization
 *
 * This component displays a retention heatmap showing how well users are retained over time.
 *
 * Structure:
 * - Each ROW represents a cohort (group of users who started using the product in the same period)
 * - Each COLUMN (0-11) represents months after the user's start date
 * - Triangle shape occurs because newer cohorts have less historical data
 *
 * Data Representation:
 * - Color intensity (white to #FA7319) indicates retention rate
 * - Darker orange = higher retention (more users still active)
 * - Lighter colors = lower retention (more users dropped off)
 *
 * How to Read:
 * - Column 0 typically shows 100% (starting point - all users who joined)
 * - Moving right shows what percentage of original users remained active
 * - Each row tracks a specific cohort's behavior over time
 * - Empty cells appear because newer cohorts haven't existed long enough
 *
 * Example:
 * - Dark orange cell at Month 3 = high percentage of users still active after 3 months
 * - Light orange cell = fewer users remained active
 * - Gradual fade from dark to light (left to right) shows typical user drop-off
 *
 * The header shows:
 * - Overall retention rate (e.g., "24%")
 * - Change from previous period (e.g., "+2.0%")
 */

const generateRetentionData = () => {
  // Generate 12 rows (cohorts)
  return Array.from({ length: 12 }, (_, rowIndex) => {
    // Each row should have (12 - rowIndex) values
    // Starting with higher values and gradually decreasing
    return Array.from({ length: 12 - rowIndex }, () => {
      // Generate a value between 60-100 with gradual decrease
      const baseValue = Math.max(60, 100 - rowIndex * 5);
      return Math.round(baseValue - Math.random() * 20);
    });
  });
};

export function WidgetUserRetention() {
  const retentionData = generateRetentionData();

  return (
    <WidgetCard>
      <WidgetHeader
        title='User Retention'
        value='24%'
        badge='+2.0%'
        actionLabel='Details'
      />

      <ChartRetentionHeatmap
        data={retentionData}
        labels={Array.from({ length: 12 }, (_, i) => i + 1)}
      />

      <div className='flex items-center gap-1.5 rounded-lg bg-background p-1.5 ring-1 ring-inset ring-border'>
        <IconInfoCustom className='size-4 shrink-0 text-foreground/25' />
        <div className='text-xs font-normal text-muted-foreground'>
          Last 12 months data updated at 1:51 PM.
        </div>
      </div>
    </WidgetCard>
  );
}

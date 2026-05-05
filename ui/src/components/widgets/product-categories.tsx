'use client';

import * as React from 'react';
import NumberFlow from '@number-flow/react';
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react';

import { cn } from '@/utils/cn';
import { useAnimateNumber } from '@/hooks/use-animate-number';
import * as Button from '@/components/alignui/button';
import * as Tooltip from '@/components/alignui/tooltip';
import IconInfoCustom from '@/components/icons/icon-info-custom-fill';
import { ProgressChart } from '@/components/progress-chart';
import { WidgetCard } from '@/components/widget-card';

const categoriesData = [
  {
    id: '70d9',
    label: 'Accessories',
    value: 58,
    products: 45,
    growth: 3.2,
    weeklyGrowth: 2.1,
  },
  {
    id: '477b',
    label: 'Wearables',
    value: 40,
    products: 32,
    growth: 2.8,
    weeklyGrowth: 1.5,
  },
  {
    id: '9cf3',
    label: 'Smart Home',
    value: 15,
    products: 18,
    growth: 4.5,
    weeklyGrowth: 3.2,
  },
];

function ProductCategoriesContent() {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const initialRenderRef = React.useRef(true);
  const prevValueRef = React.useRef(0);

  const activeCategory = categoriesData[currentIndex];

  const handlePrevious = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? categoriesData.length - 1 : prev - 1,
    );
  };

  const handleNext = () => {
    setCurrentIndex((prev) =>
      prev === categoriesData.length - 1 ? 0 : prev + 1,
    );
  };

  const animateNumber = useAnimateNumber({
    start: prevValueRef.current,
    end: activeCategory.value,
    duration: initialRenderRef.current ? 1250 : 300,
    onComplete: () => {
      prevValueRef.current = activeCategory.value;
      initialRenderRef.current = false;
    },
  });

  React.useEffect(() => {
    if (activeCategory.value) {
      animateNumber.start();
    } else {
      animateNumber.reset();
    }
  }, [activeCategory]);

  return (
    <>
      <div className='flex items-start gap-2'>
        <div className='flex-1'>
          <div className='flex items-center gap-1'>
            <div className='text-sm font-medium text-muted-foreground'>
              Product Categories
            </div>
            <Tooltip.Root>
              <Tooltip.Trigger>
                <IconInfoCustom className='size-5 text-foreground/25' />
              </Tooltip.Trigger>
              <Tooltip.Content className='max-w-80'>
                Distribution of your store&apos;s product inventory across
                different categories, showing total products and growth rate per
                category.
              </Tooltip.Content>
            </Tooltip.Root>
          </div>
          <div className='mt-1 flex items-center gap-2'>
            <div className='text-2xl font-medium text-foreground'>
              <NumberFlow value={activeCategory.value} suffix='%' />
            </div>
            <div className='text-sm font-medium text-muted-foreground'>
              <span className='text-success'>
                +{activeCategory.weeklyGrowth}%
              </span>{' '}
              vs last week
            </div>
          </div>
        </div>
        <Button.Root variant='neutral' mode='stroke' size='xxsmall'>
          Details
        </Button.Root>
      </div>

      <div className='mt-3.5'>
        <ProgressChart value={animateNumber.value} />
      </div>

      <div className='mt-3 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='whitespace-nowrap text-sm font-medium text-muted-foreground'>
            {activeCategory.label}
          </div>

          <div className='flex'>
            <button
              type='button'
              onClick={handlePrevious}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-l-md bg-background ring-1 ring-inset ring-border',
                'transition duration-200 ease-out',
                'hover:bg-muted',
                'focus:outline-hidden focus-visible:bg-muted',
              )}
            >
              <RiArrowLeftSLine className='size-[18px] text-muted-foreground' />
            </button>
            <button
              type='button'
              onClick={handleNext}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-r-md bg-background ring-1 ring-inset ring-border',
                'transition duration-200 ease-out',
                'hover:bg-muted',
                'focus:outline-hidden focus-visible:bg-muted',
              )}
            >
              <RiArrowRightSLine className='size-[18px] text-muted-foreground' />
            </button>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <div className='text-sm font-medium text-muted-foreground'>
            {activeCategory.products} products
          </div>
          <div className='text-xs font-medium text-foreground/40'>·</div>
          <div className='text-sm font-medium text-success'>
            +{activeCategory.growth}%
          </div>
        </div>
      </div>
    </>
  );
}

export function ProductCategories() {
  return (
    <div className='relative flex w-full flex-col'>
      <ProductCategoriesContent />
    </div>
  );
}

export function ProgressNavPanel() {
  return (
    <WidgetCard>
      <ProductCategoriesContent />
    </WidgetCard>
  );
}

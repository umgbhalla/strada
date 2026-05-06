// AlignUI Divider v0.0.0

import { tv, type VariantProps } from '@strada.sh/ui/src/utils/tv.ts';

const DIVIDER_ROOT_NAME = 'DividerRoot';

export const dividerVariants = tv({
  base: 'relative flex w-full items-center',
  variants: {
    variant: {
      line: 'h-0 before:absolute before:left-0 before:top-1/2 before:h-px before:w-full before:-translate-y-1/2 before:bg-border',
      'line-spacing': [
        // base
        'h-1',
        // before
        'before:absolute before:left-0 before:top-1/2 before:h-px before:w-full before:-translate-y-1/2 before:bg-border',
      ],
      'line-text': [
        // base
        'gap-2.5',
        'text-xs font-medium text-foreground/40',
        // before
        'before:h-px before:w-full before:flex-1 before:bg-border',
        // after
        'after:h-px after:w-full after:flex-1 after:bg-border',
      ],
      content: [
        // base
        'gap-2.5',
        // before
        'before:h-px before:w-full before:flex-1 before:bg-border',
        // after
        'after:h-px after:w-full after:flex-1 after:bg-border',
      ],
      text: [
        // base
        'px-2 py-1',
        'text-xs font-medium text-foreground/40',
      ],
      'solid-text': [
        // base
        'bg-muted px-5 py-1.5 uppercase',
        'text-xs font-medium text-foreground/40',
      ],
    },
  },
  defaultVariants: {
    variant: 'line',
  },
});

function Divider({
  className,
  variant,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof dividerVariants>) {
  return (
    <div
      role='separator'
      className={dividerVariants({ variant, class: className })}
      {...rest}
    />
  );
}
Divider.displayName = DIVIDER_ROOT_NAME;

export { Divider as Root };

// AlignUI CompactButton v0.0.0

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { PolymorphicComponentProps } from '@/utils/polymorphic';
import { recursiveCloneChildren } from '@/utils/recursive-clone-children';
import { tv, type VariantProps } from '@/utils/tv';

const COMPACT_BUTTON_ROOT_NAME = 'CompactButtonRoot';
const COMPACT_BUTTON_ICON_NAME = 'CompactButtonIcon';

export const compactButtonVariants = tv({
  slots: {
    root: [
      // base
      'relative flex shrink-0 items-center justify-center outline-hidden',
      'transition duration-200 ease-out',
      // disabled
      'disabled:pointer-events-none disabled:border-transparent disabled:bg-transparent disabled:text-foreground/25 disabled:shadow-none',
      // focus
      'focus:outline-hidden',
    ],
    icon: '',
  },
  variants: {
    variant: {
      stroke: {
        root: [
          // base
          'border border-border bg-background text-muted-foreground shadow-xs',
          // hover
          'hover:border-transparent hover:bg-muted hover:text-foreground hover:shadow-none',
          // focus
          'focus-visible:border-transparent focus-visible:bg-foreground focus-visible:text-background focus-visible:shadow-none',
        ],
      },
      ghost: {
        root: [
          // base
          'bg-transparent text-muted-foreground',
          // hover
          'hover:bg-muted hover:text-foreground',
          // focus
          'focus-visible:bg-foreground focus-visible:text-background',
        ],
      },
      white: {
        root: [
          // base
          'bg-background text-muted-foreground shadow-xs',
          // hover
          'hover:bg-muted hover:text-foreground',
          // focus
          'focus-visible:bg-foreground focus-visible:text-background',
        ],
      },
      modifiable: {},
    },
    size: {
      large: {
        root: 'size-6',
        icon: 'size-5',
      },
      medium: {
        root: 'size-5',
        icon: 'size-[18px]',
      },
    },
    fullRadius: {
      true: {
        root: 'rounded-full',
      },
      false: {
        root: 'rounded-md',
      },
    },
  },
  defaultVariants: {
    variant: 'stroke',
    size: 'large',
    fullRadius: false,
  },
});

type CompactButtonSharedProps = Omit<
  VariantProps<typeof compactButtonVariants>,
  'fullRadius'
>;

type CompactButtonProps = VariantProps<typeof compactButtonVariants> &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  };

const CompactButtonRoot = React.forwardRef<
  HTMLButtonElement,
  CompactButtonProps
>(
  (
    { asChild, variant, size, fullRadius, children, className, ...rest },
    forwardedRef,
  ) => {
    const uniqueId = React.useId();
    const Component = asChild ? Slot : 'button';
    const { root } = compactButtonVariants({ variant, size, fullRadius });

    const sharedProps: CompactButtonSharedProps = {
      variant,
      size,
    };

    const extendedChildren = recursiveCloneChildren(
      children as React.ReactElement[],
      sharedProps,
      [COMPACT_BUTTON_ICON_NAME],
      uniqueId,
      asChild,
    );

    return (
      <Component
        ref={forwardedRef}
        className={root({ class: className })}
        {...rest}
      >
        {extendedChildren}
      </Component>
    );
  },
);
CompactButtonRoot.displayName = COMPACT_BUTTON_ROOT_NAME;

function CompactButtonIcon<T extends React.ElementType>({
  variant,
  size,
  as,
  className,
  ...rest
}: PolymorphicComponentProps<T, CompactButtonSharedProps>) {
  const Component = as || 'div';
  const { icon } = compactButtonVariants({ variant, size });

  return <Component className={icon({ class: className })} {...rest} />;
}
CompactButtonIcon.displayName = COMPACT_BUTTON_ICON_NAME;

export { CompactButtonRoot as Root, CompactButtonIcon as Icon };

import { createTV } from 'tailwind-variants';

import { twMergeConfig } from '@strada.sh/ui/src/utils/cn';

export type { VariantProps, ClassValue } from 'tailwind-variants';

export const tv = createTV({
  twMergeConfig,
});

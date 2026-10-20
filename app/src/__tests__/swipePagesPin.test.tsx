// The pager keeps a pinned part of each page still while the pages slide (ui/SwipePages.tsx `pinX`;
// founder iPhone test, 20 Oct: the whole profile slid sideways, not only the grid). Each page's pin
// cancels the pager's horizontal offset, and each page clips to its own bounds, so the two pages'
// pinned parts meet at the moving seam as one still picture.
import { Animated, Text } from 'react-native';

import { SwipePages } from '@/ui/SwipePages';

// react-test-renderer comes with jest-expo; it has no type declarations here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAllByProps: (p: object) => { props: { style: unknown } }[] }; unmount: () => void };
  act: (fn: () => void | Promise<void>) => Promise<void>;
};

type Valued = Animated.AnimatedNode & { __getValue: () => number };

test('each page gets a pin that cancels the pager offset, and pages clip', async () => {
  const pins: Record<string, Valued> = {};
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(() => {
    tree = renderer.create(
      <SwipePages
        pages={['responses', 'replies'] as const}
        selected="responses"
        onSelect={() => {}}
        renderPage={(page, _shown, pinX) => {
          pins[page] = pinX as Valued;
          return <Text>{page}</Text>;
        }}
      />,
    );
  });
  const width = 750; // jest-expo's window width
  // At rest on the first page (offset 0): its pinned part is not moved, the second page's is moved
  // one page to the left, so both draw it at the same place on screen.
  expect(pins.responses.__getValue()).toBe(0);
  expect(pins.replies.__getValue()).toBe(-width);
  const pages = tree.root.findAllByProps({ importantForAccessibility: 'auto' }).concat(tree.root.findAllByProps({ importantForAccessibility: 'no-hide-descendants' }));
  expect(pages.length).toBeGreaterThanOrEqual(2);
  for (const p of pages) expect(p.props.style).toMatchObject({ overflow: 'hidden' });
  tree.unmount();
});

# rollup-plugin-jsx-if-for
This is a plugin for [the Rollup bundler](https://rollupjs.org) which rewrites
[JSX content](https://react.dev/learn/writing-markup-with-jsx) (whether or not
React is used) so `<$if>` and `<$for>` tags are converted into corresponding
Javascript expressions:

- `<$if test={expr}>...</$if>` becomes `{(expr) ? <>...</> : null}`
- `<$for var="id" of={expr}>...</$for>` becomes `{(expr).map((id) => <> ... </>)}`

## Why?

In most cases you can just write the `{...}` Javascript directly which is
more straightforward!

However, if you're using [MDX](https://mdxjs.com/) (Markdown with
JSX support), you can put Markdown content inside component tags, but not inside
Javascript curly braces. (See [these](https://github.com/orgs/mdx-js/discussions/2581)
[discussions](https://github.com/orgs/mdx-js/discussions/2276).)

So while this plugin doesn't technically involve MDX at all, mostly it exists to
deal with this MDX quirk and let you write conditions and loops around Markdown content.
("Traditional" template languages often use tag-based conditionals and loops like these.)

## Usage

Add this module:
```
npm i rollup-plugin-jsx-if-for
```

Configure Rollup to use it, in `rollup.config.js` or equivalent:
```
import rollupJsxIfFor from "rollup-plugin-jsx-if-for";
import rollupMdx from "@mdx-js/rollup";
...
export default {
  ...
  jsx: { mode: "automatic", jsxImportSource: ... },
  ...
  plugins: [
    ...
    rollupMdx({ jsx: true }),  // output JSX tags in MDX output
    rollupJsxIfFor({ ... }),
    ...
  ],
};
```

This plugin takes an options object with `include` and `exclude` which follow
[conventions for Rollup transforming plugins](https://rollupjs.org/plugin-development/#transformers).

> [!IMPORTANT]
> If you're using this, you're probably also using [`@mdx-js/rollup`](https://mdxjs.com/packages/rollup/).
> Make sure to [configure MDX](https://mdxjs.com/packages/mdx/#processoroptions) (as above) to keep JSX
> tags in its output so this plugin can rewrite them. Also make sure to
> [configure Rollup](https://rollupjs.org/configuration-options/#jsx) (as above) to convert JSX to JS
> in the final output.
>
> Also make sure to put this plugin AFTER transformers which turn other formats into JS/JSX
> (eg. [`rollup-plugin-postcss`](https://github.com/egoist/rollup-plugin-postcss#readme)),
> or configure this plugin to exclude the input files. Otherwise you'll get errors from this
> plugin trying to parse CSS or something.

## Minimal example

Use this `rollup.config.mjs`

```
import fg from "fast-glob";
import rollupAutomountDom from "rollup-plugin-automount-dom";
import rollupHtml from "@rollup/plugin-html";
import rollupJsxIfFor from "rollup-plugin-jsx-if-for";
import rollupMdx from "@mdx-js/rollup";
import { nodeResolve as rollupNodeResolve } from "@rollup/plugin-node-resolve";

export default fg.sync("*.mdx").map((input) => ({
  input,
  jsx: { mode: "automatic", jsxImportSource: "jsx-dom" },
  output: { directory: "dist", format: "iife" },
  plugins: [
    rollupAutomountDom(),
    rollupHtml({ fileName: input.replace(/mdx$/, "html"), title: "" }),
    rollupJsxIfFor(),
    rollupMdx({ jsx: true }),
    rollupNodeResolve(),
  ],
}));
```

And this `beer.mdx`

```
export const countdown = [...Array(100).keys()].reverse();

<$for var="n" of={countdown}>
  <$if test={n > 0}>
    ## {n} bottles of beer on the wall, {n} bottles of beer
    Take one down and pass it around,
    <$if test={n > 1}>{n - 1}</$if> <$if test={n <= 1)>no more</$if>
    bottles of beer on the wall.
  </$if>
  <$if test={n == 0}>
    ## No more bottles of beer on the wall, no more bottles of beer
    Go to the store and buy some more, 99 bottles of beer on the wall
  </$if>
</$for>
```

And then run

```
npm i fast-glob jsx-dom @mdx-js/rollup rollup rollup-plugin-automount-dom @rollup/plugin-html rollup-plugin-jsx-if-for @rollup/plugin-node-resolve
npx rollup -c
```

And finally load `dist/beer.html` in your browser and you should see something like this

![image](https://github.com/user-attachments/assets/18db5fb4-bfc6-4eed-883e-530b8c6a65c0)

Tada! 🍺

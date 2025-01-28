# rollup-plugin-jsx-if-for
This is a plugin for [the Rollup bundler](https://rollupjs.org) which
rewrites [JSX content](https://react.dev/learn/writing-markup-with-jsx)
(whether or not React is used) so certain "pseudo-component" tags are
converted to corresponding Javascript expressions:

- `<$if test={expr}>...</$if>` becomes `{(expr) ? <>...</> : null}`
- `<$for var="id" of={expr}>...</$for>` becomes `{(expr).map((id) => <> ... </>)}`
- `<$let var="id" be={expr}>...</$let>` becomes `{((id) => <> ... </>)(expr)}`

## Why?

In most cases you can just write the `{...}` expression directly which is
more straightforward!

However, [MDX](https://mdxjs.com/) (Markdown with JSX support),
only allows Markdown content inside component tags, not inside Javascript
curly braces. (See
[these](https://github.com/orgs/mdx-js/discussions/2581)
[discussions](https://github.com/orgs/mdx-js/discussions/2276).)

So, while this plugin doesn't technically involve MDX at all, it exists
mostly to deal with this MDX quirk and let you write conditions, loops,
and local variable bindings around Markdown content. ("Traditional" template
languages often use tag-based conditionals and loops in this way.)

## Usage

Add this module:
```
npm i rollup-plugin-jsx-if-for
```

Configure Rollup to use it, in `rollup.config.js` or equivalent:
```
import rollupJsxIfFor from "rollup-plugin-jsx-if-for";
...
export default {
  ...
  plugins: [
    ...
    rollupJsxIfFor({ ... }),
  ],
};
```

This plugin's constructor takes
[conventional](https://rollupjs.org/plugin-development/#transformers)
`include` and `exclude` options to subselect from the files
Rollup is processing.

```
rollupJsxIfFor({
  include = ["**/*.mdx", "**/*.jsx"],
  exclude = [],
})
```


> [!NOTE]
> List this plugin AFTER plugins which convert other formats into JS/JSX (eg.
> [`rollup-plugin-postcss`](https://github.com/egoist/rollup-plugin-postcss#readme)),
> or in fact [`@mdx-js/rollup`](https://mdxjs.com/packages/rollup/].
> Otherwise this plugin will fail trying to parse CSS or raw MDX or something.

## Using this plugin with MDX

If you're using this plugin, you're probably also using
[`@mdx-js/rollup`](https://mdxjs.com/packages/rollup/).

Configure both
[MDX](https://mdxjs.com/packages/mdx/#processoroptions)
and
[Rollup](https://rollupjs.org/configuration-options/#jsx)
so JSX-to-JS conversion happens in the Rollup core, not the MDX plugin:

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

> [!CAUTION]
> In MDX content, `<$if>` and `<$for>` tags will wrap Markdown/JSX,
> BUT `import` and `export` directives are executed globally first without
> regard to these tags. So this will NOT work:
> ```mdx
> <$for var="i" of={[1, 2, 3]}>
>   export const j = i * 2;  // WILL FAIL, is evaluated BEFORE and OUTSIDE the loop
>   ## {i} times 2 is {j}   {/* WILL NOT WORK */}
> </$for>
> ```
>
> Instead, use `<$let>`, like this:
> ```mdx
> <$for var="i" of={[1, 2, 3]}>
>   <$let var="j" equals={i * 2}>
>     ## {i} times 2 is {j}
>   </$let>
> </$for>
> ```

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

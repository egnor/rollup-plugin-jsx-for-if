# rollup-plugin-jsx-if-for
This is a plugin for [the Rollup bundler](https://rollupjs.org) which rewrites
[JSX content](https://react.dev/learn/writing-markup-with-jsx) (whether or not
React is used) so `<$if>` and `<$for>` tags are converted into corresponding
Javascript expressions:

- `<$if test={expr}>...</$if>` becomes `{(expr) ? <>...</> : null}`
- `<$for var="id" of={expr}>...</$for>` becomes `{(expr).map((id) => <> ... </>)}`

## Why?

In most cases you can just write the `{...}` Javascript directly which is
more straightforward! But, if you're using [MDX](https://mdxjs.com/) (Markdown with
JSX support), you can put Markdown content inside component tags, but not inside
Javascript curly braces. (See [these](https://github.com/orgs/mdx-js/discussions/2581)
[discussions](https://github.com/orgs/mdx-js/discussions/2276).)

So while this plugin doesn't technically involve MDX at all, mostly it exists to
deal with this MDX quirk and let you write conditions and loops around Markdown content.
("Traditional" template languages often have something like this, e.g. Jinja2
[Jinja2 `{% if ... %}`](https://jinja.palletsprojects.com/en/stable/templates/#tests),
[Mustache `{{#...}}`](https://mustache.github.io/mustache.5.html),
[PHP `<?php if (...): ?>`](https://www.php.net/control-structures.alternative-syntax),
[WebC `<... webc:if="...">`](https://www.11ty.dev/docs/languages/webc/#webc-if), etc.)

import * as estreeWalker from "estree-walker"; 
import MagicString from "magic-string";
import pluginUtils from "@rollup/pluginutils";

export default function rollupJsxForIf({
  include = ["**/*.mdx", "**/*.jsx"], exclude = []
} = {}) {
  const filter = pluginUtils.createFilter(include, exclude);
  const firstPass = /\$(if|for|let)\b/;

  return {
    name: "jsx-for-if",

    transform(codeInput, id) {
      if (!filter(id) || !firstPass.test(codeInput)) return null;

      const codeTree = this.parse(codeInput, { jsx: true });
      const codeText = new MagicString(codeInput);
      const pluginContext = this;

      estreeWalker.walk(codeTree, {
        enter(node) {
          var handler = nodeHandlers[node.type];
          if (handler) handler(pluginContext, codeText, node);
        },
      });

      if (!codeText.hasChanged()) return null;
      return { code: codeText.toString(), map: codeText.generateMap() };
    }
  };
}

const nodeHandlers = {
  JSXElement: function(pluginContext, codeText, node) {
    const { openingElement: openTag, closingElement: closeTag } = node;
    if (
      openTag.name.type !== "JSXIdentifier" ||
      !openTag.name.name.startsWith("$")
    ) {
      return;
    }

    const openText = codeText.slice(openTag.start, openTag.end);
    const attrs = {};
    for (const a of openTag.attributes) {
      if (a.type === "JSXAttribute") {
        attrs[a.name.name] = a;
      }
    }

    // Rewrite <$if test={expr}>...</$if> to <>{(expr) ? <>...</> : null}</>
    if (openTag.name.name === "$if") {
      pluginContext.debug(`Rewriting ${openText}`);

      const { test: testAttr, ...extraNodes } = attrs;
      if (testAttr?.value?.type !== "JSXExpressionContainer") {
        throw new Error(`Need test={expression} in ${openText}`);
      }
      if (extraNodes.length > 0) {
        throw new Error(`Bad attribute in ${openText}`);
      }

      codeText.overwrite(
        openTag.start, testAttr.value.expression.start, "<>{("
      );

      codeText.overwrite(
        testAttr.value.expression.end, openTag.end, ") ? <>"
      );

      codeText.overwrite(closeTag.start, closeTag.end, "</> : null}</>");
    }

    // Rewrite <$for var="id" of={expr}>...</$for>
    // to <>{(expr).map((id) => <>...</>)}</>
    if (openTag.name.name === "$for") {
      pluginContext.debug(`Rewriting ${openText}`);

      const { var: varAttr, of: ofAttr, ...extraNodes } = attrs;
      if (varAttr?.value?.type !== "Literal") {
        throw new Error(`Need var="name" in ${openText}`);
      }
      if (ofAttr?.value?.type !== "JSXExpressionContainer") {
        throw new Error(`Need of={expression} in ${openText}`);
      }
      if (extraNodes.length > 0) {
        throw new Error(`Bad attribute in ${openText}`);
      }

      const varText = varAttr.value.value;
      // TODO: validate varText as an identifier OR destructuring pattern
      // probably by parsing `let ${varText} = null;` and
      // verifying that we get exactly one valid let-expression?

      const ofExpr = ofAttr.value.expression;
      codeText.overwrite(openTag.start, ofExpr.start, "<>{(");
      codeText.overwrite(ofExpr.end, openTag.end, `).map((${varText}) => <>`);
      codeText.overwrite(closeTag.start, closeTag.end, "</>)}</>");
    }

    // Rewrite <$let var="id" value={expr}/>...</$let>
    // to <>{((id) => <>...</>)((expr))}</>
    if (openTag.name.name === "$let") {
      pluginContext.debug(`Rewriting ${openText}`);

      const { var: varAttr, value: valueAttr, ...extraNodes } = attrs;
      if (varAttr?.value?.type !== "Literal") {
        throw new Error(`Need var="name" in ${openText}`);
      }
      if (valueAttr?.value?.type !== "JSXExpressionContainer") {
        throw new Error(`Need value={expression} in ${openText}`);
      }
      if (extraNodes.length > 0) {
        throw new Error(`Bad attribute in ${openText}`);
      }

      const varText = varAttr.value.value;
      // TODO: validate varText as above

      const valueExpr = valueAttr.value.expression;
      const valueText = codeText.slice(valueExpr.start, valueExpr.end);
      codeText.overwrite(openTag.start, openTag.end, `<>{((${varText}) => <>`);
      codeText.overwrite(
        closeTag.start, closeTag.end, `</>)((${valueText}))}</>`
      );
    }
  },

  CallExpression: function(pluginContext, codeText, node) {
    if (
      node.callee.type !== "Identifier" ||
      node.callee.name !== "_missingMdxReference" ||
      node.arguments.length < 1 ||
      node.arguments[0].type !== "Literal"
    ) {
      return;
    }

    // MDX inserts code to check every referenced component name.
    // We've rewritten $if and $for away, but we have to nerf the check also.
    if (["$if", "$for", "$let"].includes(node.arguments[0].value)) {
      pluginContext.debug(`Rewriting ${codeText.slice(node.start, node.end)}`);
      codeText.overwrite(node.start, node.end, "{}");
    }
  },
};

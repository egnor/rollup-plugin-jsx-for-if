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

      const tree = this.parse(codeInput, { jsx: true });
      const text = new MagicString(codeInput);
      const plugin = this;

      estreeWalker.walk(tree, {
        leave(node, parent, prop, index) {
          const handler = nodeTypeHandlers[node.type];
          if (handler) handler(plugin, text, node, parent, prop, index);
        },
      });

      if (!text.hasChanged()) return null;
      plugin.debug(`Text: ${text}`);
      return { code: text.toString(), map: text.generateMap() };
    }
  };
}

const nodeTypeHandlers = {
  JSXElement: function(plugin, text, node, ...args) {
    if (node.openingElement.name.type === "JSXIdentifier") {
      const handler = elementNameHandlers[node.openingElement?.name?.name];
      if (handler) handler(plugin, text, node, ...args);
    }
  },

  CallExpression: function(plugin, text, node) {
    if (
      node.callee.type !== "Identifier" ||
      node.callee.name !== "_missingMdxReference" ||
      node.arguments.length < 1 ||
      node.arguments[0].type !== "Literal"
    ) {
      return;
    }

    // MDX inserts code to check every referenced component name.
    // We've rewritten the elements away, but we have to nerf the check also.
    if (Object.keys(elementNameHandlers).includes(node.arguments[0].value)) {
      plugin.debug(`Disabling ${text.slice(node.start, node.end)}`);
      text.overwrite(node.start, node.end, "{}");
    }
  },
};

function wrapCodeForParent(text, node, parent) {
  if (["JSXElement", "JSXFragment"].includes(parent.type)) {
    text.prependRight(node.start, "{");
    text.appendLeft(node.end, "}");
  } else {
    text.prependRight(node.start, "(");
    text.appendLeft(node.end, ")");
  }
}

function wrapChildrenForCode(text, node) {
  if (!node.closingElement) {
    text.appendLeft(node.openingElement.end, "<></>");
  } else {
    // TODO - figure out how to skip JSX fragment insertion sometimes
    //  - when it's a single element node we didn't mess with
    //  - when it's code we generated, and we can avoid the {} wrapper
    text.prependRight(node.openingElement.end, "<>");
    text.appendLeft(node.closingElement.start, "</>");
  }
}

const elementNameHandlers = {
  // Rewrite <$for var="id" of={expr}>...</$for>
  // to <>{(expr).map((id) => <>...</>)}</>
  $for: function(plugin, text, node, parent) {
    const { openingElement: open, closingElement: close } = node;
    const openText = text.slice(open.start, open.end);
    plugin.debug(`Rewriting ${openText}`);
    const { var: varAttr, of: ofAttr, ...extraNodes } = Object.fromEntries(
      open.attributes.map(a => [a.name.name, a])
    );
    if (varAttr?.value?.type !== "Literal") {
      throw new Error(`Need var="name" in ${openText}`);
    }
    if (ofAttr?.value?.type !== "JSXExpressionContainer") {
      throw new Error(`Need of={expression} in ${openText}`);
    }
    if (extraNodes.length > 0) {
      throw new Error(`Bad attribute in ${openText}`);
    }

    // TODO: validate varText as an identifier OR destructuring pattern
    // probably by parsing `let ${varText} = null;` and
    // verifying that we get exactly one valid let-expression?
    const varText = varAttr.value.value;
    const ofExpr = ofAttr.value.expression;
    text.overwrite(open.start, ofExpr.start, "(");
    text.overwrite(ofExpr.end, open.end, `).map((${varText}) => `);
    wrapChildrenForCode(text, node);
    if (close) text.remove(close.start, close.end);
    text.appendLeft(node.end, ")");
    wrapCodeForParent(text, node, parent);
  },

  // Rewrite <$if test={expr}>...</$if> to <>{(expr) ? <>...</> : null}</>
  // (The $else handler also passes here.)
  $if: function(plugin, text, node, parent, prop, index) {
    const { openingElement: open, closingElement: close } = node;
    const openText = text.slice(open.start, open.end);
    plugin.debug(`Rewriting ${openText}`);

    const { test: testAttr, ...extraAttrs } = Object.fromEntries(
      open.attributes.map(a => [a.name.name, a])
    );
    if (open.name.name === "$if" && !testAttr) {
      throw new Error(`Missing test={expression} in ${openText}`);
    }
    if (testAttr && testAttr.value?.type !== "JSXExpressionContainer") {
      throw new Error(`Bad test={expression} in ${openText}`);
    }
    if (extraAttrs.length > 0) {
      throw new Error(`Bad attribute in ${openText}`);
    }

    if (testAttr) {
      text.overwrite(open.start, testAttr.value.expression.start, "(");
      text.overwrite(testAttr.value.expression.end, open.end, ") ? ");
    } else {
      text.remove(open.start, open.end);
    }

    wrapChildrenForCode(text, node);
    if (close) text.remove(close.start, close.end);
    if (testAttr) text.appendLeft(node.end, " : ");

    const children = (prop === "children") && parent?.children;
    const nextNode = children?.[index + 1];
    if (nextNode?.openingElement?.name?.name === "$else") {
      // Leave code open for the rest of the if-else-...-else chain
    } else {
      // Last clause in the chain, find the starting if and wrap it up
      var pi = index;
      while (children?.[pi]?.openingElement?.name?.name === "$else") --pi;
      const prevNode = children?.[pi];
      if (prevNode?.openingElement?.name?.name !== "$if") {
        throw new Error(`No previous <$if> for ${openText}`);
      }
      if (testAttr) text.appendLeft(node.end, "null");
      wrapCodeForParent(text, { start: prevNode.start, end: node.end }, parent);
    }
  },

  "$else": function(plugin, text, node, parent, prop, index) {
    elementNameHandlers.$if(plugin, text, node, parent, prop, index);
  },

  // Rewrite <$let var="id" value={expr}/>...</$let>
  // to <>{((id) => <>...</>)((expr))}</>
  $let: function(plugin, text, node, parent) {
    const { openingElement: open, closingElement: close } = node;
    const openText = text.slice(open.start, open.end);
    plugin.debug(`Rewriting ${openText}`);

    const { var: varAttr, value: valAttr, ...extraNodes } = Object.fromEntries(
      open.attributes.map(a => [a.name.name, a])
    );
    if (varAttr?.value?.type !== "Literal") {
      throw new Error(`Need var="name" in ${openText}`);
    }
    if (valAttr?.value?.type !== "JSXExpressionContainer") {
      throw new Error(`Need value={expression} in ${openText}`);
    }
    if (extraNodes.length > 0) {
      throw new Error(`Bad attribute in ${openText}`);
    }

    const varText = varAttr.value.value;
    // TODO: validate varText as above

    const valueExpr = valAttr.value.expression;
    const valueText = text.slice(valueExpr.start, valueExpr.end);
    text.overwrite(open.start, open.end, `((${varText}) => `);
    wrapChildrenForCode(text, node);
    if (close) text.remove(close.start, close.end);
    text.appendLeft(node.end, `)((${valueText}))`);
    wrapCodeForParent(text, node, parent);
  },
};

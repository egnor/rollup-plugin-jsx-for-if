import * as estreeWalker from "estree-walker"; 
import MagicString from "magic-string";
import pluginUtils from "@rollup/pluginutils";

export default function rollupJsxForIf({ include, exclude } = {}) {
  const filter = pluginUtils.createFilter(include, exclude);
  const firstPass = /\$(if|for)\b/;

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
    const tagNode = node.openingElement;
    if (
      tagNode.name.type !== "JSXIdentifier" ||
      !tagNode.name.name.startsWith("$")
    ) {
      return;
    }

    const tagText = codeText.slice(tagNode.start, tagNode.end);
    const attrNodes = {};
    for (const a of tagNode.attributes) {
      if (a.type === "JSXAttribute") {
        attrNodes[a.name.name] = a;
      }
    }

    // Rewrite <$if test={expr}>...</$if> to <>{(expr) ? <>...</> : null}</>
    if (tagNode.name.name === "$if") {
      pluginContext.debug(`Rewriting ${tagText}`);

      const { test: testNode, ...extraNodes } = attrNodes;
      if (testNode?.value?.type !== "JSXExpressionContainer") {
        throw new Error(`Need test={expression} in ${tagText}`);
      }
      if (extraNodes.length > 0) {
        throw new Error(`Bad attribute in ${tagText}`);
      }

      codeText.overwrite(
        tagNode.start, testNode.value.expression.start, "<>{("
      );

      codeText.overwrite(
        testNode.value.expression.end, tagNode.end, ") ? <>"
      );

      codeText.overwrite(
        node.closingElement.start, node.closingElement.end, "</> : null}</>"
      );
    }

    // Rewrite <$for var="id" of={expr}>...</$for>
    // to <>{(expr).map((id) => <>...</>)}</>
    if (tagNode.name.name === "$for") {
      pluginContext.debug(`Rewriting ${tagText}`);

      const { var: varNode, of: ofNode, ...extraNodes } = attrNodes;
      if (varNode?.value?.type !== "Literal") {
        throw new Error(`Need var="name" in ${tagText}`);
      }
      if (ofNode?.value?.type !== "JSXExpressionContainer") {
        throw new Error(`Need of={expression} in ${tagText}`);
      }
      if (extraNodes.length > 0) {
        throw new Error(`Bad attribute in ${tagText}`);
      }

      codeText.overwrite(
        tagNode.start, ofNode.value.expression.start, "<>{("
      );
      codeText.overwrite(
        ofNode.value.expression.end, tagNode.end,
        `).map((${varNode.value.value}) => <>`
      );
      codeText.overwrite(
        node.closingElement.start, node.closingElement.end, "</>)}</>"
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
    if (["$if", "$for"].includes(node.arguments[0].value)) {
      pluginContext.debug(`Rewriting ${codeText.slice(node.start, node.end)}`);
      codeText.overwrite(node.start, node.end, "{}");
    }
  },
};

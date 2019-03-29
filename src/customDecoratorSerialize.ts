import ts from "typescript";

namespace decoratorInfo {
  // Structured decorator info
  export interface Decorator {
    name: string;
    args: ArgumentListItem[];
  }

  // The description of decorator auguments.
  export type ArgumentListItem =
    | LiteralContent
    | EnumContent
    | ChainContent
    | ObjectContent
    | NullContent
    | ErrorContent
    | IdentifierContent
    | BooleanContent;

  type LiteralContent = {
    type: "string literal" | "numeric literal";
    value: string;
  };

  type BooleanContent = {
    type: "boolean";
    value: "true" | "false";
  };

  type IdentifierContent = {
    type: "identifier";
    value: string;
  };

  type EnumContent = {
    type: "property";
    value: number | string;
  };

  type ObjectContent = {
    type: "object";
    value: any;
  };

  type ChainContent = {
    type: "propertyAccessRaw";
    value: string[];
  };

  type NullContent = {
    type: "null";
  };

  type ErrorContent = {
    type: "error";
    value: string;
  };
}

export namespace customDecoratorSerilize {
  /**
   * The utility function to provide a default serialization of decorators.
   * But only the decorators named in string list will be used.
   *
   * @export
   * @param {string[]} decoratorNameList
   * @returns
   */
  export function serializeLiteralDecorator(decoratorNameList: string[]) {
    return (node: ts.Decorator) => {
      return serializeDecoratorNode(node, decoratorNameList);
    };
  }

  /**
   * Process decorator node of TS AST and return structured node details.
   *
   * @param {ts.Decorator} node
   * @returns {DecoratorDescriptor}
   */
  function serializeDecoratorNode(
    node: ts.Decorator,
    decoratorNameList: string[]
  ): decoratorInfo.Decorator | undefined {
    let structuredAugs: decoratorInfo.ArgumentListItem[] = [];
    const decoratorName = getDecoratorName(node);
    if (decoratorNameList.indexOf(decoratorName) < 0) {
      return undefined;
    }
    if (ts.isIdentifier(node.expression)) {
      // No argument for decorator.
    } else {
      const expression = node.expression as ts.CallExpression;
      expression.arguments.map(serializeArgument).forEach(content => {
        structuredAugs.push(content);
      });
    }

    return { name: decoratorName, args: structuredAugs };
  }

  /**
   * Get the name string of decorator.
   *
   * @param {ts.Decorator} node
   * @returns {string}
   */
  function getDecoratorName(node: ts.Decorator): string {
    let decoratorName: string;
    if (ts.isIdentifier(node.expression)) {
      // No argument for decorator.
      decoratorName = node.expression.text;
    } else {
      const expression = node.expression as ts.CallExpression;
      decoratorName = (expression.expression as ts.Identifier).text;
    }
    return decoratorName;
  }

  /**
   * Serialize object literal ts node into json object.
   * 
   * NOTE: This will only serialize object literal with primitive type properties.
   *
   * @param {ts.ObjectLiteralExpression} node
   * @returns {string}
   */
  function serializeObjectLiteral(node: ts.ObjectLiteralExpression): string {
    const printer = ts.createPrinter();
    const result = printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
    return result;
  }

  /**
   * Because the point expressions in TS AST can be nested structured.
   * This function flatten the relationship and return an array of each property.
   *
   * @param {string[]} chain
   * @param {ts.PropertyAccessExpression} node
   */
  function getExpressionReverse(
    chain: string[],
    node: ts.PropertyAccessExpression
  ) {
    chain.push(node.name.text);

    if (!ts.isIdentifier(node.expression)) {
      getExpressionReverse(
        chain,
        node.expression as ts.PropertyAccessExpression
      );
    } else {
      chain.push(node.expression.text);
    }
  }

  /**
   * Parse the statement of param in a function invoking.
   *
   * @param {(ts.Expression | undefined)} contentNode
   * @returns {AugumentListItem}
   */
  function serializeArgument(
    contentNode: ts.Expression | undefined
  ): decoratorInfo.ArgumentListItem {
    // ts.Identifier | ts.PropertyAccessExpression | undefined

    let content: decoratorInfo.ArgumentListItem;

    if (!contentNode) {
      content = { type: "null" };
    } else {
      switch (contentNode.kind) {
        case ts.SyntaxKind.StringLiteral:
          content = {
            type: "string literal",
            value: (contentNode as ts.LiteralExpression).text
          };
          break;
        case ts.SyntaxKind.NumericLiteral:
          content = {
            type: "numeric literal",
            value: (contentNode as ts.LiteralExpression).text
          };
          break;
        case ts.SyntaxKind.TrueKeyword:
          content = {
            type: "boolean",
            value: "true"
          };
          break;
        case ts.SyntaxKind.FalseKeyword:
          content = {
            type: "boolean",
            value: "false"
          };
          break;
        case ts.SyntaxKind.Identifier:
          content = {
            type: "identifier",
            value: (contentNode as ts.Identifier).text
          };
          break;
        case ts.SyntaxKind.ObjectLiteralExpression:
          content = {
            type: "object",
            value: serializeObjectLiteral(
              contentNode as ts.ObjectLiteralExpression
            )
          };
          break;
        case ts.SyntaxKind.PropertyAccessExpression:
          const chain = [] as string[];
          getExpressionReverse(
            chain,
            contentNode as ts.PropertyAccessExpression
          );
          const entityChain = chain.reverse();
          content = { type: "propertyAccessRaw", value: entityChain };
          break;
        default:
          content = { type: "error", value: "unidentified node" };
      }
    }

    return content;
  }
}

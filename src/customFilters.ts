import ts from "typescript";

export namespace customEntryFilters {
  /**
   * Return `true` if class is decorated by a decorator named `decoratorName`.
   *
   * @param {ts.ClassDeclaration} node
   * @param {string} decoratorName
   * @returns {boolean}
   */
  export function isDecoratedBy(
    decoratorName: string
  ): (node: ts.ClassDeclaration) => boolean {
    return node => {
      let isIncludeSpecificDecor = false;
      node.decorators &&
        node.decorators.forEach(decorator => {
          if (
            ts.isIdentifier(decorator.expression) &&
            decorator.expression.getText() === decoratorName
          ) {
            isIncludeSpecificDecor = true;
          } else if (
            ts.isCallExpression(decorator.expression) &&
            decorator.expression.expression.getText() === decoratorName
          ) {
            isIncludeSpecificDecor = true;
          }
        });
      return isIncludeSpecificDecor;
    };
  }
}


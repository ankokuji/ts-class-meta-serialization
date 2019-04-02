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
    decoratorNameList: string[]
  ): (node: ts.ClassDeclaration) => boolean {
    return node => {
      let isIncludeSpecificDecor = false;
      node.decorators &&
        node.decorators.forEach(decorator => {
          if (
            ts.isIdentifier(decorator.expression) &&
            decoratorNameList.indexOf(decorator.expression.getText()) > -1
          ) {
            isIncludeSpecificDecor = true;
          } else if (
            ts.isCallExpression(decorator.expression) &&
            decoratorNameList.indexOf(decorator.expression.expression.getText()) > -1
          ) {
            isIncludeSpecificDecor = true;
          }
        });
      return isIncludeSpecificDecor;
    };
  }
}

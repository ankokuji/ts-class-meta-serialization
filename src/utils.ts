/**
 * Transform function into a curried function with 2 parameters.
 *
 * @export
 * @param {Function} func
 * @returns
 */
export const curryRight2 = <T, U, V>(func: (arg1: T, arg2: U) => V) => (
  arg2: U
) => (arg1: T): V => func(arg1, arg2);

/**
 * Transform function into a curried function with 3 parameters.
 *
 * @export
 * @param {Function} func
 * @returns
 */
export const curryRight3 = <T, U, V, W>(
  func: (arg1: T, arg2: U, arg3: V) => W
) => (arg3: V) => (arg2: U) => (arg1: T): W => func(arg1, arg2, arg3);

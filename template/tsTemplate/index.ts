import { ModuleA as AliasOfA, Enum1 } from "./fds";
import SS from "./modules"
function Component(flag: boolean) {
  return function(constructor: Function) {
    console.log(flag);
  }
}

class L {
  private name!: string
}

function Wheels(numOfWheels: number) {
  console.log('-- decorator factory invoked --');
  return function (constructor: Function) {
    console.log('-- decorator invoked --');
    constructor.prototype.wheels = numOfWheels;
  }
}

@Component(false)
@Wheels(4)
class Vechical {
  private _make: string;
  constructor(make: string) {
    console.log('-- this constructor invoked --');
    this._make = make;
  }
}

@Component(true)
class Parent {
  private ah: number;

  public detail!: AliasOfA;
  constructor() {
    this.ah = 1;
  }
  private sdf!: Enum1;
  private sha!: boolean;

  private haq!: { name: string; detail: L };
  protected func(a: string) {
    return 14;
  }

  public aaaaa!: SS;
}

/**
 * Documentation for C
 */
class C {
  /**
   * constructor documentation
   * @param a my parameter documentation
   * @param b another parameter documentation
   */
  constructor(a: string, b: C) {}

  private s: Enum1 = Enum1.sdjk;
}

class Child extends Parent {
  public func(a: string) {
    return 5 + super.func(a);
  }
}

const instance = new Child();

const a = instance.func("42w");

console.log(a);

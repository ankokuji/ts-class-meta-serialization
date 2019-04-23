import { ModuleA as AliasOfA, Enum1 } from "./fds";
import SS from "./modules"
function Component(flag: boolean) {
  return function(constructor: Function) {
    console.log(flag);
  }
}

class Generic<T> {
  private s!:T;
}

class GenericDep {
  private qq!: string;
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

class GenDep {
  private a!: string
}
@Component(true)
class Parent {
  // private ah: number;

  // public detail!: AliasOfA;
  // constructor() {
  //   this.ah = 1;
  // }
  // private sdf!: Enum1;
  // private sha!: boolean;

  private generic!: Generic<GenericDep>;

  // private ss!: string;
  // private hh!: number;
  // private uy!: boolean;

  private hb!: string[];
  private ho!: Array<GenDep>;

  @Prop({
    a: 2,
    b: 5,
    ds: a.dsg(),
    ha: L,
    dsf(a: string) {
      return "213";
    }
  })
  private haq!: { name: string; detail: L };
  protected func(a: string) {
    return 14;
  }

  @Prop("fdsjk")
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

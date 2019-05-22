import {A} from "./export";

type X<F> = F
type ds<T> = string | A | X<T>

@Component
class M {
  @Inject
  private ha!: ds<string>
}